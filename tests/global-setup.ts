import { clerkSetup } from "@clerk/testing/playwright";

/**
 * Global setup for Playwright tests
 * This runs once before all tests to configure Clerk testing mode
 */
async function globalSetup() {
  // Setup Clerk testing - this is required before setupClerkTestingToken can be used
  await clerkSetup();
}

export default globalSetup;
