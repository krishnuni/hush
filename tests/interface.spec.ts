import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openSample(page: Page) {
  await page.goto('./');
  await page
    .getByRole('button', { name: 'The Shape of Quiet — 01 — Add to your library', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'The Shape of Quiet Hush original samples', exact: true })
    .click();
  await expect(
    page
      .frameLocator('.epub-view iframe')
      .getByRole('heading', { name: 'The return', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Bookmark this position', exact: true }),
  ).toBeEnabled();
}

test('library search, filters, editable metadata and keyboard settings', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const settings = page.getByRole('button', { name: 'Library settings', exact: true });
  await settings.focus();
  await settings.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(settings).toBeFocused();
  await page
    .getByRole('button', { name: 'The Shape of Quiet — 01 — Add to your library', exact: true })
    .click();
  await page.getByRole('button', { name: 'Manage The Shape of Quiet', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('A quieter title');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await page.getByRole('button', { name: 'Finished', exact: true }).click();
  await expect(page.getByText('A little space on this shelf.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'All books', exact: true }).click();
  await page.getByLabel('Search your books', { exact: true }).fill('no such title');
  await expect(page.getByText('No matching titles.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'A quieter title Hush original samples', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'A quieter title Hush original samples', exact: true }),
  ).toBeVisible();
});

test('reader tools contain focus, keep the reading measure and restore their trigger', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSample(page);
  const progress = page.locator('.position-info span').last();
  await expect(progress).toContainText('% of book');
  const initialPosition = parseFloat(await progress.innerText());
  await page.frameLocator('.epub-view iframe').locator('body').press('ArrowRight');
  await expect
    .poll(async () => parseFloat(await progress.innerText()))
    .toBeGreaterThan(initialPosition);
  const before = await page.locator('.reader-stage').boundingBox();
  const appearance = page.getByRole('button', { name: 'Appearance', exact: true });
  await expect(appearance).toBeEnabled();
  await appearance.focus();
  await appearance.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Appearance settings', exact: true });
  await expect(dialog).toBeVisible();
  expect((await page.locator('.reader-stage').boundingBox())?.width).toBe(before?.width);
  await page.getByRole('button', { name: 'Reset reading defaults', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close appearance', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(appearance).toBeFocused();
  await page.getByRole('button', { name: 'Focus mode', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Leave focus mode', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Leave focus mode', exact: true }).click();
  await expect(page.locator('.hush-app')).not.toHaveClass(/focus-mode/);
  const bookmark = page.getByRole('button', { name: 'Bookmark this position', exact: true });
  await bookmark.focus();
  await bookmark.press('Space');
  await expect(page.getByRole('status')).toContainText('bookmarked');
  await expect(page.getByRole('button', { name: 'Play narration', exact: true })).toHaveCount(0);
});

test('WCAG checks on the empty library and narration setup; no automatic model download', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const modelRequests: string[] = [];
  page.on('request', (request) => {
    if (/\.onnx|\.wasm|af_heart\.bin/.test(request.url())) modelRequests.push(request.url());
  });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Make room for a good book.' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const scan = () =>
    new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect((await scan()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Library settings', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: /Enable browser voice/ })).toBeVisible();
  expect(modelRequests).toEqual([]);
  expect((await scan()).violations).toEqual([]);
  for (const theme of ['Light', 'Night']) {
    await page.getByRole('button', { name: theme, exact: true }).click();
    expect((await scan()).violations).toEqual([]);
  }
});
