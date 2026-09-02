import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: 'tests/playwright/agent-v2',
  timeout: process.env.CI ? 60 * 5 * 1000 : 30 * 1000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  webServer: {
    command: 'npm run build:agent:v2:e2e && node dev/agentV2/e2eServer.mjs',
    port: 1235,
    timeout: 180 * 1000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://127.0.0.1:1235/',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'agent-v2-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
};

export default config;
