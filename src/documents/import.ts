import JSZip from 'jszip';
import DOMPurify from 'dompurify';
import { MAX_DOCUMENT_BYTES, MAX_ENTRY_BYTES, validateArchive } from './archive';
import type { BookEntry } from '../domain/types';

const parser = () => new DOMParser();
function xml(text: string): Document {
  const doc = parser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror'))
    throw new Error('The EPUB contains invalid document metadata.');
  return doc;
}
function resolveResource(base: string, href: string): string {
  const url = new URL(href, `https://book.local/${base}`);
  if (url.origin !== 'https://book.local')
    throw new Error('An EPUB resource points outside the book.');
  return decodeURIComponent(url.pathname.slice(1));
}
async function zipText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new Error(`The EPUB is missing a required resource: ${path}`);
  return new TextDecoder().decode(await readZipResource(file));
}

/** Stop inflation before accumulating an oversized resource, even if its ZIP header lies. */
export function readZipResource(
  file: JSZip.JSZipObject,
  limit = MAX_ENTRY_BYTES,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    // This documented ZipObject API is absent from JSZip's bundled declaration.
    const chunks: Uint8Array[] = [];
    let size = 0;
    let failed = false;
    const stream = (
      file as JSZip.JSZipObject & {
        internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>;
      }
    ).internalStream('uint8array');
    stream.on('data', (chunk: Uint8Array) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        stream.pause();
        reject(new Error('The EPUB resources exceed the memory budget.'));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', (error: Error) => {
      if (!failed) {
        failed = true;
        reject(error);
      }
    });
    stream.on('end', () => {
      if (failed) return;
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(bytes);
    });
    stream.resume();
  });
}

export function cleanCss(css: string): string {
  return css
    .replace(/@import[^;]+;?/gi, '')
    .replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi, (whole, _q, href: string) =>
      /^(?:https?:|\/\/|javascript:|file:|data:text\/html)/i.test(href) ? 'none' : whole,
    )
    .replace(/(?:expression\s*\([^)]*\)|-moz-binding\s*:[^;]+;?|behavior\s*:[^;]+;?)/gi, '');
}

export async function prepareEpub(bytes: Uint8Array): Promise<Uint8Array> {
  validateArchive(bytes);
  const zip = await JSZip.loadAsync(bytes);
  if (zip.file('META-INF/encryption.xml')) {
    const encryption = await zipText(zip, 'META-INF/encryption.xml');
    const encrypted = xml(encryption);
    const methods = Array.from(encrypted.getElementsByTagNameNS('*', 'EncryptionMethod'));
    const fontObfuscation = new Set([
      'http://www.idpf.org/2008/embedding',
      'http://ns.adobe.com/pdf/enc#RC',
    ]);
    if (
      !methods.length ||
      methods.some((method) => !fontObfuscation.has(method.getAttribute('Algorithm') ?? ''))
    )
      throw new Error('This EPUB appears to use content encryption. Hush does not remove DRM.');
  }
  const resources = Object.values(zip.files).filter((file) => !file.dir);
  let actualBytes = 0;
  for (const file of resources) {
    // Verify actual decompressed lengths, including resources whose ZIP headers lie.
    const raw = await readZipResource(
      file,
      Math.min(MAX_ENTRY_BYTES, 256 * 1024 * 1024 - actualBytes),
    );
    actualBytes += raw.byteLength;
    if (raw.byteLength > MAX_ENTRY_BYTES || actualBytes > 256 * 1024 * 1024)
      throw new Error('The EPUB resources exceed the memory budget.');
    if (/\.(?:x?html?|svg)$/i.test(file.name)) {
      const isSvg = /\.svg$/i.test(file.name);
      const clean = DOMPurify.sanitize(new TextDecoder().decode(raw), {
        WHOLE_DOCUMENT: !isSvg,
        USE_PROFILES: isSvg ? { svg: true, svgFilters: true } : { html: true, svg: true },
        ADD_ATTR: ['epub:type', 'xmlns:epub'],
        FORBID_TAGS: [
          'script',
          'iframe',
          'object',
          'embed',
          'form',
          'input',
          'button',
          'video',
          'audio',
          'base',
        ],
        FORBID_ATTR: ['srcset', 'formaction', 'action', 'autofocus'],
      });
      const doc = parser().parseFromString(clean, isSvg ? 'image/svg+xml' : 'text/html');
      doc.querySelectorAll('style').forEach((style) => {
        style.textContent = cleanCss(style.textContent ?? '');
      });
      doc
        .querySelectorAll('[style]')
        .forEach((el) => el.setAttribute('style', cleanCss(el.getAttribute('style') ?? '')));
      doc.querySelectorAll('[src],[href],[xlink\\:href]').forEach((el) => {
        for (const attr of ['src', 'href', 'xlink:href']) {
          const value = el.getAttribute(attr);
          if (
            value &&
            /^(?:https?:|\/\/|file:)/i.test(value) &&
            !(el.tagName.toLowerCase() === 'a' && attr === 'href')
          )
            el.removeAttribute(attr);
        }
      });
      if (!isSvg) {
        const csp = doc.createElement('meta');
        csp.httpEquiv = 'Content-Security-Policy';
        csp.content =
          "default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob:; font-src blob: data:; script-src 'none'; connect-src 'none'; frame-src 'none'";
        doc.head.prepend(csp);
      }
      zip.file(file.name, new XMLSerializer().serializeToString(doc));
    } else if (/\.css$/i.test(file.name))
      zip.file(file.name, cleanCss(new TextDecoder().decode(raw)));
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

export async function inspectDocument(
  file: File,
): Promise<{ entry: BookEntry; bytes: Uint8Array }> {
  if (!file.size || file.size > MAX_DOCUMENT_BYTES)
    throw new Error('Choose a non-empty EPUB or PDF up to 50 MiB for this development build.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = new TextDecoder('ascii').decode(bytes.subarray(0, 8));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const entry: BookEntry = {
    id: crypto.randomUUID(),
    hash,
    title: file.name.replace(/\.(epub|pdf)$/i, ''),
    author: 'Unknown author',
    filename: file.name,
    format: 'epub',
    byteSize: file.size,
    addedAt: Date.now(),
    status: 'new',
    bookmarks: [],
  };
  if (signature.startsWith('%PDF-')) {
    entry.format = 'pdf';
    return { entry, bytes };
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Error('This file is not a supported EPUB or PDF document.');
  validateArchive(bytes);
  const zip = await JSZip.loadAsync(bytes);
  if ((await zipText(zip, 'mimetype')).trim() !== 'application/epub+zip')
    throw new Error('This ZIP file is not an EPUB publication.');
  const container = xml(await zipText(zip, 'META-INF/container.xml'));
  const packagePath = container.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
  if (!packagePath) throw new Error('The EPUB does not identify a content package.');
  const packageDoc = xml(await zipText(zip, packagePath));
  const metadata = packageDoc.getElementsByTagName('metadata')[0];
  entry.title =
    metadata?.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim().slice(0, 512) ||
    entry.title;
  entry.author =
    metadata?.getElementsByTagNameNS('*', 'creator')[0]?.textContent?.trim().slice(0, 512) ||
    entry.author;
  const rendition = Array.from(packageDoc.getElementsByTagName('meta')).find(
    (meta) => meta.getAttribute('property') === 'rendition:layout',
  );
  if (rendition?.textContent === 'pre-paginated')
    throw new Error(
      'Fixed-layout EPUB is not supported yet. Reflowable EPUB and PDF are supported.',
    );
  const items = Array.from(packageDoc.getElementsByTagName('item'));
  const coverId = Array.from(packageDoc.getElementsByTagName('meta'))
    .find((meta) => meta.getAttribute('name') === 'cover')
    ?.getAttribute('content');
  const coverItem =
    items.find((item) => item.getAttribute('properties')?.split(' ').includes('cover-image')) ??
    items.find((item) => item.id === coverId);
  if (coverItem) {
    try {
      const path = resolveResource(packagePath, coverItem.getAttribute('href') ?? '');
      const image = zip.file(path);
      const mime = coverItem.getAttribute('media-type') ?? '';
      if (image && /image\/(png|jpeg|webp|gif|svg\+xml)/.test(mime)) {
        const cover = await readZipResource(image, 512 * 1024);
        if (cover.length < 512 * 1024) {
          const content =
            mime === 'image/svg+xml'
              ? new TextEncoder().encode(
                  DOMPurify.sanitize(new TextDecoder().decode(cover), {
                    USE_PROFILES: { svg: true },
                  }),
                )
              : cover;
          const blob = new Blob([new Uint8Array(content)], { type: mime });
          entry.cover = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      }
    } catch {
      /* An invalid cover must not make an otherwise readable book unavailable. */
    }
  }
  // Eager security validation; persisted bytes remain the immutable original.
  await prepareEpub(bytes);
  return { entry, bytes };
}
