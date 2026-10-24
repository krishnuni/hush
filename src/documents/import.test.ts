import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { createSampleBook, coverSvg } from './samples';
import { inspectDocument, prepareEpub, cleanCss, readZipResource } from './import';
import { validateArchive, safeArchivePath } from './archive';

describe('document import and isolation', () => {
  it('imports a real original EPUB with metadata and cover', async () => {
    const result = await inspectDocument(await createSampleBook());
    expect(result.entry.title).toBe('The Shape of Quiet');
    expect(result.entry.format).toBe('epub');
    expect(result.entry.hash).toHaveLength(64);
    expect(result.entry.cover).toMatch(/^data:image\/svg\+xml/);
  });
  it('sanitises scripts, external images and CSS without losing prose', async () => {
    const file = await createSampleBook();
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    zip.file(
      'OEBPS/chapter1.xhtml',
      '<html><head><title>Test</title><style>@import "https://tracker.invalid/a.css";</style></head><body><p onclick="bad()">Readable <em>text</em>.</p><script>bad()</script><img src="https://tracker.invalid/secret"/></body></html>',
    );
    const safe = await prepareEpub(await zip.generateAsync({ type: 'uint8array' }));
    const output = await JSZip.loadAsync(safe);
    const text = await output.file('OEBPS/chapter1.xhtml')!.async('string');
    expect(text).toContain('Readable');
    expect(text).toContain('<em>text</em>');
    expect(text).not.toContain('onclick');
    expect(text).not.toContain('<script');
    expect(text).not.toContain('tracker.invalid');
    expect(text).toContain("script-src 'none'");
  });
  it('rejects corrupt archives and unsafe paths', () => {
    expect(() => validateArchive(new Uint8Array([80, 75, 1, 2]))).toThrow();
    for (const path of ['../escape', '/absolute', 'C:/file', 'a\\b', 'a/../b'])
      expect(safeArchivePath(path)).toBe(false);
    expect(safeArchivePath('OEBPS/chapter.xhtml')).toBe(true);
  });
  it('rejects a huge inflated entry before decompression', async () => {
    const zip = new JSZip();
    zip.file('ok', 'x');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < bytes.length - 46; i++)
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, 0x7fffffff, true);
        break;
      }
    expect(() => validateArchive(bytes)).toThrow(/memory budget/);
  });
  it('stops actual inflation at the resource limit', async () => {
    const zip = new JSZip();
    zip.file('compressed', 'a'.repeat(1024 * 1024));
    const packed = await JSZip.loadAsync(
      await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
    );
    await expect(readZipResource(packed.file('compressed')!, 4096)).rejects.toThrow(
      /memory budget/,
    );
  });
  it('recognises PDF from bytes rather than its filename', async () => {
    const result = await inspectDocument(new File(['%PDF-1.7\nfixture'], 'wrong.epub'));
    expect(result.entry.format).toBe('pdf');
  });
  it('preserves EPUB navigation semantics while removing active content', async () => {
    const zip = await JSZip.loadAsync(await (await createSampleBook()).arrayBuffer());
    const output = await JSZip.loadAsync(
      await prepareEpub(await zip.generateAsync({ type: 'uint8array' })),
    );
    const nav = await output.file('OEBPS/nav.xhtml')!.async('string');
    expect(nav).toContain('epub:type="toc"');
    expect(nav).toContain('chapter3.xhtml');
  });
  it('rejects mixed DRM and font obfuscation rather than allowing encrypted prose', async () => {
    const zip = await JSZip.loadAsync(await (await createSampleBook()).arrayBuffer());
    zip.file(
      'META-INF/encryption.xml',
      '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/></enc:EncryptedData><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/></enc:EncryptedData></encryption>',
    );
    await expect(prepareEpub(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(
      /encryption/,
    );
  });
  it('rejects unrelated data without pretending it imported', async () => {
    await expect(inspectDocument(new File(['hello'], 'fake.pdf'))).rejects.toThrow(
      /not a supported/,
    );
  });
  it('removes remote CSS resources and protects fallback-cover text', () => {
    expect(cleanCss('p{background:url(https://tracker.invalid/x)}')).not.toContain('https://');
    expect(coverSvg('<script>bad</script>', 'forest')).not.toContain('<script>');
  });
});
