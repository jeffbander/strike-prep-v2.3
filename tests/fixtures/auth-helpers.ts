import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { URLS } from "./test-users";
import type { Page } from "@playwright/test";

/**
 * Helper to sign in as a specific user
 * Used when we need to switch between users in tests
 */
export async function signInAs(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await setupClerkTestingToken({ page });

  // Sign out first if needed
  await page.goto(URLS.dashboard);
  await page.waitForLoadState("networkidle");

  // Check if we need to sign out
  const userButton = page.locator(".cl-userButtonTrigger");
  if (await userButton.isVisible().catch(() => false)) {
    await userButton.click();
    const signOutButton = page.locator("button:has-text('Sign out')");
    if (await signOutButton.isVisible().catch(() => false)) {
      await signOutButton.click();
      await page.waitForURL("**/sign-in**", { timeout: 10000 }).catch(() => {});
    }
  }

  // Navigate to sign-in
  await page.goto(URLS.signIn);
  await page.waitForLoadState("networkidle");

  // Check if already on dashboard (somehow still authenticated)
  if (page.url().includes("/dashboard")) {
    return;
  }

  // Wait for and fill email
  const emailInput = page.locator("input[name='identifier']");
  try {
    await emailInput.waitFor({ timeout: 10000 });
    await emailInput.fill(email);
  } catch {
    // If email input not found, check if redirected to dashboard
    if (page.url().includes("/dashboard")) {
      return;
    }
    throw new Error("Could not find email input on sign-in page");
  }

  // Click continue
  const continueButton = page.locator("button:has-text('Continue')");
  await continueButton.click();

  // Enter password
  const passwordInput = page.locator("input[type='password']");
  try {
    await passwordInput.waitFor({ timeout: 5000 });
    await passwordInput.fill(password);
  } catch {
    // Might use different auth flow
    if (page.url().includes("/dashboard")) {
      return;
    }
    throw new Error("Could not find password input");
  }

  // Sign in
  const signInButton = page.locator("button:has-text('Continue')");
  await signInButton.click();

  // Wait for dashboard
  await page.waitForURL("**/dashboard**", { timeout: 30000 });
}

/**
 * Sign out the current user
 */
export async function signOut(page: Page): Promise<void> {
  const userButton = page.locator(".cl-userButtonTrigger");
  if (await userButton.isVisible().catch(() => false)) {
    await userButton.click();
    const signOutButton = page.locator("button:has-text('Sign out')");
    if (await signOutButton.isVisible().catch(() => false)) {
      await signOutButton.click();
      await page.waitForURL("**/sign-in**", { timeout: 10000 }).catch(() => {});
    }
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const userButton = page.locator(".cl-userButtonTrigger");
  return userButton.isVisible().catch(() => false);
}

/**
 * Wait for page to be fully loaded
 */
export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  // Additional wait for React hydration
  await page.waitForTimeout(500);
}
