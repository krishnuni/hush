import { defineConfig, devices } from '@playwright/test';
const base = process.env.HUSH_BASE_PATH ?? '/';
if (!/^\/(?:[a-zA-Z0-9._~-]+\/)*$/.test(base)) throw new Error('Invalid test base path.');
export default defineConfig({
  testDir: './tests',
  testIgnore: 'offline.spec.ts',
  fullyParallel: false,
  timeout: 180000,
  expect: { timeout: 30000 },
  workers: process.env.HUSH_VOICE_WORKER || process.env.HUSH_TEST_WEB_VOICE ? 1 : 2,
  use: {
    baseURL: `http://127.0.0.1:1420${base}`,
    trace: 'retain-on-failure',
    launchOptions: process.env.HUSH_CHROMIUM_PATH
      ? { executablePath: process.env.HUSH_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: process.env.HUSH_VOICE_WORKER ? 'npm run dev' : 'npm run preview -- --port 1420',
    url: `http://127.0.0.1:1420${base}`,
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
