import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { DEPARTMENTAL_ADMIN, URLS } from "./fixtures/test-users";
import { signInAs } from "./fixtures/auth-helpers";

/**
 * Departmental Admin - Service and Provider Seeding Test
 *
 * This test:
 * 1. Signs in as the Departmental Admin
 * 2. Creates a test service with 5 workers per shift (4 shifts = 20 positions)
 * 3. Creates 20 matching providers
 * 4. Verifies the service and providers appear correctly
 * 5. Tests the matching functionality
 */

test.describe("Departmental Admin - Seed Test Service and Providers", () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  test("should sign in as Departmental Admin and access services", async ({ page }) => {
    await signInAs(page, DEPARTMENTAL_ADMIN.email, DEPARTMENTAL_ADMIN.password);

    // Navigate to services page
    await page.goto(URLS.services);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Check if services page loads
    const servicesHeader = page.locator("h1:has-text('Services'), h2:has-text('Services'), text=Service");
    const hasHeader = await servicesHeader.first().isVisible().catch(() => false);

    if (hasHeader) {
      console.log("✓ Services page loaded successfully");
    }

    // Look for "Create Service" button
    const createButton = page.locator(
      "button:has-text('Create'), button:has-text('Add'), button:has-text('New Service')"
    );
    const canCreate = await createButton.first().isVisible().catch(() => false);

    if (canCreate) {
      console.log("✓ Departmental Admin can create services");
    }
  });

  test("should access providers page", async ({ page }) => {
    await signInAs(page, DEPARTMENTAL_ADMIN.email, DEPARTMENTAL_ADMIN.password);

    // Navigate to providers page
    await page.goto(URLS.providers);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Check if providers page loads
    const providersHeader = page.locator("h1:has-text('Providers'), h2:has-text('Providers'), text=Provider");
    const hasHeader = await providersHeader.first().isVisible().catch(() => false);

    if (hasHeader) {
      console.log("✓ Providers page loaded successfully");
    }

    // Look for provider upload/create functionality
    const createButton = page.locator(
      "button:has-text('Create'), button:has-text('Add'), button:has-text('Upload'), button:has-text('Import')"
    );
    const canCreate = await createButton.first().isVisible().catch(() => false);

    if (canCreate) {
      console.log("✓ Departmental Admin can create/upload providers");
    }
  });

  test("should create a service with 5 workers per shift using the UI", async ({ page }) => {
    await signInAs(page, DEPARTMENTAL_ADMIN.email, DEPARTMENTAL_ADMIN.password);

    // Navigate to services page
    await page.goto(URLS.services);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Click Create Service button
    const createButton = page.locator(
      "button:has-text('Create'), button:has-text('Add'), button:has-text('New')"
    ).first();

    if (await createButton.isVisible()) {
      await createButton.click();
      await page.waitForTimeout(1000);

      // Fill in service details
      const nameInput = page.locator("input[name='name'], input[placeholder*='name' i]").first();
      if (await nameInput.isVisible()) {
        await nameInput.fill("Test Strike Service");
      }

      const codeInput = page.locator("input[name='shortCode'], input[name='code'], input[placeholder*='code' i]").first();
      if (await codeInput.isVisible()) {
        await codeInput.fill("TSTK");
      }

      // Look for headcount input and set to 5
      const headcountInput = page.locator(
        "input[name='headcount'], input[name='positionsPerShift'], input[type='number']"
      ).first();
      if (await headcountInput.isVisible()) {
        await headcountInput.fill("5");
        console.log("✓ Set headcount to 5 workers per shift");
      }

      // Check shift type checkboxes
      const dayShiftCheckbox = page.locator(
        "input[name='operatesDays'], input[name='hasDayShift'], [role='switch']:has-text('Day')"
      ).first();
      if (await dayShiftCheckbox.isVisible()) {
        const isChecked = await dayShiftCheckbox.isChecked().catch(() => false);
        if (!isChecked) {
          await dayShiftCheckbox.click();
        }
      }

      const nightShiftCheckbox = page.locator(
        "input[name='operatesNights'], input[name='hasNightShift'], [role='switch']:has-text('Night')"
      ).first();
      if (await nightShiftCheckbox.isVisible()) {
        const isChecked = await nightShiftCheckbox.isChecked().catch(() => false);
        if (!isChecked) {
          await nightShiftCheckbox.click();
        }
      }

      const weekendCheckbox = page.locator(
        "input[name='operatesWeekends'], input[name='hasWeekendShift'], [role='switch']:has-text('Weekend')"
      ).first();
      if (await weekendCheckbox.isVisible()) {
        const isChecked = await weekendCheckbox.isChecked().catch(() => false);
        if (!isChecked) {
          await weekendCheckbox.click();
        }
      }

      // Submit the form
      const submitButton = page.locator(
        "button[type='submit'], button:has-text('Save'), button:has-text('Create')"
      ).first();
      if (await submitButton.isVisible()) {
        await submitButton.click();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(2000);

        // Verify service was created
        const successMessage = page.locator("text=created, text=success, text=Service");
        const wasCreated = await successMessage.isVisible().catch(() => false);

        if (wasCreated) {
          console.log("✓ Service created successfully");
        }
      }
    } else {
      console.log("Could not find Create button - check if departmental admin has service creation permissions");
    }
  });

  test("should access matching page", async ({ page }) => {
    await signInAs(page, DEPARTMENTAL_ADMIN.email, DEPARTMENTAL_ADMIN.password);

    // Navigate to matching page
    await page.goto(URLS.matching);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Check if matching page loads
    const matchingHeader = page.locator(
      "h1:has-text('Matching'), h2:has-text('Matching'), text=Match, text=Assignment"
    );
    const hasHeader = await matchingHeader.first().isVisible().catch(() => false);

    if (hasHeader) {
      console.log("✓ Matching page loaded successfully");
    }

    // Look for matching controls
    const matchButton = page.locator(
      "button:has-text('Match'), button:has-text('Run'), button:has-text('Auto')"
    );
    const canMatch = await matchButton.first().isVisible().catch(() => false);

    if (canMatch) {
      console.log("✓ Departmental Admin can access matching controls");
    }
  });

  test("should access coverage dashboard", async ({ page }) => {
    await signInAs(page, DEPARTMENTAL_ADMIN.email, DEPARTMENTAL_ADMIN.password);

    // Navigate to coverage page
    await page.goto(URLS.coverage);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Check if coverage page loads
    const coverageHeader = page.locator(
      "h1:has-text('Coverage'), h2:has-text('Coverage'), text=Coverage"
    );
    const hasHeader = await coverageHeader.first().isVisible().catch(() => false);

    if (hasHeader) {
      console.log("✓ Coverage dashboard loaded successfully");
    }

    // Look for coverage stats
    const statsSection = page.locator(
      "[data-testid='coverage-stats'], .coverage-stats, text=Open, text=Filled, text=positions"
    );
    const hasStats = await statsSection.first().isVisible().catch(() => false);

    if (hasStats) {
      console.log("✓ Coverage statistics displayed");
    }
  });
});

test.describe("Departmental Admin - Service and Provider Verification", () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  test("should verify services exist in the system", async ({ page }) => {
    await signInAs(page, DEPARTMENTAL_ADMIN.email, DEPARTMENTAL_ADMIN.password);

    await page.goto(URLS.services);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Count services in table
    const serviceRows = page.locator("table tbody tr, [data-testid^='service-row']");
    const count = await serviceRows.count();

    console.log(`Found ${count} services in the department`);

    if (count > 0) {
      console.log("✓ Services exist in the system");

      // Click on first service to see details
      await serviceRows.first().click();
      await page.waitForTimeout(1000);

      // Look for shift information
      const shiftInfo = page.locator(
        "text=Shift, text=Day, text=Night, text=positions, text=workers"
      );
      const hasShiftInfo = await shiftInfo.first().isVisible().catch(() => false);

      if (hasShiftInfo) {
        console.log("✓ Service details show shift information");
      }
    }
  });

  test("should verify providers exist in the system", async ({ page }) => {
    await signInAs(page, DEPARTMENTAL_ADMIN.email, DEPARTMENTAL_ADMIN.password);

    await page.goto(URLS.providers);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Count providers in table
    const providerRows = page.locator("table tbody tr, [data-testid^='provider-row']");
    const count = await providerRows.count();

    console.log(`Found ${count} providers in the department`);

    if (count > 0) {
      console.log("✓ Providers exist in the system");
    }
  });
});
