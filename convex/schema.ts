import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ═══════════════════════════════════════════════════════════════════
  // USERS (synced from Clerk)
  // ═══════════════════════════════════════════════════════════════════

  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    role: v.string(), // "super_admin" | "health_system_admin" | "hospital_admin" | "departmental_admin"

    // Scope - which entities can this user access?
    healthSystemId: v.optional(v.id("health_systems")),
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),

    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_health_system", ["healthSystemId"])
    .index("by_hospital", ["hospitalId"])
    .index("by_department", ["departmentId"]),

  // ═══════════════════════════════════════════════════════════════════
  // HEALTH SYSTEMS
  // ═══════════════════════════════════════════════════════════════════

  health_systems: defineTable({
    name: v.string(),
    slug: v.string(),
    createdBy: v.id("users"),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_active", ["isActive"]),

  // ═══════════════════════════════════════════════════════════════════
  // JOB TYPES (Health System Level)
  // ═══════════════════════════════════════════════════════════════════

  job_types: defineTable({
    healthSystemId: v.id("health_systems"),
    name: v.string(),
    code: v.string(),
    description: v.optional(v.string()),
    isDefault: v.boolean(),
    isActive: v.boolean(),
  })
    .index("by_health_system", ["healthSystemId"])
    .index("by_health_system_code", ["healthSystemId", "code"]),

  // ═══════════════════════════════════════════════════════════════════
  // HOSPITALS
  // ═══════════════════════════════════════════════════════════════════

  hospitals: defineTable({
    healthSystemId: v.id("health_systems"),
    name: v.string(),
    shortCode: v.string(),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    timezone: v.string(),
    createdBy: v.id("users"),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_health_system", ["healthSystemId"])
    .index("by_short_code", ["shortCode"]),

  // ═══════════════════════════════════════════════════════════════════
  // UNITS (Hospital Floor/Unit tracking)
  // ═══════════════════════════════════════════════════════════════════

  units: defineTable({
    hospitalId: v.id("hospitals"),
    name: v.string(), // "7E", "ICU", "CCU"
    description: v.optional(v.string()),
    floorNumber: v.optional(v.string()),
    createdBy: v.id("users"),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_hospital", ["hospitalId"])
    .index("by_hospital_active", ["hospitalId", "isActive"]),

  // ═══════════════════════════════════════════════════════════════════
  // DEPARTMENTS
  // ═══════════════════════════════════════════════════════════════════

  departments: defineTable({
    hospitalId: v.id("hospitals"),
    healthSystemId: v.id("health_systems"),
    name: v.string(),
    isDefault: v.boolean(),
    isActive: v.boolean(),
  })
    .index("by_hospital", ["hospitalId"])
    .index("by_health_system", ["healthSystemId"]),

  // ═══════════════════════════════════════════════════════════════════
  // DEPARTMENT SKILLS (Skills required by department)
  // ═══════════════════════════════════════════════════════════════════

  department_skills: defineTable({
    departmentId: v.id("departments"),
    skillId: v.id("skills"),
    isRequired: v.boolean(),
    addedBy: v.id("users"),
    addedAt: v.number(),
  })
    .index("by_department", ["departmentId"])
    .index("by_skill", ["skillId"]),

  // ═══════════════════════════════════════════════════════════════════
  // SKILLS (System-wide)
  // ═══════════════════════════════════════════════════════════════════

  skills: defineTable({
    name: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
    isSystemDefault: v.boolean(),
    isActive: v.boolean(),
  })
    .index("by_category", ["category"])
    .index("by_name", ["name"]),

  // ═══════════════════════════════════════════════════════════════════
  // SERVICES
  // ═══════════════════════════════════════════════════════════════════

  services: defineTable({
    departmentId: v.id("departments"),
    hospitalId: v.id("hospitals"),
    healthSystemId: v.id("health_systems"),
    name: v.string(),
    shortCode: v.string(), // For job code generation
    unitId: v.optional(v.id("units")),

    // Patient Capacity
    dayCapacity: v.optional(v.number()),
    nightCapacity: v.optional(v.number()),
    weekendCapacity: v.optional(v.number()),

    // Shift times (configurable per service)
    dayShiftStart: v.string(), // "07:00"
    dayShiftEnd: v.string(), // "19:00"
    nightShiftStart: v.string(), // "19:00"
    nightShiftEnd: v.string(), // "07:00"

    operatesDays: v.boolean(),
    operatesNights: v.boolean(),
    operatesWeekends: v.boolean(),
    createdBy: v.id("users"),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_department", ["departmentId"])
    .index("by_hospital", ["hospitalId"])
    .index("by_health_system", ["healthSystemId"])
    .index("by_short_code", ["shortCode"]),

  // ═══════════════════════════════════════════════════════════════════
  // SERVICE JOB TYPES
  // Per-job-type shift configuration for flexible scheduling
  // ═══════════════════════════════════════════════════════════════════

  service_job_types: defineTable({
    serviceId: v.id("services"),
    jobTypeId: v.id("job_types"),
    // Per-job-type shift configuration (optional - falls back to service defaults)
    dayShiftStart: v.optional(v.string()), // "07:00"
    dayShiftEnd: v.optional(v.string()), // "19:00"
    nightShiftStart: v.optional(v.string()), // "19:00"
    nightShiftEnd: v.optional(v.string()), // "07:00"
    // Which shifts this job type works (overrides service-level settings)
    operatesDays: v.optional(v.boolean()),
    operatesNights: v.optional(v.boolean()),
    // Headcount for this job type per shift
    headcount: v.optional(v.number()),
  })
    .index("by_service", ["serviceId"])
    .index("by_job_type", ["jobTypeId"]),

  // ═══════════════════════════════════════════════════════════════════
  // SERVICE JOB TYPE SKILLS
  // ═══════════════════════════════════════════════════════════════════

  service_job_type_skills: defineTable({
    serviceJobTypeId: v.id("service_job_types"),
    skillId: v.id("skills"),
    isRequired: v.boolean(),
  })
    .index("by_service_job_type", ["serviceJobTypeId"])
    .index("by_skill", ["skillId"]),

  // ═══════════════════════════════════════════════════════════════════
  // SHIFTS
  // ═══════════════════════════════════════════════════════════════════

  shifts: defineTable({
    serviceId: v.id("services"),
    serviceJobTypeId: v.id("service_job_types"),
    name: v.string(),
    shiftType: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    positionsNeeded: v.number(),
    isActive: v.boolean(),
  })
    .index("by_service", ["serviceId"])
    .index("by_service_job_type", ["serviceJobTypeId"]),

  // ═══════════════════════════════════════════════════════════════════
  // JOB POSITIONS
  // ═══════════════════════════════════════════════════════════════════

  job_positions: defineTable({
    shiftId: v.id("shifts"),
    serviceJobTypeId: v.id("service_job_types"),
    serviceId: v.id("services"),
    hospitalId: v.id("hospitals"),
    departmentId: v.id("departments"),
    jobCode: v.string(),
    positionNumber: v.number(),
    status: v.string(), // "Open" | "Assigned" | "Confirmed" | "Cancelled"
    isActive: v.boolean(),
  })
    .index("by_shift", ["shiftId"])
    .index("by_service", ["serviceId"])
    .index("by_hospital", ["hospitalId"])
    .index("by_department", ["departmentId"])
    .index("by_status", ["status"])
    .index("by_job_code", ["jobCode"]),

  // ═══════════════════════════════════════════════════════════════════
  // PROVIDERS
  // ═══════════════════════════════════════════════════════════════════

  providers: defineTable({
    healthSystemId: v.id("health_systems"),
    hospitalId: v.id("hospitals"),
    departmentId: v.id("departments"),
    jobTypeId: v.id("job_types"),

    firstName: v.string(),
    lastName: v.string(),
    employeeId: v.optional(v.string()),
    cellPhone: v.optional(v.string()),
    email: v.optional(v.string()),
    currentScheduleDays: v.optional(v.string()),
    currentScheduleTime: v.optional(v.string()),
    supervisingPhysician: v.optional(v.string()),
    specialtyCertification: v.optional(v.string()),
    previousExperience: v.optional(v.string()),

    createdBy: v.id("users"),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_health_system", ["healthSystemId"])
    .index("by_hospital", ["hospitalId"])
    .index("by_department", ["departmentId"])
    .index("by_department_active", ["departmentId", "isActive"])
    .index("by_job_type", ["jobTypeId"])
    .index("by_name", ["lastName", "firstName"]),

  // ═══════════════════════════════════════════════════════════════════
  // PROVIDER SKILLS
  // ═══════════════════════════════════════════════════════════════════

  provider_skills: defineTable({
    providerId: v.id("providers"),
    skillId: v.id("skills"),
  })
    .index("by_provider", ["providerId"])
    .index("by_skill", ["skillId"]),

  // ═══════════════════════════════════════════════════════════════════
  // PROVIDER HOSPITAL ACCESS
  // ═══════════════════════════════════════════════════════════════════

  provider_hospital_access: defineTable({
    providerId: v.id("providers"),
    hospitalId: v.id("hospitals"),
  })
    .index("by_provider", ["providerId"])
    .index("by_hospital", ["hospitalId"]),

  // ═══════════════════════════════════════════════════════════════════
  // ASSIGNMENTS
  // ═══════════════════════════════════════════════════════════════════

  assignments: defineTable({
    jobPositionId: v.id("job_positions"),
    providerId: v.id("providers"),
    hospitalId: v.id("hospitals"),
    departmentId: v.id("departments"),
    shiftId: v.id("shifts"),

    status: v.string(), // "Active" | "Confirmed" | "Cancelled"
    assignedAt: v.number(),
    assignedBy: v.id("users"),

    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.id("users")),
    cancelReason: v.optional(v.string()),

    notes: v.optional(v.string()),
  })
    .index("by_job_position", ["jobPositionId"])
    .index("by_provider", ["providerId"])
    .index("by_provider_status", ["providerId", "status"])
    .index("by_hospital", ["hospitalId"])
    .index("by_department", ["departmentId"])
    .index("by_status", ["status"]),

  // ═══════════════════════════════════════════════════════════════════
  // AUDIT LOGS
  // ═══════════════════════════════════════════════════════════════════

  audit_logs: defineTable({
    userId: v.id("users"),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.optional(v.string()),
    changes: v.optional(v.any()),
    timestamp: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_timestamp", ["timestamp"]),
});
