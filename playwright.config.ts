import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const LOCAL_BASE_URL = `http://127.0.0.1:${PORT}`
const REMOTE_BASE_URL = process.env.PLAYWRIGHT_BASE_URL
const BASE_URL = REMOTE_BASE_URL ?? LOCAL_BASE_URL

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: REMOTE_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
        url: LOCAL_BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
