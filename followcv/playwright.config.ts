import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright config for FollowCV E2E tests.
 *
 * Local dev: `npm run test:e2e` — auto-spawns `next dev` via `webServer`.
 * CI: same command; behaviour adjusted via `process.env.CI`.
 *
 * Auth: tests in `e2e/` currently target unauthenticated routes only.
 * Auth-gated tests will use a `storageState` fixture captured from a
 * manual Google sign-in (tracked in deferred-work.md).
 */
export default defineConfig({
  testDir: "./e2e",
  // Match Vitest naming so co-located unit tests aren't picked up by Playwright.
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  // Refuse `test.only` checked into CI.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    // Reuse a dev server if the user already has one running locally.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
})
