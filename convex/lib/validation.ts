import { z } from "zod";

/**
 * Input Validation & XSS Prevention for Convex Mutations
 *
 * NEVER trust user input. All string inputs should be validated and sanitized
 * before inserting into the database.
 *
 * Usage:
 *   const validation = safeTextSchema.safeParse(args.firstName);
 *   if (!validation.success) throw new Error("Invalid input");
 *   const sanitizedName = validation.data;
 */

// ============================================================================
// SANITIZATION HELPERS
// ============================================================================

/**
 * Remove XSS-dangerous characters: < > " &
 * Preserves apostrophes for names like O'Neal, McDonald's
 */
function sanitizeText(val: string): string {
  return val.trim().replace(/[<>"&]/g, "");
}

/**
 * Sanitize and normalize email
 */
function sanitizeEmail(val: string): string {
  return val.trim().toLowerCase();
}

/**
 * Sanitize phone - keep only digits, +, -, (, ), spaces
 */
function sanitizePhone(val: string): string {
  return val.trim().replace(/[^0-9+\-() ]/g, "");
}

// ============================================================================
// BASE SCHEMAS
// ============================================================================

/**
 * Safe short text (names, titles, codes)
 * - Min 1, Max 100 characters
 * - XSS sanitized
 */
export const safeTextSchema = z
  .string()
  .min(1, "Required")
  .max(100, "Must be 100 characters or less")
  .transform(sanitizeText);

/**
 * Optional safe text
 */
export const optionalSafeTextSchema = z
  .string()
  .max(100, "Must be 100 characters or less")
  .transform(sanitizeText)
  .optional();

/**
 * Safe long text (descriptions, notes, bios)
 * - Min 1, Max 5000 characters
 * - XSS sanitized
 */
export const safeLongTextSchema = z
  .string()
  .min(1, "Required")
  .max(5000, "Must be 5000 characters or less")
  .transform(sanitizeText);

/**
 * Optional long text
 */
export const optionalLongTextSchema = z
  .string()
  .max(5000, "Must be 5000 characters or less")
  .transform(sanitizeText)
  .optional();

/**
 * Email validation
 * - Valid email format
 * - Normalized to lowercase
 * - Max 254 characters (RFC 5321)
 */
export const emailSchema = z
  .string()
  .email("Invalid email address")
  .max(254, "Email too long")
  .transform(sanitizeEmail);

/**
 * Optional email
 */
export const optionalEmailSchema = z
  .string()
  .email("Invalid email address")
  .max(254, "Email too long")
  .transform(sanitizeEmail)
  .optional()
  .or(z.literal("").transform(() => undefined));

/**
 * Phone number validation
 * - Allows digits, +, -, (, ), spaces
 * - Max 20 characters
 */
export const phoneSchema = z
  .string()
  .min(7, "Phone number too short")
  .max(20, "Phone number too long")
  .transform(sanitizePhone);

/**
 * Optional phone
 */
export const optionalPhoneSchema = z
  .string()
  .max(20, "Phone number too long")
  .transform(sanitizePhone)
  .optional()
  .or(z.literal("").transform(() => undefined));

/**
 * Code/identifier (alphanumeric, underscores, hyphens)
 * - Max 50 characters
 * - Uppercase normalized
 */
export const codeSchema = z
  .string()
  .min(1, "Required")
  .max(50, "Must be 50 characters or less")
  .regex(/^[A-Za-z0-9_-]+$/, "Only letters, numbers, underscores, and hyphens allowed")
  .transform((val) => val.trim().toUpperCase());

/**
 * Optional code
 */
export const optionalCodeSchema = z
  .string()
  .max(50, "Must be 50 characters or less")
  .regex(/^[A-Za-z0-9_-]*$/, "Only letters, numbers, underscores, and hyphens allowed")
  .transform((val) => val.trim().toUpperCase())
  .optional()
  .or(z.literal("").transform(() => undefined));

// ============================================================================
// DOMAIN-SPECIFIC SCHEMAS
// ============================================================================

/**
 * Provider schema
 */
export const providerSchema = z.object({
  firstName: safeTextSchema,
  lastName: safeTextSchema,
  employeeId: optionalSafeTextSchema,
  cellPhone: optionalPhoneSchema,
  email: optionalEmailSchema,
  currentScheduleDays: optionalSafeTextSchema,
  currentScheduleTime: optionalSafeTextSchema,
  supervisingPhysician: optionalSafeTextSchema,
  specialtyCertification: optionalSafeTextSchema,
  previousExperience: optionalLongTextSchema,
  hasVisa: z.boolean().optional(),
});

/**
 * Bulk provider (from CSV import)
 */
export const bulkProviderSchema = z.object({
  role: safeTextSchema,
  lastName: safeTextSchema,
  firstName: safeTextSchema,
  employeeId: optionalSafeTextSchema,
  cellPhone: optionalPhoneSchema,
  scheduleDays: optionalSafeTextSchema,
  scheduleTime: optionalSafeTextSchema,
  homeSite: safeTextSchema,
  homeDepartment: safeTextSchema,
  supervisingMD: optionalSafeTextSchema,
  certification: optionalSafeTextSchema,
  experience: optionalLongTextSchema,
  email: optionalEmailSchema,
  hasVisa: z.boolean().optional(),
});

/**
 * User schema
 */
export const userSchema = z.object({
  email: emailSchema,
  firstName: optionalSafeTextSchema,
  lastName: optionalSafeTextSchema,
  imageUrl: z.string().url().optional(),
});

/**
 * Health System schema
 */
export const healthSystemSchema = z.object({
  name: safeTextSchema,
  code: optionalCodeSchema,
});

/**
 * Hospital schema
 */
export const hospitalSchema = z.object({
  name: safeTextSchema,
  code: optionalCodeSchema,
  address: optionalSafeTextSchema,
  city: optionalSafeTextSchema,
  state: optionalSafeTextSchema,
  zipCode: optionalSafeTextSchema,
});

/**
 * Department schema
 */
export const departmentSchema = z.object({
  name: safeTextSchema,
  code: optionalCodeSchema,
});

/**
 * Service schema
 */
export const serviceSchema = z.object({
  name: safeTextSchema,
  code: optionalCodeSchema,
});

/**
 * Scenario schema
 */
export const scenarioSchema = z.object({
  name: safeTextSchema,
  description: optionalLongTextSchema,
});

/**
 * Skill schema
 */
export const skillSchema = z.object({
  name: safeTextSchema,
  category: safeTextSchema,
  description: optionalLongTextSchema,
});

// ============================================================================
// VALIDATION HELPER
// ============================================================================

/**
 * Validate and sanitize input, throwing an error if invalid
 *
 * Usage:
 *   const data = validateInput(providerSchema, args);
 *   // data is now validated and sanitized
 */
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
    throw new Error(`Validation failed: ${errors.join(", ")}`);
  }
  return result.data;
}

/**
 * Validate a single field
 *
 * Usage:
 *   const name = validateField(safeTextSchema, args.name, "name");
 */
export function validateField<T>(
  schema: z.ZodSchema<T>,
  value: unknown,
  fieldName: string
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid ${fieldName}: ${result.error.errors[0]?.message}`);
  }
  return result.data;
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Provider = z.infer<typeof providerSchema>;
export type BulkProvider = z.infer<typeof bulkProviderSchema>;
export type User = z.infer<typeof userSchema>;
export type HealthSystem = z.infer<typeof healthSystemSchema>;
export type Hospital = z.infer<typeof hospitalSchema>;
export type Department = z.infer<typeof departmentSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type Skill = z.infer<typeof skillSchema>;
