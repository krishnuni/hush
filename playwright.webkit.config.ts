import { defineConfig, devices } from '@playwright/test';
const base = process.env.HUSH_BASE_PATH ?? '/';
export default defineConfig({
  testDir: './tests',
  testMatch: ['reader.spec.ts', 'web-voice.spec.ts'],
  outputDir: 'test-results/webkit',
  timeout: 180000,
  expect: { timeout: 30000 },
  workers: 1,
  use: { baseURL: `http://127.0.0.1:1420${base}`, trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run preview -- --port 1420',
    url: `http://127.0.0.1:1420${base}`,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'] } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 13'] } },
  ],
});
