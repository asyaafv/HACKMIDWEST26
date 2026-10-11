/** Browser checks can use a private port so PR validation never reuses another checkout's frontend. */
import { defineConfig } from '@playwright/test';
const port = Number(process.env.GATE_BROWSER_TEST_PORT ?? 5173);
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  use: { baseURL, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}} : {channel:'chrome'}), viewport: { width: 1672, height: 941 }, reducedMotion: 'reduce', screenshot: 'only-on-failure' },
  webServer: { command: `npm run dev -- --port ${port} --strictPort`, url: baseURL, reuseExistingServer: !process.env.GATE_BROWSER_TEST_PORT },
});
