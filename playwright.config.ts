import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: 'npx vite --port 5179 --strictPort',
    url: 'http://localhost:5179/demo/index.html',
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://localhost:5179',
    viewport: { width: 1280, height: 800 },
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
});
