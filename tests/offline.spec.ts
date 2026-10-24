import { test, expect } from '@playwright/test';
test('installed reader shell reopens a local EPUB and PDF without a network', async ({
  page,
  context,
}) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.getByRole('button', { name: /The Shape of Quiet.*Add to your library/ }).click();
  await page
    .getByLabel('Import EPUB or PDF documents')
    .setInputFiles('tests/fixtures/reading-test.pdf');
  await expect(page.getByRole('button', { name: 'reading-test Unknown author' })).toBeVisible();
  const path = new URL(page.url()).pathname;
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe(path);
  const shellUrls = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (
      await Promise.all(
        keys
          .filter((key) => key.startsWith('hush-shell-'))
          .map(async (key) =>
            (await (await caches.open(key)).keys()).map((request) => request.url),
          ),
      )
    ).flat();
  });
  expect(shellUrls.every((url) => new URL(url).pathname.startsWith(path))).toBe(true);
  if (path !== '/')
    expect((await page.request.get('/fonts/NotoSerif-Regular.ttf')).status()).toBe(404);
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole('button', { name: 'The Shape of Quiet Hush original samples', exact: true })
    .click();
  await expect(
    page.frameLocator('.epub-view iframe').getByRole('heading', { name: 'The return' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'reading-test Unknown author', exact: true }).click();
  await expect(page.locator('.textLayer')).toContainText('A page by the water');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('contentinfo')).toContainText('2 of 3');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
