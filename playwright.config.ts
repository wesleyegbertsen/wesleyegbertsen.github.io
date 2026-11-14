import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// Browser: set PW_CHANNEL (for example "msedge" or "chrome") to use an installed browser. Without it,
// Windows outside CI uses the Edge that ships with Windows (no download needed); everywhere else
// uses Playwright's own Chromium (`npx playwright install chromium`).
const channel = process.env.PW_CHANNEL || (process.platform === 'win32' && !process.env.CI ? 'msedge' : undefined);

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel, viewport: { width: 360, height: 740 } } },
  ],
  // Tests run against a fresh production build, like the deployed site. Never reuse a running
  // server: a leftover `vite preview` would silently serve an old build and skip the rebuild.
  // If the port is taken, the run fails loudly instead.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
