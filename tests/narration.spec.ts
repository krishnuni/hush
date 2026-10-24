import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import JSZip from 'jszip';

test('real local neural audio plays, highlights, pauses, seeks and resumes', async ({ page }) => {
  test.skip(
    !process.env.HUSH_VOICE_WORKER,
    'Requires the real local neural worker and verified voice pack.',
  );
  test.setTimeout(180000);
  const synthesisRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/__hush/voice/synthesize')) {
      try {
        synthesisRequests.push(JSON.parse(request.postData() ?? '{}').text);
      } catch {}
    }
  });
  await page.addInitScript(() => {
    const Original = window.Audio;
    const audios: HTMLAudioElement[] = [];
    Object.assign(window, { __hushAudio: audios, __hushPeak: 0, __hushPcm: [] });
    window.Audio = function (src?: string) {
      const audio = new Original(src);
      audios.push(audio);
      const context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const capture = context.createScriptProcessor(2048, 1, 1);
      capture.onaudioprocess = (event) => {
        const samples = event.inputBuffer.getChannelData(0);
        const out = event.outputBuffer.getChannelData(0);
        out.set(samples);
        const w = window as unknown as { __hushPeak: number; __hushPcm: number[] };
        if (!audio.paused) {
          w.__hushPeak = Math.max(w.__hushPeak, ...samples.map(Math.abs));
          if (w.__hushPcm.length < context.sampleRate * 15) w.__hushPcm.push(...samples);
        }
      };
      source.connect(capture);
      capture.connect(context.destination);
      audio.addEventListener('play', () => void context.resume());
      return audio;
    } as unknown as typeof Audio;
  });
  await page.goto('./');
  await expect
    .poll(async () => {
      const r = await page.request.get('/__hush/voice/status');
      return (await r.json()).available;
    })
    .toBe(true);
  await page.getByRole('button', { name: /The Shape of Quiet.*Add to your library/ }).click();
  await page.getByRole('button', { name: 'The Shape of Quiet Hush original samples' }).click();
  await expect(
    page.frameLocator('.epub-view iframe').getByRole('heading', { name: 'The return' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause narration' })).toBeVisible();
  await page.getByLabel('Narration speed').selectOption('0.75');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __hushPeak: number }).__hushPeak))
    .toBeGreaterThan(0.01);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const a = (window as unknown as { __hushAudio: HTMLAudioElement[] }).__hushAudio.at(-1);
          return (
            !!a &&
            !a.paused &&
            a.duration > 2 &&
            a.currentTime > 0.4 &&
            a.currentTime < a.duration - 0.5
          );
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Pause narration' }).click();
  await expect(page.getByRole('button', { name: 'Play narration' })).toBeVisible();
  expect(
    await page.evaluate(() => {
      const a = (window as unknown as { __hushAudio: HTMLAudioElement[] }).__hushAudio.at(-1)!;
      return a.paused && a.currentTime > 0;
    }),
  ).toBe(true);
  await page.getByRole('button', { name: 'Next sentence' }).click();
  await expect(page.getByRole('button', { name: 'Pause narration' })).toBeVisible();
  await expect(page.locator('.hush-current-sentence')).toHaveCount(1);
  await expect
    .poll(
      () => page.evaluate(() => (window as unknown as { __hushPcm: number[] }).__hushPcm.length),
      { timeout: 15000 },
    )
    .toBeGreaterThan(160000);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-narration.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Pause narration' }).click();
  const captured = await page.evaluate(() => ({
    pcm: (window as unknown as { __hushPcm: number[] }).__hushPcm,
    rate: new AudioContext().sampleRate,
  }));
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your reading room.' })).toBeVisible();
  const savedOffset = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('hush-reading-room');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('books').objectStore('books').getAll();
          request.onsuccess = () => {
            resolve(request.result[0].listening.offset);
            db.close();
          };
        };
      }),
  );
  expect(savedOffset).toBeGreaterThan(0);
  const savedText = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('hush-reading-room');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const get = db.transaction('books').objectStore('books').getAll();
          get.onsuccess = () => {
            resolve(get.result[0].listening.locator.quote);
            db.close();
          };
        };
      }),
  );
  await page.reload();
  synthesisRequests.length = 0;
  await page.getByRole('button', { name: 'Continue The Shape of Quiet' }).click();
  await expect(
    page.frameLocator('.epub-view iframe').getByRole('heading', { name: 'The return' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause narration' })).toBeVisible();
  await expect(page.getByLabel('Narration speed')).toHaveValue('0.75');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __hushAudio: HTMLAudioElement[] }).__hushAudio.at(-1)!
            .currentTime,
      ),
    )
    .toBeGreaterThanOrEqual(Math.max(0, savedOffset - 0.15));
  expect(synthesisRequests).not.toContain(savedText);
  await page.getByRole('button', { name: 'Stop narration' }).click();
  await expect(page.getByRole('region', { name: 'Narration controls' })).toHaveCount(0);
  // This is the app's actual media output, captured before the physical device.
  const bytes = Buffer.alloc(44 + captured.pcm.length * 2);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(captured.rate, 24);
  bytes.writeUInt32LE(captured.rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  captured.pcm.forEach((v, i) =>
    bytes.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2),
  );
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/${test.info().project.name}-app-output.wav`, bytes);
});

test('real narration continues across an EPUB spine boundary', async ({ page }) => {
  test.skip(
    !process.env.HUSH_VOICE_WORKER,
    'Requires the real local neural worker and verified pack.',
  );
  test.setTimeout(180000);
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  zip.file(
    'book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:hush:continuity</dc:identifier><dc:title>Between rooms</dc:title><dc:creator>Hush</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>',
  );
  zip.file(
    'nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="one.xhtml">First room</a></li><li><a href="two.xhtml">Second room</a></li></ol></nav></body></html>',
  );
  zip.file(
    'one.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>First room</title></head><body><p>The first room was quiet.</p></body></html>',
  );
  zip.file(
    'two.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Second room</title></head><body><p>A little light filled the second room.</p></body></html>',
  );
  await page.goto('./');
  await expect
    .poll(async () => (await (await page.request.get('/__hush/voice/status')).json()).available, {
      timeout: 45000,
    })
    .toBe(true);
  await page.getByLabel('Import EPUB or PDF documents').setInputFiles({
    name: 'Between rooms.epub',
    mimeType: 'application/epub+zip',
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
  });
  await page.getByRole('button', { name: 'Between rooms Hush', exact: true }).click();
  await expect(page.frameLocator('.epub-view iframe').locator('body')).toContainText(
    'first room was quiet',
  );
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause narration' })).toBeVisible();
  await page.getByLabel('Narration speed').selectOption('1.5');
  await expect(page.frameLocator('.epub-view iframe').locator('body')).toContainText(
    'light filled the second room',
    { timeout: 60000 },
  );
  await expect(page.locator('.hush-current-sentence')).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toContainText('Second room');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Stop narration' }).click();
});
