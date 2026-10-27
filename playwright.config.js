// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mapping-edits\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Specs that edit the seeded mappings run after all the others, which expect the seeds
    {
      name: 'mapping-edits',
      testMatch: /mapping-edits\.spec\.js/,
      dependencies: ['chromium'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm start',
    // Mounts the test-only setup routes the Import tests use (server/src/routes/testSupport.js)
    env: { ENABLE_TEST_ROUTES: 'true' },
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
