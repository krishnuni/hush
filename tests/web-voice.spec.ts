import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

declare global {
  interface Window {
    __voiceChoice: {
      peak: number;
      hash: string;
      downloads: string[];
      player: HTMLAudioElement | null;
    };
  }
}

test('voice choices produce distinct real audio, reuse the engine and reopen offline', async ({
  page,
  context,
}) => {
  test.skip(!process.env.HUSH_TEST_WEB_VOICE, 'Opt in to real WASM inference.');
  test.setTimeout(300000);
  await page.addInitScript(() => {
    const record = (window.__voiceChoice = {
      peak: 0,
      hash: '',
      downloads: [] as string[],
      player: null as HTMLAudioElement | null,
    });
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options) => {
      record.downloads.push(String(input));
      return originalFetch(input, options);
    };
    const OriginalAudio = window.Audio;
    window.Audio = function (src?: string) {
      const audio = new OriginalAudio(src);
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
      audio.addEventListener('loadedmetadata', async () => {
        if (!audio.src.startsWith('blob:')) return;
        const bytes = await (await originalFetch(audio.src)).arrayBuffer();
        record.hash = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          (byte) => byte.toString(16).padStart(2, '0'),
        ).join('');
      });
      return audio;
    } as unknown as typeof Audio;
  });
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.getByRole('button', { name: 'Library settings', exact: true }).click();
  const picker = page.getByRole('combobox', { name: 'Narrator voice', exact: true });
  await expect(picker.locator('option')).toHaveCount(28);
  await picker.selectOption('am_michael');
  expect(
    await page.evaluate(() =>
      window.__voiceChoice.downloads.filter((url) => /\.onnx|\.bin|\.wasm/.test(url)),
    ),
  ).toEqual([]);
  await page.getByRole('button', { name: /Enable browser voice/ }).click();
  const ready = page.getByText('Your browser voice is ready. Open a book and choose Listen.', {
    exact: true,
  });
  await expect(ready).toBeVisible({ timeout: 180000 });
  const downloads = await page.evaluate(() => window.__voiceChoice.downloads);
  expect(downloads.filter((url) => url.endsWith('.bin'))).toEqual([
    expect.stringContaining('am_michael.bin'),
  ]);
  const modelDownloads = downloads.filter((url) => url.endsWith('.onnx')).length;
  expect(modelDownloads).toBe(1);
  const preview = page.getByRole('button', { name: 'Preview voice', exact: true });
  await preview.click();
  await expect
    .poll(() => page.evaluate(() => window.__voiceChoice.peak), { timeout: 120000 })
    .toBeGreaterThan(0.01);
  await expect.poll(() => page.evaluate(() => window.__voiceChoice.hash)).toMatch(/^[a-f0-9]{64}$/);
  const michaelHash = await page.evaluate(() => window.__voiceChoice.hash);
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__voiceChoice.player?.paused)).toBe(true);
  await page.getByRole('button', { name: 'Library settings', exact: true }).click();
  await picker.selectOption('bf_emma');
  await page.getByRole('button', { name: 'Download Emma · 0.52 MB', exact: true }).click();
  await expect(ready).toBeVisible({ timeout: 120000 });
  expect(
    await page.evaluate(
      () => window.__voiceChoice.downloads.filter((url) => url.endsWith('.onnx')).length,
    ),
  ).toBe(modelDownloads);
  await page.evaluate(() => {
    window.__voiceChoice.peak = 0;
    window.__voiceChoice.hash = '';
  });
  await preview.click();
  await expect
    .poll(() => page.evaluate(() => window.__voiceChoice.peak), { timeout: 120000 })
    .toBeGreaterThan(0.01);
  await expect.poll(() => page.evaluate(() => window.__voiceChoice.hash)).toMatch(/^[a-f0-9]{64}$/);
  expect(await page.evaluate(() => window.__voiceChoice.hash)).not.toBe(michaelHash);
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Library settings', exact: true }).click();
  await expect(picker).toHaveValue('bf_emma');
  await picker.selectOption('am_michael');
  await preview.click();
  await expect
    .poll(() => page.evaluate(() => window.__voiceChoice.peak), { timeout: 120000 })
    .toBeGreaterThan(0.01);
  await expect.poll(() => page.evaluate(() => window.__voiceChoice.hash)).toBe(michaelHash);
  expect(
    await page.evaluate(() =>
      window.__voiceChoice.downloads.filter((url) => /\.onnx|\.bin|\.wasm/.test(url)),
    ),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
});

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
  // Changing the narrator preserves the source sentence, but must not reuse its old waveform.
  await page.getByRole('button', { name: 'Audio options', exact: true }).click();
  await page.getByRole('button', { name: 'Choose a voice', exact: true }).click();
  await page.getByRole('combobox', { name: 'Narrator voice', exact: true }).selectOption('bf_emma');
  await page.getByRole('button', { name: 'Download Emma · 0.52 MB', exact: true }).click();
  await expect(
    page.getByText('Your browser voice is ready. Open a book and choose Listen.', { exact: true }),
  ).toBeVisible({ timeout: 120000 });
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Listen', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause narration', exact: true })).toBeVisible({
    timeout: 120000,
  });
  await expect(
    page.getByText('Voice or saved audio changed; continuing from this sentence.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pause narration', exact: true }).click();
  await expect(page.getByLabel('Narration speed')).toHaveValue('0.75');
  await expect(page.frameLocator('.epub-view iframe').locator('body')).toContainText(
    'first room was quiet',
  );
  await page.getByLabel('Position in sentence').fill('0.5');
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
  // Exercise the actual PDF reading-order modal and the real installed model offline.
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page
    .getByLabel('Import EPUB or PDF documents')
    .setInputFiles('tests/fixtures/reading-test.pdf');
  await page.getByRole('button', { name: 'reading-test Unknown author', exact: true }).click();
  await expect(page.locator('.textLayer')).toContainText('A page by the water');
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'PDF reading order', exact: true })).toBeVisible();
  await expect(page.locator('.pdf-extracted-text')).toContainText('A page by the water');
  await page.evaluate(() => {
    (window as unknown as { __webVoiceCapture: { peak: number } }).__webVoiceCapture.peak = 0;
  });
  await page.getByRole('button', { name: 'Listen to this PDF', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause narration', exact: true })).toBeVisible({
    timeout: 120000,
  });
  await expect.poll(() => page.locator('.pdf-highlights span').count()).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __webVoiceCapture: { peak: number } }).__webVoiceCapture.peak,
      ),
    )
    .toBeGreaterThan(0.01);
  await page.getByRole('button', { name: 'Stop narration', exact: true }).click();
  expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  expect(
    requests
      .filter((r) => /^https?:/.test(r.url))
      .every((r) => new URL(r.url).origin === 'http://127.0.0.1:1420'),
  ).toBe(true);
  expect(errors.filter((e) => !e.includes('ResizeObserver'))).toEqual([]);
});
