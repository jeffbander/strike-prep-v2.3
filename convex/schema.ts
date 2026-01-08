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

    // Service Type Classification
    // - "admit": Inpatient services that admit patients (ICU, Tele, Med-Surg)
    // - "procedure": Procedural services (Cath Lab, OR, EP Lab)
    // - "consult": Consultation services
    // - "remote": Remote/telemedicine services
    serviceType: v.optional(v.string()), // "admit" | "procedure" | "consult" | "remote"

    // Admit Service Configuration (only for serviceType = "admit")
    // New patient admissions that count toward total capacity
    admitCapacity: v.optional(v.number()),
    // Where patients are fed from: "er" = Emergency Room, "procedure" = from linked procedure service
    feederSource: v.optional(v.string()), // "er" | "procedure" | null

    // Procedure Service Configuration (only for serviceType = "procedure")
    // Links to the admit service that receives patients from this procedure service
    // e.g., Cath Lab links to Tele - when Cath Lab closes, Tele census is reduced
    linkedDownstreamServiceId: v.optional(v.id("services")),

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
    .index("by_short_code", ["shortCode"])
    .index("by_service_type", ["serviceType"])
    .index("by_linked_downstream", ["linkedDownstreamServiceId"]),

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
    // Default headcount for this job type per shift (used when per-shift headcount not specified)
    headcount: v.optional(v.number()),
    // Per-shift-type headcount configuration (e.g., 5 NPs on AM, 3 on Night, 2 on Weekend)
    weekdayAmHeadcount: v.optional(v.number()),
    weekdayPmHeadcount: v.optional(v.number()),
    weekendAmHeadcount: v.optional(v.number()),
    weekendPmHeadcount: v.optional(v.number()),
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
    hasVisa: v.optional(v.boolean()), // Fellows with visas can only moonlight at home hospital
    smsOptOut: v.optional(v.boolean()), // Provider opted out of SMS (replied STOP)

    createdBy: v.id("users"),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()), // Track last update for upsert operations
  })
    .index("by_health_system", ["healthSystemId"])
    .index("by_hospital", ["hospitalId"])
    .index("by_department", ["departmentId"])
    .index("by_department_active", ["departmentId", "isActive"])
    .index("by_job_type", ["jobTypeId"])
    .index("by_name", ["lastName", "firstName"])
    .index("by_email", ["email"]) // For email-based upsert lookups
    .index("by_cell_phone", ["cellPhone"]), // For SMS reply lookup

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
    .index("by_provider_shift", ["providerId", "shiftId"])
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

  // ═══════════════════════════════════════════════════════════════════
  // STRIKE SCENARIOS
  // For modeling strike events with date ranges and capacity reduction
  // ═══════════════════════════════════════════════════════════════════

  strike_scenarios: defineTable({
    healthSystemId: v.id("health_systems"),
    hospitalId: v.optional(v.id("hospitals")), // Optional: can be health-system wide
    name: v.string(),
    description: v.optional(v.string()),

    // Date range for the strike
    startDate: v.string(), // ISO date "2025-01-03"
    endDate: v.string(), // ISO date "2025-01-10"

    // Affected job types with their reduction percentages
    affectedJobTypes: v.array(
      v.object({
        jobTypeId: v.id("job_types"),
        reductionPercent: v.number(), // 100 = full strike, 50 = half, 25 = quarter
      })
    ),

    // Status workflow
    status: v.string(), // "Draft" | "Active" | "Completed" | "Cancelled"

    createdBy: v.id("users"),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_health_system", ["healthSystemId"])
    .index("by_hospital", ["hospitalId"])
    .index("by_status", ["status"])
    .index("by_date_range", ["startDate", "endDate"]),

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO POSITIONS
  // Date-specific positions generated for a strike scenario
  // ═══════════════════════════════════════════════════════════════════

  scenario_positions: defineTable({
    scenarioId: v.id("strike_scenarios"),
    serviceId: v.id("services"),
    serviceJobTypeId: v.id("service_job_types"),
    jobTypeId: v.id("job_types"),
    hospitalId: v.id("hospitals"),
    departmentId: v.id("departments"),

    // Date and shift specifics
    date: v.string(), // ISO date "2025-01-03"
    shiftType: v.string(), // "AM" | "PM"
    shiftStart: v.string(), // "07:00"
    shiftEnd: v.string(), // "19:00"

    // Position tracking
    positionNumber: v.number(),
    jobCode: v.string(), // Includes date: "ICU_MGH_NP_2025-01-03_AM_1"

    // Headcount tracking for capacity modeling
    originalHeadcount: v.number(), // What it would be without strike
    scenarioHeadcount: v.number(), // Reduced headcount for this scenario

    status: v.string(), // "Open" | "Assigned" | "Confirmed" | "Cancelled"
    isActive: v.boolean(),
  })
    .index("by_scenario", ["scenarioId"])
    .index("by_scenario_date", ["scenarioId", "date"])
    .index("by_scenario_service", ["scenarioId", "serviceId"])
    .index("by_service_date", ["serviceId", "date"])
    .index("by_status", ["status"])
    .index("by_job_code", ["jobCode"]),

  // ═══════════════════════════════════════════════════════════════════
  // PROVIDER AVAILABILITY
  // Date-specific availability for providers (replaces text schedule fields)
  // ═══════════════════════════════════════════════════════════════════

  provider_availability: defineTable({
    providerId: v.id("providers"),
    scenarioId: v.optional(v.id("strike_scenarios")), // Optional: can be general availability

    date: v.string(), // ISO date "2025-01-03"

    // Availability type
    availabilityType: v.string(), // "available" | "unavailable"

    // Shift-specific availability
    amAvailable: v.boolean(),
    pmAvailable: v.boolean(),
    amPreferred: v.optional(v.boolean()), // Marks as preferred shift
    pmPreferred: v.optional(v.boolean()),

    // Optional notes
    notes: v.optional(v.string()),

    // Tracking who entered this
    enteredBy: v.id("users"),
    enteredAt: v.number(),

    // Source of entry for audit purposes
    source: v.string(), // "admin" | "provider" | "bulk_import"
  })
    .index("by_provider", ["providerId"])
    .index("by_provider_date", ["providerId", "date"])
    .index("by_scenario", ["scenarioId"])
    .index("by_date", ["date"]),

  // ═══════════════════════════════════════════════════════════════════
  // SCENARIO ASSIGNMENTS
  // Links providers to scenario-specific positions
  // ═══════════════════════════════════════════════════════════════════

  scenario_assignments: defineTable({
    scenarioPositionId: v.id("scenario_positions"),
    providerId: v.id("providers"),
    scenarioId: v.id("strike_scenarios"),

    status: v.string(), // "Active" | "Confirmed" | "Cancelled"
    assignedAt: v.number(),
    assignedBy: v.id("users"),

    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.id("users")),
    cancelReason: v.optional(v.string()),

    notes: v.optional(v.string()),
  })
    .index("by_position", ["scenarioPositionId"])
    .index("by_provider", ["providerId"])
    .index("by_provider_scenario", ["providerId", "scenarioId"])
    .index("by_scenario", ["scenarioId"])
    .index("by_status", ["status"]),

  // ═══════════════════════════════════════════════════════════════════
  // SMS LOGS
  // Track all SMS messages sent for audit and status tracking
  // ═══════════════════════════════════════════════════════════════════

  sms_logs: defineTable({
    // Direction and threading
    direction: v.optional(v.string()), // "outbound" | "inbound" (optional for backwards compat)
    replyToSmsLogId: v.optional(v.id("sms_logs")), // Links inbound to original outbound

    // Who sent it (for outbound)
    sentBy: v.optional(v.id("users")), // Optional for inbound messages
    healthSystemId: v.optional(v.id("health_systems")), // Optional for inbound

    // Provider info
    providerId: v.optional(v.id("providers")), // Optional: may not match on inbound
    toPhone: v.string(), // Outbound: recipient / Inbound: our Twilio number
    fromPhone: v.optional(v.string()), // Inbound: sender's phone
    providerName: v.optional(v.string()), // Snapshot of provider name

    // Message content
    messageType: v.string(), // "coverage_request" | "shift_confirmation" | "custom" | "inbound_reply"
    message: v.string(),

    // Reply parsing (for inbound)
    replyIntent: v.optional(v.string()), // "confirmed" | "declined" | "interested" | "stop" | "help" | "unclear"

    // Optional context
    scenarioId: v.optional(v.id("strike_scenarios")),
    scenarioPositionId: v.optional(v.id("scenario_positions")),

    // Twilio response
    twilioSid: v.optional(v.string()), // Twilio message SID
    status: v.string(), // "pending" | "sent" | "delivered" | "failed" | "received"
    errorMessage: v.optional(v.string()),

    sentAt: v.number(),
  })
    .index("by_provider", ["providerId"])
    .index("by_sent_by", ["sentBy"])
    .index("by_scenario", ["scenarioId"])
    .index("by_health_system", ["healthSystemId"])
    .index("by_status", ["status"])
    .index("by_sent_at", ["sentAt"])
    .index("by_to_phone", ["toPhone"]) // For finding conversations
    .index("by_from_phone", ["fromPhone"]) // For matching inbound to provider
    .index("by_direction", ["direction"]),

  // ═══════════════════════════════════════════════════════════════════
  // CLAIM TOKENS
  // Self-service shift claiming via email link (no auth required)
  // ═══════════════════════════════════════════════════════════════════

  claim_tokens: defineTable({
    scenarioId: v.id("strike_scenarios"),
    providerId: v.id("providers"),
    token: v.string(), // UUID for secure access
    expiresAt: v.number(), // Timestamp - expires after scenario end date
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_token", ["token"])
    .index("by_scenario", ["scenarioId"])
    .index("by_provider", ["providerId"])
    .index("by_scenario_provider", ["scenarioId", "providerId"]),

  // ═══════════════════════════════════════════════════════════════════
  // ROTATION TYPES
  // Admin-configurable categories for AMion schedule rotations
  // ═══════════════════════════════════════════════════════════════════

  rotation_types: defineTable({
    healthSystemId: v.id("health_systems"),
    name: v.string(), // "Vac", "Sick", "Elective", "Research", "On Call"
    shortCode: v.string(), // "VAC", "SICK", "ELEC"

    // Status categorization
    // "vacation" | "sick" | "on_service" | "curtailable" | "administrative"
    category: v.string(),
    isCurtailable: v.boolean(), // If true, provider can be pulled for strike coverage

    // Display settings
    color: v.string(), // Hex color for grid display (e.g., "#EF4444")

    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_health_system", ["healthSystemId"])
    .index("by_name", ["healthSystemId", "name"])
    .index("by_category", ["healthSystemId", "category"]),

  // ═══════════════════════════════════════════════════════════════════
  // AMION SCHEDULE IMPORTS
  // Metadata about each AMion .sch file import
  // ═══════════════════════════════════════════════════════════════════

  amion_schedule_imports: defineTable({
    departmentId: v.id("departments"),
    hospitalId: v.id("hospitals"),
    healthSystemId: v.id("health_systems"),

    fileName: v.string(),
    amionDepartment: v.optional(v.string()), // From AMion DEPT= field

    // Date range covered by this import
    startDate: v.string(), // ISO date
    endDate: v.string(),

    // Import statistics
    providersProcessed: v.number(),
    assignmentsCreated: v.number(),
    errors: v.optional(v.array(v.string())),

    importedAt: v.number(),
    importedBy: v.id("users"),

    isActive: v.boolean(),
  })
    .index("by_department", ["departmentId"])
    .index("by_hospital", ["hospitalId"])
    .index("by_health_system", ["healthSystemId"])
    .index("by_imported_at", ["importedAt"]),

  // ═══════════════════════════════════════════════════════════════════
  // SCHEDULE ASSIGNMENTS
  // Provider schedule entries parsed from AMion
  // ═══════════════════════════════════════════════════════════════════

  schedule_assignments: defineTable({
    importId: v.id("amion_schedule_imports"),
    providerId: v.id("providers"),

    date: v.string(), // ISO date "2025-01-15"

    // Rotation/Service info
    rotationTypeId: v.optional(v.id("rotation_types")), // Matched to known type
    rotationName: v.string(), // Raw rotation name from AMion (e.g., "MSW CONSULT ATTENDING", "Vac")

    // Computed status derived from rotation type
    // "available" | "on_service" | "vacation" | "curtailable" | "unavailable"
    status: v.string(),

    // Source tracking
    source: v.string(), // "amion_import" | "manual"
    notes: v.optional(v.string()),

    isActive: v.boolean(),
  })
    .index("by_import", ["importId"])
    .index("by_provider", ["providerId"])
    .index("by_provider_date", ["providerId", "date"])
    .index("by_date", ["date"])
    .index("by_status", ["status"]),

  // ═══════════════════════════════════════════════════════════════════
  // CENSUS IMPORTS
  // Metadata for each census Excel/CSV file upload
  // ═══════════════════════════════════════════════════════════════════

  census_imports: defineTable({
    hospitalId: v.id("hospitals"),
    healthSystemId: v.id("health_systems"),

    fileName: v.string(),
    uploadDate: v.string(), // ISO date of the census data (e.g., "2026-01-06")

    // Statistics
    patientsProcessed: v.number(),
    predictionsGenerated: v.number(),
    errors: v.optional(v.array(v.string())),

    // Processing status
    status: v.string(), // "pending" | "processing" | "completed" | "failed"

    importedAt: v.number(),
    importedBy: v.id("users"),

    isActive: v.boolean(),
  })
    .index("by_hospital", ["hospitalId"])
    .index("by_health_system", ["healthSystemId"])
    .index("by_upload_date", ["uploadDate"])
    .index("by_status", ["status"])
    .index("by_imported_at", ["importedAt"]),

  // ═══════════════════════════════════════════════════════════════════
  // CENSUS PATIENTS
  // Individual patient records (PHI-minimized: initials + MRN only)
  // MRN is unique key for upsert - patients can move between units
  // ═══════════════════════════════════════════════════════════════════

  census_patients: defineTable({
    hospitalId: v.id("hospitals"),
    importId: v.id("census_imports"),

    // Identification (PHI-minimized)
    mrn: v.string(), // Medical Record Number - unique key
    initials: v.string(), // "JB" for "Johnson, Bob" - derived from full name

    // Location & Dates
    service: v.optional(v.string()), // ICU only: CSIU, CCU, CVU, CICU
    currentUnitName: v.string(), // Sheet name: "MSH - CSIU", "MSH-N07E"
    unitType: v.string(), // "icu" | "floor"
    admissionDate: v.string(), // YYYY-MM-DD
    censusDate: v.string(), // Date of this census record
    losDays: v.optional(v.number()), // Floor only: current length of stay

    // AI-Generated Fields (from Claude)
    primaryDiagnosis: v.optional(v.string()), // 2-5 sentence narrative
    clinicalStatus: v.optional(v.string()), // Pipe-separated status
    dispositionConsiderations: v.optional(v.string()), // Trajectory, barriers, timeline
    pendingProcedures: v.optional(v.string()), // Scheduled procedures, tests, consults
    projectedDischargeDays: v.optional(v.number()), // Integer: days until discharge

    // Additional tracking
    attendingDoctor: v.optional(v.string()),

    // Retention (3-day rolling window)
    expiresAt: v.number(), // Timestamp for cleanup (now + 3 days)

    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_hospital", ["hospitalId"])
    .index("by_import", ["importId"])
    .index("by_mrn", ["hospitalId", "mrn"]) // For upsert lookup
    .index("by_unit", ["hospitalId", "currentUnitName"])
    .index("by_census_date", ["hospitalId", "censusDate"])
    .index("by_unit_type", ["hospitalId", "unitType"])
    .index("by_expires_at", ["expiresAt"]), // For cleanup job

  // ═══════════════════════════════════════════════════════════════════
  // CENSUS PATIENT HISTORY
  // Tracks unit transfers over time (ICU → Floor, etc.)
  // ═══════════════════════════════════════════════════════════════════

  census_patient_history: defineTable({
    patientId: v.id("census_patients"),
    hospitalId: v.id("hospitals"),
    mrn: v.string(),

    // Movement
    fromUnitName: v.optional(v.string()), // null for initial admission
    toUnitName: v.string(),
    transferDate: v.string(), // ISO date

    // Clinical summary at time of transfer (optional)
    clinicalSummary: v.optional(v.string()),

    createdAt: v.number(),
    expiresAt: v.number(), // 3-day retention
  })
    .index("by_patient", ["patientId"])
    .index("by_hospital", ["hospitalId"])
    .index("by_mrn", ["hospitalId", "mrn"])
    .index("by_date", ["transferDate"])
    .index("by_expires_at", ["expiresAt"]),

  // ═══════════════════════════════════════════════════════════════════
  // CENSUS UNIT MAPPINGS
  // Maps raw unit names from Excel sheets to system units
  // Also classifies unit type (ICU vs Floor)
  // ═══════════════════════════════════════════════════════════════════

  census_unit_mappings: defineTable({
    hospitalId: v.id("hospitals"),
    rawUnitName: v.string(), // "MSH - CSIU", "MSH-N07E"
    unitId: v.optional(v.id("units")), // Matched unit in units table (optional)

    // Unit classification for prompt selection
    unitType: v.string(), // "icu" | "floor"
    isICU: v.boolean(),

    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_hospital", ["hospitalId"])
    .index("by_raw_name", ["hospitalId", "rawUnitName"]),

  // ═══════════════════════════════════════════════════════════════════
  // AMION IMPORTS
  // Imported Amion schedule files for tracking source schedules
  // ═══════════════════════════════════════════════════════════════════

  amion_imports: defineTable({
    healthSystemId: v.id("health_systems"),
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),
    department: v.string(), // DEPT= from file (e.g., "Cardiology - MSW")
    startDate: v.string(), // Schedule start date
    endDate: v.string(), // Schedule end date
    importedAt: v.number(),
    importedBy: v.id("users"),
    sourceFileName: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_health_system", ["healthSystemId"])
    .index("by_hospital", ["hospitalId"])
    .index("by_department", ["departmentId"])
    .index("by_imported_at", ["importedAt"]),

  // ═══════════════════════════════════════════════════════════════════
  // AMION SERVICES
  // Services/shifts from xln section with redeployment classification
  // ═══════════════════════════════════════════════════════════════════

  amion_services: defineTable({
    amionImportId: v.id("amion_imports"),
    name: v.string(), // NAME= from xln
    amionId: v.number(), // ID= (used in ROW decoding)
    shiftDisplay: v.optional(v.string()), // "7a-5p" (display format)
    redeploymentStatus: v.string(), // "redeployable" | "essential" | "unclassified"
    isActive: v.boolean(),
  })
    .index("by_import", ["amionImportId"])
    .index("by_redeployment_status", ["redeploymentStatus"]),

  // ═══════════════════════════════════════════════════════════════════
  // AMION ASSIGNMENTS
  // Daily assignments decoded from ROW data for schedule grid display
  // Supports split shifts with primary and secondary providers
  // ═══════════════════════════════════════════════════════════════════

  amion_assignments: defineTable({
    amionImportId: v.id("amion_imports"),
    amionServiceId: v.id("amion_services"),

    // Primary provider (always present)
    providerId: v.optional(v.id("providers")), // Linked provider (if matched)
    providerName: v.string(), // Name from Amion (for display)
    providerAmionId: v.number(), // ID= from staff section
    shiftStart: v.optional(v.string()), // "7a" or "07:00" - start time for primary
    shiftEnd: v.optional(v.string()), // "5p" or "17:00" - end time for primary

    // Secondary provider (for split shifts like "Shahab 7a-5p / GOLDFINGER 5p-7a")
    secondaryProviderId: v.optional(v.id("providers")), // Linked secondary provider
    secondaryProviderName: v.optional(v.string()), // Secondary provider name from Amion
    secondaryProviderAmionId: v.optional(v.number()), // Secondary provider Amion ID
    secondaryShiftStart: v.optional(v.string()), // "5p" or "17:00"
    secondaryShiftEnd: v.optional(v.string()), // "7a" or "07:00"

    date: v.string(), // "2025-12-01"
    isActive: v.boolean(),
  })
    .index("by_import", ["amionImportId"])
    .index("by_service", ["amionServiceId"])
    .index("by_provider", ["providerId"])
    .index("by_secondary_provider", ["secondaryProviderId"])
    .index("by_date", ["date"])
    .index("by_import_date", ["amionImportId", "date"]),

  // ═══════════════════════════════════════════════════════════════════
  // AMION WEB CONFIGS
  // Configuration for web scraping Amion schedules
  // ═══════════════════════════════════════════════════════════════════

  amion_web_configs: defineTable({
    healthSystemId: v.id("health_systems"),
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),

    name: v.string(), // "MSW Cardiology"
    siteCode: v.string(), // "mssm"
    locationCode: v.string(), // "msw20lqu" (Lo= parameter)

    // Optional credentials for authenticated scraping
    username: v.optional(v.string()),
    // Note: passwords should be stored in environment variables, not database

    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    lastScrapedAt: v.optional(v.number()),
  })
    .index("by_health_system", ["healthSystemId"])
    .index("by_site_code", ["siteCode"])
    .index("by_active", ["isActive"]),
});
