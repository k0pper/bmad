import { test, expect } from "@playwright/test"

/**
 * Unauthenticated smoke tests. Verifies that the app boots and the
 * sign-in surface renders. Expand here once the storageState auth
 * fixture lands (tracked in deferred-work.md).
 */

test("root redirects unauthenticated users to /login", async ({ page }) => {
  const response = await page.goto("/")
  // Either we land on /login directly (server-side redirect followed)
  // or the final URL ends with /login.
  expect(response?.ok()).toBe(true)
  await expect(page).toHaveURL(/\/login$/)
})

test("/login renders the Google sign-in CTA", async ({ page }) => {
  await page.goto("/login")
  await expect(
    page.getByRole("button", { name: /sign in with google/i }),
  ).toBeVisible()
  // Sub-copy that orients the user
  await expect(
    page.getByText(/sign in to track your job search/i),
  ).toBeVisible()
})

test("dashboard routes redirect unauthenticated users away", async ({ page }) => {
  // /board is gated by middleware; an unauth visit should bounce to /login.
  await page.goto("/board")
  await expect(page).toHaveURL(/\/login/)
})
