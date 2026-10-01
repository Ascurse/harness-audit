import { defineConfig } from '@playwright/test';

const PORT = 4329;
// Совпадает с base в astro.config.mjs: в тестах пути относительные
const BASE_URL = `http://localhost:${PORT}/harness-audit/`;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  use: {
    baseURL: BASE_URL,
    // Системный Chrome: браузеры Playwright не скачиваем
    channel: 'chrome',
  },
  webServer: {
    command: `yarn build && yarn astro preview --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
  },
});
