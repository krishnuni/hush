/** Actual production screenshots, original publications and optional real inference. */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const base = process.env.HUSH_BASE_PATH ?? '/hush/';
const url = `http://127.0.0.1:1420${base}`;
const server = spawn(process.execPath, ['scripts/serve-preview.mjs', '--base', base], {
  stdio: 'ignore',
});
let browser;
try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({
    ...(process.env.HUSH_CHROMIUM_PATH ? { executablePath: process.env.HUSH_CHROMIUM_PATH } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1040 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (error) => {
    if (!error.message.includes('ResizeObserver')) errors.push(error.message);
  });
  await mkdir('docs/images', { recursive: true });
  const capture = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(550); // Finite scene transition, not a simulated application state.
    await page.screenshot({
      path: `docs/images/${name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)))
      throw new Error(`Horizontal overflow in ${name}`);
  };
  await page.goto(url);
  await page.getByRole('heading', { name: 'Make room for a good book.' }).waitFor();
  await capture('library-empty');
  for (const [index, title] of [
    'The Shape of Quiet',
    'Letters from the Estuary',
    'Small Celestial Bodies',
  ].entries()) {
    await page
      .getByRole('button', { name: `${title} — 0${index + 1} — Add to your library`, exact: true })
      .click();
    await page
      .getByRole('button', { name: `${title} Hush original samples`, exact: true })
      .waitFor();
  }
  await page
    .getByRole('button', { name: 'The Shape of Quiet Hush original samples', exact: true })
    .click();
  await page.getByRole('button', { name: 'Contents', exact: true }).click();
  await page.getByRole('button', { name: 'A room by the water', exact: true }).click();
  await page
    .frameLocator('.epub-view iframe')
    .getByRole('heading', { name: 'A room by the water' })
    .waitFor();
  await capture('reader-light');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await capture('appearance-desktop');
  await page.getByRole('button', { name: 'Close appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Continue The Shape of Quiet', exact: true }).waitFor();
  await capture('library-desktop');
  await page.setViewportSize({ width: 3440, height: 1440 });
  await capture('library-ultrawide');
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('library-mobile');
  await page.getByRole('button', { name: 'Continue The Shape of Quiet', exact: true }).click();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await capture('appearance-mobile');
  await page.getByRole('button', { name: 'Close appearance', exact: true }).click();
  await capture('reader-mobile');
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Night', exact: true }).click();
  await page.getByRole('button', { name: 'Close appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Listen', exact: true }).click();
  await capture('voice-setup');
  if (process.env.HUSH_CAPTURE_VOICE) {
    await page.getByRole('button', { name: /Enable browser voice/ }).click();
    await page
      .getByText('Your browser voice is ready. Open a book and choose Listen.', { exact: true })
      .waitFor({ timeout: 180000 });
    await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    await page.getByRole('button', { name: 'Listen', exact: true }).click();
    await page
      .getByRole('button', { name: 'Pause narration', exact: true })
      .waitFor({ timeout: 120000 });
    await capture('reader-night');
    await page.getByRole('button', { name: 'Pause narration', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('narration-mobile');
    await page.getByRole('button', { name: 'Audio options', exact: true }).click();
    await capture('audio-options-mobile');
    await page.getByRole('button', { name: 'Stop narration', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    await capture('reader-night');
  }
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1040 });
  await capture('library-night');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    'Production screenshots captured at desktop, phone and ultrawide sizes; no overflow or page errors.',
  );
} finally {
  await browser?.close();
  server.kill();
}
