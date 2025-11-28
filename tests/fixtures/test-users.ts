/**
 * Test user fixtures for E2E tests
 * These users should be created in Clerk's test mode
 */

export interface TestUser {
  email: string;
  password: string;
  role: "super_admin" | "health_system_admin" | "hospital_admin" | "departmental_admin";
  firstName: string;
  lastName: string;
}

/**
 * Super Admin - Has access to everything
 * Email: notifications@providerloop.com
 * Password: Set via TEST_SUPER_ADMIN_PASSWORD env var
 */
export const SUPER_ADMIN: TestUser = {
  email: "notifications@providerloop.com",
  password: process.env.TEST_SUPER_ADMIN_PASSWORD || "Password#2026a",
  role: "super_admin",
  firstName: "Super",
  lastName: "Admin",
};

/**
 * Health System Admin - Created by Super Admin
 * Can manage hospitals within their health system
 */
export const HEALTH_SYSTEM_ADMIN: TestUser = {
  email: "hsadmin-test@providerloop.com",
  password: process.env.TEST_HS_ADMIN_PASSWORD || "TestPassword123!",
  role: "health_system_admin",
  firstName: "Health System",
  lastName: "Admin",
};

/**
 * Hospital Admin - Created by Health System Admin
 * Can manage departments within their hospital
 */
export const HOSPITAL_ADMIN: TestUser = {
  email: "jeffrey.bander@gmail.com",
  password: process.env.TEST_HOSP_ADMIN_PASSWORD || "TestPassword123!",
  role: "hospital_admin",
  firstName: "Jeffrey",
  lastName: "Bander",
};

/**
 * Departmental Admin - Created by Hospital Admin
 * Can manage services, providers, and assignments within their department
 */
export const DEPARTMENTAL_ADMIN: TestUser = {
  email: "jeffrey.bander@providerloop.com",
  password: process.env.TEST_DEPT_ADMIN_PASSWORD || "TestPassword123!",
  role: "departmental_admin",
  firstName: "Jeffrey",
  lastName: "Bander",
};

/**
 * Test data for creating organizational structure
 */
export const TEST_DATA = {
  healthSystem: {
    name: "E2E Test Health System",
    slug: "e2e-test-hs",
  },
  hospital: {
    name: "E2E Test Hospital",
    shortCode: "E2ETH",
  },
  department: {
    name: "Medicine",
    isActive: true,
  },
  service: {
    name: "E2E Test Service",
    shortCode: "E2ESVC",
    shiftConfig: {
      dayShift: { startTime: "07:00", endTime: "19:00" },
      nightShift: { startTime: "19:00", endTime: "07:00" },
    },
  },
  provider: {
    firstName: "Test",
    lastName: "Provider",
    email: "test-provider@example.com",
    cellPhone: "555-123-4567",
    employeeId: "E2E-001",
  },
  jobTypes: [
    { name: "Nurse Practitioner", code: "NP" },
    { name: "Physician Assistant", code: "PA" },
    { name: "Registered Nurse", code: "RN" },
  ],
  skills: [
    { name: "Critical Care", code: "CC" },
    { name: "Emergency Medicine", code: "EM" },
    { name: "Pediatrics", code: "PEDS" },
  ],
};

/**
 * Selectors used across tests
 */
export const SELECTORS = {
  // Navigation
  sidebar: "[data-testid='sidebar']",
  dashboardLink: "[data-testid='dashboard-link']",
  healthSystemsLink: "[data-testid='health-systems-link']",
  hospitalsLink: "[data-testid='hospitals-link']",
  departmentsLink: "[data-testid='departments-link']",
  servicesLink: "[data-testid='services-link']",
  providersLink: "[data-testid='providers-link']",
  matchingLink: "[data-testid='matching-link']",
  coverageLink: "[data-testid='coverage-link']",
  usersLink: "[data-testid='users-link']",

  // Common UI elements
  createButton: "[data-testid='create-button']",
  saveButton: "[data-testid='save-button']",
  cancelButton: "[data-testid='cancel-button']",
  deleteButton: "[data-testid='delete-button']",
  modal: "[data-testid='modal']",
  modalTitle: "[data-testid='modal-title']",

  // Forms
  nameInput: "input[name='name']",
  emailInput: "input[name='email']",
  submitButton: "button[type='submit']",

  // Tables
  tableRow: "tr[data-testid^='row-']",
  tableCell: "td",

  // Status indicators
  loadingSpinner: "[data-testid='loading']",
  errorMessage: "[data-testid='error']",
  successMessage: "[data-testid='success']",
};

/**
 * URLs for different sections of the app
 */
export const URLS = {
  home: "/",
  signIn: "/sign-in",
  signUp: "/sign-up",
  dashboard: "/dashboard",
  healthSystems: "/dashboard/health-systems",
  hospitals: "/dashboard/hospitals",
  departments: "/dashboard/departments",
  services: "/dashboard/services",
  providers: "/dashboard/providers",
  matching: "/dashboard/matching",
  coverage: "/dashboard/coverage",
  users: "/dashboard/users",
  settings: "/dashboard/settings",
};
