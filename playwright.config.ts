import { defineConfig } from '@playwright/test';

/**
 * E2E runs against the test build (`npm run build:test`, which includes src/dev/testhooks.ts).
 * Headless Chromium renders with SwiftShader (a few fps), so specs drive the game with the
 * deterministic 60 Hz clock (`__jrr.advance`) and real DOM pointer events.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4174/',
    viewport: { width: 390, height: 780 },
    deviceScaleFactor: 1,
    hasTouch: true,
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite preview --port 4174 --strictPort --host 127.0.0.1 --outDir dist-test',
    url: 'http://127.0.0.1:4174/',
    reuseExistingServer: !process.env.CI,
  },
});
