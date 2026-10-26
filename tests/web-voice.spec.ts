import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

test('static browser neural voice plays real audio, continues chapters and reopens offline', async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.HUSH_TEST_WEB_VOICE,
    'Set HUSH_TEST_WEB_VOICE=1 to run real browser WASM inference.',
  );
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (request) =>
    requests.push({ url: request.url(), method: request.method(), body: request.postData() }),
  );
  await page.addInitScript(() => {
    const Original = window.Audio;
    const record = { peak: 0, player: null as HTMLAudioElement | null };
    Object.assign(window, { __webVoiceCapture: record });
    window.Audio = function (src?: string) {
      const audio = new Original(src);
      record.player = audio;
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      ctx.createMediaElementSource(audio).connect(analyser);
      analyser.connect(ctx.destination);
      const samples = new Float32Array(analyser.fftSize);
      setInterval(() => {
        if (!audio.paused) {
          analyser.getFloatTimeDomainData(samples);
          record.peak = Math.max(record.peak, ...samples.map(Math.abs));
        }
      }, 30);
      audio.addEventListener('play', () => void ctx.resume());
      return audio;
    } as unknown as typeof Audio;
  });
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  zip.file(
    'book.opf',
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:hush:web-voice</dc:identifier><dc:title>A browser room</dc:title><dc:creator>Hush</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>',
  );
  zip.file(
    'nav.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="one.xhtml">First room</a></li><li><a href="two.xhtml">Second room</a></li></ol></nav></body></html>',
  );
  zip.file(
    'one.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>First room</title></head><body><p>The first room was quiet, with a little book waiting by the window.</p></body></html>',
  );
  zip.file(
    'two.xhtml',
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Second room</title></head><body><p>A little light filled the second room.</p></body></html>',
  );
  await page.getByLabel('Import EPUB or PDF documents').setInputFiles({
    name: 'A browser room.epub',
    mimeType: 'application/epub+zip',
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
  });
  await page.getByRole('button', { name: 'A browser room Hush', exact: true }).click();
  await expect(page.frameLocator('.epub-view iframe').locator('body')).toContainText(
    'first room was quiet',
  );
  expect(requests.some((r) => r.url.endsWith('.onnx'))).toBe(false);
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /Enable browser voice/ }).click();
  await expect(
    page.getByText('Your browser voice is ready. Open a book and choose Listen.', { exact: true }),
  ).toBeVisible({ timeout: 180000 });
  await expect(page.locator('.voice-status')).toContainText('Local voice ready');
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause narration', exact: true })).toBeVisible({
    timeout: 120000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __webVoiceCapture: { peak: number } }).__webVoiceCapture.peak,
        ),
      { timeout: 30000 },
    )
    .toBeGreaterThan(0.01);
  await page.getByRole('button', { name: 'Pause narration', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play narration', exact: true })).toBeVisible();
  await page.getByLabel('Narration speed').selectOption('0.75');
  await page.getByLabel('Position in sentence').fill('0.5');
  await expect(page.locator('.hush-current-sentence')).toHaveCount(1);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your reading room.' })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Continue A browser room', exact: true }).click();
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause narration', exact: true })).toBeVisible({
    timeout: 120000,
  });
  await expect(page.getByLabel('Narration speed')).toHaveValue('0.75');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __webVoiceCapture: { player: HTMLAudioElement } })
            .__webVoiceCapture.player.currentTime,
      ),
    )
    .toBeGreaterThanOrEqual(0.5);
  await expect(page.frameLocator('.epub-view iframe').locator('body')).toContainText(
    'light filled the second room',
    { timeout: 120000 },
  );
  await expect(page.locator('.hush-current-sentence')).toHaveCount(1);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-web-neural.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Stop narration', exact: true }).click();
  const wave = await page.evaluate(
    () =>
      new Promise<number[]>((resolve, reject) => {
        const open = indexedDB.open('hush-audio-cache');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const r = db.transaction('audio').objectStore('audio').getAll();
          r.onsuccess = () => {
            resolve(Array.from(r.result[0] as Uint8Array));
            db.close();
          };
        };
      }),
  );
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/${test.info().project.name}-web-neural.wav`, Buffer.from(wave));
  expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  expect(
    requests
      .filter((r) => /^https?:/.test(r.url))
      .every((r) => new URL(r.url).origin === 'http://127.0.0.1:1420'),
  ).toBe(true);
  expect(errors.filter((e) => !e.includes('ResizeObserver'))).toEqual([]);
});
