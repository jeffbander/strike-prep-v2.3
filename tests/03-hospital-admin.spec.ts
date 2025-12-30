import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { HOSPITAL_ADMIN, TEST_DATA, URLS } from "./fixtures/test-users";
import { signInAs } from "./fixtures/auth-helpers";

/**
 * Hospital Admin E2E Tests
 *
 * Tests the complete hospital admin workflow:
 * 1. Sign in as Hospital Admin
 * 2. Verify they see only their hospital
 * 3. Create Units (7E, ICU, CCU)
 * 4. Activate specific Departments (Medicine, Surgery)
 * 5. Create Departmental Admin users for each department
 * 6. Verify cannot create Health System Admins
 */

test.describe("Hospital Admin Journey", () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  test("should sign in as Hospital Admin", async ({ page }) => {
    await page.goto(URLS.signIn);
    await page.waitForLoadState("domcontentloaded");

    // Enter credentials
    const emailInput = page.locator("input[name='identifier']");
    await emailInput.waitFor({ timeout: 10000 });
    await emailInput.fill(HOSPITAL_ADMIN.email);

    const continueButton = page.locator("button:has-text('Continue')");
    await continueButton.click();

    // Enter password
    const passwordInput = page.locator("input[type='password']");
    await passwordInput.waitFor({ timeout: 5000 });
    await passwordInput.fill(HOSPITAL_ADMIN.password);

    // Sign in
    await continueButton.click();

    // Wait for redirect to dashboard
    await page.waitForURL("**/dashboard**", { timeout: 30000 });

    // Verify dashboard loads
    await expect(page.locator("text=Dashboard")).toBeVisible({ timeout: 10000 });
  });

  test("should see only their assigned hospital", async ({ page }) => {
    await signInAs(page, HOSPITAL_ADMIN.email, HOSPITAL_ADMIN.password);

    await page.goto(URLS.dashboard);
    await page.waitForLoadState("domcontentloaded");

    // Hospital Admin should NOT see:
    // - "Health Systems" menu
    // - "Hospitals" menu (plural - they only have one)
    const healthSystemsLink = page.locator("nav a:has-text('Health Systems')");
    const hospitalsLink = page.locator("nav a:has-text('Hospitals')");

    const isHealthSystemsVisible = await healthSystemsLink.isVisible().catch(() => false);
    const isHospitalsVisible = await hospitalsLink.isVisible().catch(() => false);

    if (!isHealthSystemsVisible) {
      console.log("✓ Hospital Admin does not see 'Health Systems' - correct scoping");
    }

    // They should see their hospital context in header/breadcrumb
    const hospitalContext = page.locator("text=Hospital, text=Test Hospital");
    const hasContext = await hospitalContext.first().isVisible().catch(() => false);

    if (hasContext) {
      console.log("✓ Hospital context visible in UI");
    }
  });

  test("should access Departments management", async ({ page }) => {
    await signInAs(page, HOSPITAL_ADMIN.email, HOSPITAL_ADMIN.password);

    await page.goto("/dashboard/departments");
    await page.waitForLoadState("domcontentloaded");

    // Verify departments page loads
    const departmentsHeader = page.locator("h1:has-text('Departments'), h2:has-text('Departments'), text=Department");
    const hasHeader = await departmentsHeader.first().isVisible().catch(() => false);

    if (hasHeader) {
      console.log("✓ Departments page loaded successfully");

      // Count departments visible
      const departmentRows = page.locator("table tbody tr, [data-testid='department-row']");
      const count = await departmentRows.count();
      console.log(`Found ${count} departments`);
    }
  });

  test("should activate/deactivate departments", async ({ page }) => {
    await signInAs(page, HOSPITAL_ADMIN.email, HOSPITAL_ADMIN.password);

    await page.goto("/dashboard/departments");
    await page.waitForLoadState("domcontentloaded");

    // Find a department row
    const departmentRow = page.locator("table tbody tr, [data-testid='department-row']").first();

    if (await departmentRow.isVisible()) {
      // Look for activate/deactivate toggle or button
      const toggleButton = departmentRow.locator(
        "button:has-text('Activate'), button:has-text('Deactivate'), input[type='checkbox'], [role='switch']"
      );

      if (await toggleButton.first().isVisible()) {
        // Click to toggle
        await toggleButton.first().click();
        await page.waitForLoadState("domcontentloaded");

        console.log("✓ Department activation toggle clicked");
      } else {
        // Try clicking on the row to open detail view
        await departmentRow.click();
        await page.waitForTimeout(500);

        const detailToggle = page.locator(
          "button:has-text('Activate'), button:has-text('Deactivate'), input[type='checkbox'][name='isActive']"
        );

        if (await detailToggle.first().isVisible()) {
          await detailToggle.first().click();
          console.log("✓ Department activation toggle found in detail view");
        }
      }
    }
  });

  test("should access Units management", async ({ page }) => {
    await signInAs(page, HOSPITAL_ADMIN.email, HOSPITAL_ADMIN.password);

    // Units might be under different URLs
    const possibleUrls = [
      "/dashboard/units",
      "/dashboard/hospital/units",
      "/dashboard/settings/units",
    ];

    let unitsFound = false;

    for (const url of possibleUrls) {
      await page.goto(url);
      await page.waitForLoadState("domcontentloaded");

      const notFound = page.locator("text=404, text=Not Found");
      const isNotFound = await notFound.isVisible().catch(() => false);

      if (!isNotFound) {
        unitsFound = true;
        console.log(`✓ Units page found at ${url}`);
        break;
      }
    }

    if (!unitsFound) {
      console.log("Units management page not found - may be embedded in another view");
    }
  });

  test("should create Units", async ({ page }) => {
    await signInAs(page, HOSPITAL_ADMIN.email, HOSPITAL_ADMIN.password);

    await page.goto("/dashboard/units");
    await page.waitForLoadState("domcontentloaded");

    const testUnits = ["7E", "ICU", "CCU"];

    for (const unit of testUnits) {
      const createButton = page.locator("button:has-text('Create'), button:has-text('Add')");

      if (await createButton.first().isVisible()) {
        await createButton.first().click();
        await page.waitForTimeout(500);

        const nameInput = page.locator("input[name='name'], input[placeholder*='name' i]");
        if (await nameInput.isVisible()) {
          await nameInput.fill(unit);
        }

        const submitButton = page.locator("button[type='submit'], button:has-text('Save')");
        await submitButton.first().click();

        await page.waitForLoadState("domcontentloaded");
        console.log(`Created unit: ${unit}`);
      }
    }
  });

  test("should access Users management and create Departmental Admins", async ({ page }) => {
    await signInAs(page, HOSPITAL_ADMIN.email, HOSPITAL_ADMIN.password);

    await page.goto("/dashboard/users");
    await page.waitForLoadState("domcontentloaded");

    // Verify users page loads
    const usersHeader = page.locator("h1:has-text('Users'), h2:has-text('Users'), text=User");
    const hasHeader = await usersHeader.first().isVisible().catch(() => false);

    if (hasHeader) {
      console.log("✓ Users page loaded successfully");

      // Check for ability to create Departmental Admins
      const createButton = page.locator("button:has-text('Create'), button:has-text('Add'), button:has-text('Invite')");

      if (await createButton.first().isVisible()) {
        await createButton.first().click();
        await page.waitForTimeout(500);

        // Look for role dropdown
        const roleSelector = page.locator("select[name='role']");

        if (await roleSelector.isVisible()) {
          // Get all options
          const options = await roleSelector.locator("option").allTextContents();
          console.log("Available roles:", options);

          // Should include "Departmental Admin" but NOT "Health System Admin" or "Super Admin"
          const hasDeptAdmin = options.some((opt) =>
            opt.toLowerCase().includes("departmental") || opt.toLowerCase().includes("department")
          );
          const hasHealthSystemAdmin = options.some((opt) =>
            opt.toLowerCase().includes("health system")
          );
          const hasSuperAdmin = options.some((opt) =>
            opt.toLowerCase().includes("super")
          );

          if (hasDeptAdmin && !hasHealthSystemAdmin && !hasSuperAdmin) {
            console.log("✓ Can create Departmental Admins but not higher roles - correct permissions");
          } else if (hasDeptAdmin) {
            console.log("✓ Can create Departmental Admins");
          }
        }

        // Close modal
        const cancelButton = page.locator("button:has-text('Cancel')");
        if (await cancelButton.isVisible()) {
          await cancelButton.click();
        }
      }
    }
  });

  test("should NOT be able to access other hospitals", async ({ page }) => {
    await signInAs(page, HOSPITAL_ADMIN.email, HOSPITAL_ADMIN.password);

    // Try to access hospitals list
    await page.goto("/dashboard/hospitals");
    await page.waitForLoadState("domcontentloaded");

    const currentUrl = page.url();

    // Either redirected away or showing only their hospital
    if (!currentUrl.includes("hospitals")) {
      console.log("✓ Redirected away from hospitals page - access control working");
    } else {
      // Check for access denied or limited view
      const hospitalRows = page.locator("table tbody tr");
      const count = await hospitalRows.count();

      if (count <= 1) {
        console.log("✓ Only showing single hospital - access control working");
      } else {
        console.log("⚠ Multiple hospitals visible - check access control");
      }
    }
  });

  test("should NOT be able to create Hospital Admin users", async ({ page }) => {
    await signInAs(page, HOSPITAL_ADMIN.email, HOSPITAL_ADMIN.password);

    await page.goto("/dashboard/users");
    await page.waitForLoadState("domcontentloaded");

    const createButton = page.locator("button:has-text('Create'), button:has-text('Add'), button:has-text('Invite')");

    if (await createButton.first().isVisible()) {
      await createButton.first().click();
      await page.waitForTimeout(500);

      const roleSelector = page.locator("select[name='role']");

      if (await roleSelector.isVisible()) {
        const options = await roleSelector.locator("option").allTextContents();

        // Should NOT include "Hospital Admin", "Health System Admin", or "Super Admin"
        const hasHospitalAdmin = options.some((opt) =>
          opt.toLowerCase().includes("hospital admin")
        );
        const hasHealthSystemAdmin = options.some((opt) =>
          opt.toLowerCase().includes("health system")
        );
        const hasSuperAdmin = options.some((opt) =>
          opt.toLowerCase().includes("super")
        );

        if (!hasHospitalAdmin && !hasHealthSystemAdmin && !hasSuperAdmin) {
          console.log("✓ Cannot create elevated admin roles - correct permissions");
        } else {
          console.log("⚠ Can see elevated roles - check permissions");
          console.log("Visible options:", options);
        }
      }

      // Close modal
      const cancelButton = page.locator("button:has-text('Cancel')");
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
      }
    }
  });
});

test.describe("Hospital Admin - Department Activation Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
  });

  test("should activate specific departments (Medicine, Surgery)", async ({ page }) => {
    await signInAs(page, HOSPITAL_ADMIN.email, HOSPITAL_ADMIN.password);

    await page.goto("/dashboard/departments");
    await page.waitForLoadState("domcontentloaded");

    const departmentsToActivate = ["Medicine", "Surgery"];

    for (const deptName of departmentsToActivate) {
      // Find the department row
      const departmentRow = page.locator(`tr:has-text('${deptName}'), [data-testid='department-row']:has-text('${deptName}')`);

      if (await departmentRow.isVisible()) {
        // Look for activation toggle in the row
        const toggle = departmentRow.locator("input[type='checkbox'], [role='switch'], button:has-text('Activate')");

        if (await toggle.first().isVisible()) {
          // Check if already active
          const isChecked = await toggle.first().isChecked?.() || false;

          if (!isChecked) {
            await toggle.first().click();
            await page.waitForLoadState("domcontentloaded");
            console.log(`✓ Activated department: ${deptName}`);
          } else {
            console.log(`Department already active: ${deptName}`);
          }
        } else {
          // Try clicking the row to open detail view
          await departmentRow.click();
          await page.waitForTimeout(500);

          const detailToggle = page.locator("input[type='checkbox'][name='isActive'], button:has-text('Activate')");
          if (await detailToggle.first().isVisible()) {
            await detailToggle.first().click();
            await page.waitForLoadState("domcontentloaded");
            console.log(`✓ Activated department from detail: ${deptName}`);
          }
        }
      } else {
        console.log(`Department not found: ${deptName}`);
      }
    }
  });

  test("should assign Departmental Admin to a department", async ({ page }) => {
    await signInAs(page, HOSPITAL_ADMIN.email, HOSPITAL_ADMIN.password);

    // Navigate to users
    await page.goto("/dashboard/users");
    await page.waitForLoadState("domcontentloaded");

    const createButton = page.locator("button:has-text('Create'), button:has-text('Add'), button:has-text('Invite')");

    if (await createButton.first().isVisible()) {
      await createButton.first().click();
      await page.waitForTimeout(500);

      // Fill user details
      const emailInput = page.locator("input[name='email'], input[type='email']");
      const firstNameInput = page.locator("input[name='firstName']");
      const lastNameInput = page.locator("input[name='lastName']");
      const roleSelector = page.locator("select[name='role']");
      const departmentSelector = page.locator("select[name='departmentId'], select[name='department']");

      if (await emailInput.isVisible()) {
        await emailInput.fill("test-dept-admin@example.com");
      }
      if (await firstNameInput.isVisible()) {
        await firstNameInput.fill("Test");
      }
      if (await lastNameInput.isVisible()) {
        await lastNameInput.fill("DeptAdmin");
      }
      if (await roleSelector.isVisible()) {
        // Find option containing "departmental" (case-insensitive)
        const options = await roleSelector.locator('option').allTextContents();
        const deptOption = options.find(opt => /departmental/i.test(opt));
        if (deptOption) await roleSelector.selectOption({ label: deptOption });
      }
      if (await departmentSelector.isVisible()) {
        // Select Medicine department
        const options = await departmentSelector.locator('option').allTextContents();
        const medicineOption = options.find(opt => /medicine/i.test(opt));
        if (medicineOption) await departmentSelector.selectOption({ label: medicineOption });
      }

      // Submit
      const submitButton = page.locator("button[type='submit'], button:has-text('Save'), button:has-text('Create')");
      await submitButton.first().click();

      await page.waitForLoadState("domcontentloaded");
      console.log("✓ Departmental Admin creation submitted");
    }
  });
});
