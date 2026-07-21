// E2E test configuration. The remote environment pre-installs Chromium at
// PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers; if the revision this Playwright
// version wants is missing, fall back to the generic /opt/pw-browsers/chromium.
'use strict';
const { defineConfig } = require('@playwright/test');
const fs = require('fs');

const PORT = 8123;
const fallback = '/opt/pw-browsers/chromium'; // symlink to the chrome binary
const useFallback = fs.existsSync(fallback);

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions: useFallback ? { executablePath: fallback } : {},
  },
  webServer: {
    command: 'node server.js',
    port: PORT,
    env: { PORT: String(PORT) },
    reuseExistingServer: true,
  },
});
