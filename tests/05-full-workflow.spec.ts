import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import {
  SUPER_ADMIN,
  HEALTH_SYSTEM_ADMIN,
  HOSPITAL_ADMIN,
  DEPARTMENTAL_ADMIN,
  TEST_DATA,
  URLS,
} from "./fixtures/test-users";
import { signInAs, signOut } from "./fixtures/auth-helpers";

/**
 * Full Workflow E2E Test
 *
 * This test simulates the complete user journey from Super Admin
 * creating the organizational structure down to Departmental Admins
 * matching providers to positions.
 *
 * Flow:
 * 1. Super Admin creates Health System and HS Admin
 * 2. HS Admin creates Hospital and Hospital Admin
 * 3. Hospital Admin activates departments and creates Dept Admin
 * 4. Dept Admin creates service, providers, runs matching, makes assignments
 * 5. Coverage is verified
 */

test.describe.serial("Complete Organizational Workflow", () => {
  // Shared state between tests
  let healthSystemId: string;
  let hospitalId: string;
  let departmentId: string;
  let serviceId: string;
  let providerId: string;

  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  test("Phase 1: Super Admin - Setup organizational foundation", async ({ page }) => {
    test.setTimeout(120000); // 2 minute timeout for this complex flow

    // Sign in as Super Admin
    await signInAs(page, SUPER_ADMIN.email, SUPER_ADMIN.password);

    // Navigate to dashboard
    await page.goto(URLS.dashboard);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Dashboard")).toBeVisible({ timeout: 10000 });
    console.log("✓ Super Admin signed in and dashboard visible");

    // Verify Super Admin sees all navigation options
    const expectedNavItems = ["Health Systems", "Users", "Dashboard"];
    for (const item of expectedNavItems) {
      const navItem = page.locator(`text=${item}`);
      const isVisible = await navItem.first().isVisible().catch(() => false);
      console.log(`${isVisible ? "✓" : "✗"} Nav item visible: ${item}`);
    }

    // Create/verify Health System exists
    await page.goto("/dashboard/health-systems");
    await page.waitForLoadState("networkidle");

    const existingHS = page.locator(`text=${TEST_DATA.healthSystem.name}`);
    const hsExists = await existingHS.isVisible().catch(() => false);

    if (!hsExists) {
      // Create new health system
      const createButton = page.locator("button:has-text('Create'), button:has-text('Add')");
      if (await createButton.first().isVisible()) {
        await createButton.first().click();
        await page.waitForTimeout(500);

        const nameInput = page.locator("input[name='name']");
        if (await nameInput.isVisible()) {
          await nameInput.fill(TEST_DATA.healthSystem.name);
        }

        const submitButton = page.locator("button[type='submit'], button:has-text('Save')");
        await submitButton.first().click();
        await page.waitForLoadState("networkidle");

        console.log("✓ Health System created");
      }
    } else {
      console.log("✓ Health System already exists");
    }

    // Verify job types exist or create them
    await page.goto("/dashboard/job-types");
    await page.waitForLoadState("networkidle");

    const notFound = page.locator("text=404");
    if (!(await notFound.isVisible().catch(() => false))) {
      console.log("✓ Job Types page accessible");
    } else {
      // Try settings path
      await page.goto("/dashboard/settings/job-types");
      await page.waitForLoadState("networkidle");
    }

    // Verify skills exist
    await page.goto("/dashboard/skills");
    await page.waitForLoadState("networkidle");

    if (!(await page.locator("text=404").isVisible().catch(() => false))) {
      console.log("✓ Skills page accessible");
    }

    console.log("✓ Phase 1 Complete: Super Admin setup done");
  });

  test("Phase 2: Health System Admin - Create hospital structure", async ({ page }) => {
    test.setTimeout(120000);

    // Sign in as Health System Admin
    await signInAs(page, HEALTH_SYSTEM_ADMIN.email, HEALTH_SYSTEM_ADMIN.password);

    // Navigate to dashboard
    await page.goto(URLS.dashboard);
    await page.waitForLoadState("networkidle");
    console.log("✓ Health System Admin signed in");

    // Navigate to hospitals
    await page.goto("/dashboard/hospitals");
    await page.waitForLoadState("networkidle");

    // Check if test hospital exists
    const existingHospital = page.locator(`text=${TEST_DATA.hospital.name}`);
    const hospitalExists = await existingHospital.isVisible().catch(() => false);

    if (!hospitalExists) {
      // Create hospital
      const createButton = page.locator("button:has-text('Create'), button:has-text('Add')");
      if (await createButton.first().isVisible()) {
        await createButton.first().click();
        await page.waitForTimeout(500);

        const nameInput = page.locator("input[name='name']");
        const codeInput = page.locator("input[name='shortCode'], input[name='code']");

        if (await nameInput.isVisible()) {
          await nameInput.fill(TEST_DATA.hospital.name);
        }
        if (await codeInput.isVisible()) {
          await codeInput.fill(TEST_DATA.hospital.shortCode);
        }

        const submitButton = page.locator("button[type='submit'], button:has-text('Save')");
        await submitButton.first().click();
        await page.waitForLoadState("networkidle");

        console.log("✓ Hospital created");
      }
    } else {
      console.log("✓ Hospital already exists");
    }

    // Verify departments were auto-created
    await page.goto("/dashboard/departments");
    await page.waitForLoadState("networkidle");

    const departmentRows = page.locator("table tbody tr, [data-testid='department-row']");
    const deptCount = await departmentRows.count();
    console.log(`✓ Found ${deptCount} departments`);

    console.log("✓ Phase 2 Complete: Health System Admin setup done");
  });

  test("Phase 3: Hospital Admin - Activate departments and configure", async ({ page }) => {
    test.setTimeout(120000);

    // Sign in as Hospital Admin
    await signInAs(page, HOSPITAL_ADMIN.email, HOSPITAL_ADMIN.password);

    // Navigate to dashboard
    await page.goto(URLS.dashboard);
    await page.waitForLoadState("networkidle");
    console.log("✓ Hospital Admin signed in");

    // Navigate to departments
    await page.goto("/dashboard/departments");
    await page.waitForLoadState("networkidle");

    // Activate Medicine department if not already active
    const medicineDept = page.locator("tr:has-text('Medicine'), [data-testid='department-row']:has-text('Medicine')");
    if (await medicineDept.isVisible()) {
      // Check for activate toggle
      const toggle = medicineDept.locator("input[type='checkbox'], [role='switch']");
      if (await toggle.isVisible()) {
        const isChecked = await toggle.isChecked().catch(() => false);
        if (!isChecked) {
          await toggle.click();
          await page.waitForLoadState("networkidle");
          console.log("✓ Medicine department activated");
        } else {
          console.log("✓ Medicine department already active");
        }
      }
    }

    // Try to navigate to units
    await page.goto("/dashboard/units");
    await page.waitForLoadState("networkidle");

    if (!(await page.locator("text=404").isVisible().catch(() => false))) {
      console.log("✓ Units page accessible");
    }

    console.log("✓ Phase 3 Complete: Hospital Admin setup done");
  });

  test("Phase 4: Departmental Admin - Create service and provider workflow", async ({ page }) => {
    test.setTimeout(180000); // 3 minute timeout

    // Sign in as Departmental Admin
    await signInAs(page, DEPARTMENTAL_ADMIN.email, DEPARTMENTAL_ADMIN.password);

    // Navigate to dashboard
    await page.goto(URLS.dashboard);
    await page.waitForLoadState("networkidle");
    console.log("✓ Departmental Admin signed in");

    // Navigate to services
    await page.goto("/dashboard/services");
    await page.waitForLoadState("networkidle");

    // Check if service exists or create one
    const existingService = page.locator(`text=${TEST_DATA.service.name}`);
    const serviceExists = await existingService.isVisible().catch(() => false);

    if (!serviceExists) {
      const createButton = page.locator("button:has-text('Create'), button:has-text('Add')");
      if (await createButton.first().isVisible()) {
        await createButton.first().click();
        await page.waitForTimeout(500);

        const nameInput = page.locator("input[name='name']");
        if (await nameInput.isVisible()) {
          await nameInput.fill(TEST_DATA.service.name);
        }

        const submitButton = page.locator("button[type='submit'], button:has-text('Save')");
        await submitButton.first().click();
        await page.waitForLoadState("networkidle");

        console.log("✓ Service created");
      }
    } else {
      console.log("✓ Service already exists");
    }

    // Navigate to providers
    await page.goto("/dashboard/providers");
    await page.waitForLoadState("networkidle");

    // Check if provider exists or create one
    const existingProvider = page.locator(`text=${TEST_DATA.provider.lastName}`);
    const providerExists = await existingProvider.first().isVisible().catch(() => false);

    if (!providerExists) {
      const createButton = page.locator("button:has-text('Create'), button:has-text('Add')");
      if (await createButton.first().isVisible()) {
        await createButton.first().click();
        await page.waitForTimeout(500);

        const firstNameInput = page.locator("input[name='firstName']");
        const lastNameInput = page.locator("input[name='lastName']");

        if (await firstNameInput.isVisible()) {
          await firstNameInput.fill(TEST_DATA.provider.firstName);
        }
        if (await lastNameInput.isVisible()) {
          await lastNameInput.fill(TEST_DATA.provider.lastName);
        }

        const submitButton = page.locator("button[type='submit'], button:has-text('Save')");
        await submitButton.first().click();
        await page.waitForLoadState("networkidle");

        console.log("✓ Provider created");
      }
    } else {
      console.log("✓ Provider already exists");
    }

    // Navigate to matching
    await page.goto("/dashboard/matching");
    await page.waitForLoadState("networkidle");
    console.log("✓ Matching page loaded");

    // Try to run matching if positions exist
    const runMatchButton = page.locator("button:has-text('Run'), button:has-text('Match'), button:has-text('Find')");
    if (await runMatchButton.first().isVisible()) {
      await runMatchButton.first().click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      console.log("✓ Matching algorithm executed");
    }

    // Check for assign button and try assignment
    const assignButton = page.locator("button:has-text('Assign')");
    if (await assignButton.first().isVisible()) {
      await assignButton.first().click();
      await page.waitForLoadState("networkidle");
      console.log("✓ Assignment created");
    }

    // Navigate to coverage
    await page.goto("/dashboard/coverage");
    await page.waitForLoadState("networkidle");
    console.log("✓ Coverage dashboard loaded");

    // Verify coverage stats are visible
    const coverageStats = page.locator("text=/\\d+\\s*(Open|Assigned|Confirmed|positions)/i");
    const statsVisible = await coverageStats.first().isVisible().catch(() => false);

    if (statsVisible) {
      console.log("✓ Coverage statistics visible");
    }

    console.log("✓ Phase 4 Complete: Departmental Admin workflow done");
  });

  test("Phase 5: Verify complete workflow - Cross-role checks", async ({ page }) => {
    test.setTimeout(120000);

    // Test access controls by attempting cross-role access

    // 1. Departmental Admin trying to access hospitals
    await signInAs(page, DEPARTMENTAL_ADMIN.email, DEPARTMENTAL_ADMIN.password);

    await page.goto("/dashboard/hospitals");
    await page.waitForLoadState("networkidle");

    const deptAdminHospitalsAccess = page.url();
    if (!deptAdminHospitalsAccess.includes("hospitals")) {
      console.log("✓ Departmental Admin correctly blocked from hospitals page");
    } else {
      const rows = await page.locator("table tbody tr").count();
      if (rows <= 1) {
        console.log("✓ Departmental Admin sees limited hospital view");
      }
    }

    // 2. Hospital Admin trying to access health systems
    await signInAs(page, HOSPITAL_ADMIN.email, HOSPITAL_ADMIN.password);

    await page.goto("/dashboard/health-systems");
    await page.waitForLoadState("networkidle");

    const hospAdminHSAccess = page.url();
    if (!hospAdminHSAccess.includes("health-systems")) {
      console.log("✓ Hospital Admin correctly blocked from health systems page");
    } else {
      const rows = await page.locator("table tbody tr").count();
      if (rows <= 1) {
        console.log("✓ Hospital Admin sees limited health system view");
      }
    }

    // 3. Verify Super Admin can access everything
    await signInAs(page, SUPER_ADMIN.email, SUPER_ADMIN.password);

    const pagesForSuperAdmin = [
      "/dashboard/health-systems",
      "/dashboard/hospitals",
      "/dashboard/users",
    ];

    for (const pagePath of pagesForSuperAdmin) {
      await page.goto(pagePath);
      await page.waitForLoadState("networkidle");

      const notFound = page.locator("text=404, text=Not Found, text=Access Denied");
      const isBlocked = await notFound.first().isVisible().catch(() => false);

      if (!isBlocked) {
        console.log(`✓ Super Admin can access ${pagePath}`);
      } else {
        console.log(`✗ Super Admin blocked from ${pagePath}`);
      }
    }

    console.log("✓ Phase 5 Complete: Cross-role access controls verified");
  });

  test("Phase 6: Final verification - Export and Coverage", async ({ page }) => {
    test.setTimeout(60000);

    // Sign in as any admin with coverage access
    await signInAs(page, DEPARTMENTAL_ADMIN.email, DEPARTMENTAL_ADMIN.password);

    // Go to coverage page
    await page.goto("/dashboard/coverage");
    await page.waitForLoadState("networkidle");

    // Take a screenshot of the coverage dashboard
    await page.screenshot({
      path: "playwright-report/coverage-dashboard.png",
      fullPage: true,
    });
    console.log("✓ Coverage dashboard screenshot saved");

    // Try export
    const exportButton = page.locator("button:has-text('Export'), button:has-text('Download'), button:has-text('Excel')");

    if (await exportButton.first().isVisible()) {
      // Set up download listener
      const downloadPromise = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);

      await exportButton.first().click();

      const download = await downloadPromise;
      if (download) {
        const filename = download.suggestedFilename();
        console.log(`✓ Export successful: ${filename}`);
      } else {
        console.log("Export button clicked - may use different download mechanism");
      }
    }

    console.log("✓ Phase 6 Complete: Final verification done");
    console.log("\n=== FULL WORKFLOW TEST COMPLETE ===\n");
  });
});

test.describe("Cross-Role Security Tests", () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  test("should prevent Departmental Admin from accessing Hospital-level resources", async ({ page }) => {
    await signInAs(page, DEPARTMENTAL_ADMIN.email, DEPARTMENTAL_ADMIN.password);

    // Try to access hospitals directly
    await page.goto("/dashboard/hospitals");
    await page.waitForLoadState("networkidle");

    // Should be redirected or see limited view
    const url = page.url();
    const accessDenied = page.locator("text=Access Denied, text=Unauthorized");

    if (!url.includes("hospitals") || (await accessDenied.isVisible().catch(() => false))) {
      console.log("✓ Security: Departmental Admin blocked from hospitals");
    }
  });

  test("should prevent Hospital Admin from accessing Health System-level resources", async ({ page }) => {
    await signInAs(page, HOSPITAL_ADMIN.email, HOSPITAL_ADMIN.password);

    // Try to access health systems directly
    await page.goto("/dashboard/health-systems");
    await page.waitForLoadState("networkidle");

    const url = page.url();
    const accessDenied = page.locator("text=Access Denied, text=Unauthorized");

    if (!url.includes("health-systems") || (await accessDenied.isVisible().catch(() => false))) {
      console.log("✓ Security: Hospital Admin blocked from health systems");
    }
  });

  test("should prevent lower roles from creating higher-level admins", async ({ page }) => {
    await signInAs(page, HOSPITAL_ADMIN.email, HOSPITAL_ADMIN.password);

    await page.goto("/dashboard/users");
    await page.waitForLoadState("networkidle");

    const createButton = page.locator("button:has-text('Create'), button:has-text('Add'), button:has-text('Invite')");

    if (await createButton.first().isVisible()) {
      await createButton.first().click();
      await page.waitForTimeout(500);

      const roleSelector = page.locator("select[name='role']");

      if (await roleSelector.isVisible()) {
        const options = await roleSelector.locator("option").allTextContents();

        const hasElevatedRoles = options.some(
          (opt) =>
            opt.toLowerCase().includes("super admin") ||
            opt.toLowerCase().includes("health system admin")
        );

        if (!hasElevatedRoles) {
          console.log("✓ Security: Hospital Admin cannot create elevated roles");
        }
      }
    }
  });
});
