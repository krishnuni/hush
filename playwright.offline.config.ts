import { defineConfig, devices } from '@playwright/test';
const base = process.env.HUSH_BASE_PATH ?? '/';
if (!/^\/(?:[a-zA-Z0-9._~-]+\/)*$/.test(base)) throw new Error('Invalid test base path.');
export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results/offline',
  testMatch: 'offline.spec.ts',
  timeout: 90000,
  expect: { timeout: 20000 },
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:1421${base}`,
    trace: 'retain-on-failure',
    launchOptions: process.env.HUSH_CHROMIUM_PATH
      ? { executablePath: process.env.HUSH_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: `node scripts/serve-preview.mjs --port 1421 --base ${base}`,
    url: `http://127.0.0.1:1421${base}`,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
