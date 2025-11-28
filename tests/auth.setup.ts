import { test as setup, expect } from "@playwright/test";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { SUPER_ADMIN } from "./fixtures/test-users";
import path from "path";

/**
 * Global authentication setup for Playwright tests
 * Uses Clerk's email-based signIn helper which uses the ticket strategy
 * This completely bypasses the password flow and device verification
 *
 * Note: For Clerk testing to work, you need:
 * 1. CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in your .env.local
 * 2. Clerk's test mode enabled in the dashboard
 */

const AUTH_FILE = path.join(__dirname, "../playwright/.clerk/user.json");

// First setup: Initialize Clerk testing tokens
setup("global clerk setup", async ({}) => {
  await clerkSetup();
});

// Second setup: Authenticate using email-based ticket strategy and save state
setup("authenticate", async ({ page }) => {
  console.log("Starting authentication with Clerk email-based signIn...");
  console.log(`Email: ${SUPER_ADMIN.email}`);

  // Navigate to the app FIRST (not to sign-in page)
  // The email-based signIn requires navigating to a page that loads Clerk
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000); // Give Clerk time to initialize

  console.log("On app root, calling clerk.signIn() with email...");

  // Use Clerk's email-based signIn helper
  // This uses the ticket strategy and completely bypasses password/verification flows
  try {
    await clerk.signIn({
      page,
      emailAddress: SUPER_ADMIN.email,
    });
    console.log("clerk.signIn() with email completed");
  } catch (error) {
    console.error("clerk.signIn() failed:", error);
    await page.screenshot({ path: "test-results/auth-signin-error.png" });
    throw error;
  }

  // Give time for auth state to propagate
  await page.waitForTimeout(2000);

  // After sign-in, navigate to a protected page to verify authentication
  console.log("Navigating to dashboard to verify authentication...");
  await page.goto("/dashboard");

  try {
    // Wait for dashboard URL
    await page.waitForURL("**/dashboard**", { timeout: 30000 });
    console.log("Successfully navigated to dashboard");
  } catch {
    // Take debug screenshot
    await page.screenshot({ path: "test-results/auth-redirect-debug.png" });

    const currentUrl = page.url();
    console.error(`Failed to reach dashboard. Current URL: ${currentUrl}`);

    if (currentUrl.includes("sign-in") || currentUrl.includes("accounts.dev")) {
      console.error("Authentication was not persisted - still being redirected to sign-in");
    }

    throw new Error(`Failed to navigate to dashboard. Current URL: ${currentUrl}`);
  }

  // Verify we're authenticated by checking URL
  await expect(page).toHaveURL(/.*dashboard.*/);
  console.log("Authentication verified - on dashboard!");

  // Save the authenticated state for use in other tests
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`Auth state saved to ${AUTH_FILE}`);
});
