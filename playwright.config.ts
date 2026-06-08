import { defineConfig, devices } from '@playwright/test';

// Browser E2E lives at the repo root because the flows under test span the whole
// stack (SPA + auth-api + habits-api + Postgres). The webServer boots `make up`
// and reuses an already-running local stack so a developer's `make up` is not
// duplicated (port collisions on 5173/3000/3001/5434).
//
// Two projects: `setup` mints a logged-in storageState for future authed-only
// tests; `chromium` consumes it. The risk specs (#3/#4) deliberately override
// storageState to manage their own users — see e2e/E2E_RULES.md.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // `list` for local console output; on CI also emit an `html` report so the e2e
  // workflow can upload a browsable artifact (traces from retried runs embed in it).
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'make up',
    url: 'http://localhost:5173',
    // Always attach to a stack that's already listening on 5173. Locally that's
    // a developer's running `make up`; on CI the e2e workflow pre-starts the
    // stack and health-gates all three services first, so Playwright must reuse
    // it rather than spawn a second one and collide on 5173/3000/3001/5434.
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
