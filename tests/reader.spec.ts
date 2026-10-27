import { test, expect } from '@playwright/test';

test('original EPUB import, chapter navigation, appearance, bookmark and restart', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Make room for a good book.' })).toBeVisible();
  await page.getByRole('button', { name: /The Shape of Quiet.*Add to your library/ }).click();
  await expect(
    page.getByRole('button', { name: 'The Shape of Quiet Hush original samples' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'The Shape of Quiet Hush original samples' }).click();
  const book = page.frameLocator('.epub-view iframe');
  await expect(book.getByRole('heading', { name: 'The return' })).toBeVisible();
  expect(
    await book.locator('body').evaluate((body) =>
      Array.from(body.ownerDocument.fonts)
        .filter((font) => font.status === 'loaded')
        .map((font) => font.family),
    ),
  ).toContain('HushSerif');
  await page.getByRole('button', { name: 'Contents', exact: true }).click();
  await page.getByRole('button', { name: 'Where the light settles', exact: true }).click();
  await expect(book.getByRole('heading', { name: 'Where the light settles' })).toBeVisible();
  await expect(page.locator('.position-info')).toContainText('% of book');
  await expect
    .poll(async () => parseFloat(await page.locator('.position-info span').last().innerText()))
    .toBeLessThan(95);
  await page.getByRole('button', { name: 'Bookmark this position' }).click();
  await expect(page.getByRole('status')).toContainText('bookmarked');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: /Night/ }).click();
  await page.getByLabel('Font size', { exact: true }).focus();
  await page.getByLabel('Font size', { exact: true }).press('Home');
  for (let i = 0; i < 8; i++)
    await page.getByLabel('Font size', { exact: true }).press('ArrowRight');
  await page.getByRole('button', { name: 'Close appearance' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your reading room.' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.getByRole('button', { name: 'Continue The Shape of Quiet' }).click();
  await expect(book.getByRole('heading', { name: 'Where the light settles' })).toBeVisible();
  await page.screenshot({
    path: `test-results/${test.info().project.name}-reader.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('PDF text, page navigation, zoom and page restoration', async ({ page }) => {
  await page.goto('./');
  await page
    .getByLabel('Import EPUB or PDF documents')
    .setInputFiles('tests/fixtures/reading-test.pdf');
  await page.getByRole('button', { name: 'reading-test Unknown author' }).click();
  await expect(page.getByRole('contentinfo')).toContainText('1 of 3');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('contentinfo')).toContainText('2 of 3');
  await expect(page.locator('.textLayer')).toContainText('The second page');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('.pdf-zoom')).toContainText('115%');
  await expect(page.getByRole('status').filter({ hasText: 'Opening page' })).toHaveCount(0);
  await page.locator('.pdf-scroll').evaluate((node) => {
    node.scrollTop = Math.min(170, node.scrollHeight - node.clientHeight);
  });
  const savedY = await page.locator('.pdf-scroll').evaluate((node) => node.scrollTop);
  await page.getByRole('button', { name: 'Bookmark this position' }).click();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('contentinfo')).toContainText('3 of 3');
  await page.getByRole('button', { name: 'Show bookmarks' }).click();
  await page
    .getByRole('button', { name: /Page 2/ })
    .first()
    .click();
  await expect(page.getByRole('contentinfo')).toContainText('2 of 3');
  await expect
    .poll(() => page.locator('.pdf-scroll').evaluate((node) => node.scrollTop))
    .toBeCloseTo(savedY, 0);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-pdf.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your reading room.' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Continue reading-test', exact: true }).click();
  await expect(page.getByRole('contentinfo')).toContainText('2 of 3');
  await expect(page.locator('.pdf-zoom')).toContainText('115%');
  await page.getByRole('button', { name: 'Rotate page', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('.pdf-page canvas')
        .evaluate((canvas: HTMLCanvasElement) => canvas.width / canvas.height),
    )
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Continue reading-test', exact: true }).click();
  await expect(page.getByRole('contentinfo')).toContainText('2 of 3');
  await expect(page.locator('.pdf-zoom')).toContainText('115%');
  await expect
    .poll(() =>
      page
        .locator('.pdf-page canvas')
        .evaluate((canvas: HTMLCanvasElement) => canvas.width / canvas.height),
    )
    .toBeGreaterThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('corrupt import reports a useful error without adding a book', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Import EPUB or PDF documents').setInputFiles({
    name: 'bad.epub',
    mimeType: 'application/epub+zip',
    buffer: Buffer.from('not a real book'),
  });
  await expect(page.getByRole('alert')).toContainText('not a supported');
  await expect(page.getByRole('heading', { name: 'Make room for a good book.' })).toBeVisible();
});
