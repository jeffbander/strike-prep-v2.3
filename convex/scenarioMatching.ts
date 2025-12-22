import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireAuth, requireDepartmentAccess, auditLog } from "./lib/auth";

// ═══════════════════════════════════════════════════════════════════
// JOB TYPE HIERARCHY FOR CROSS-COVERAGE
// Higher level providers can cover lower level positions
// ═══════════════════════════════════════════════════════════════════

const JOB_TYPE_HIERARCHY: Record<string, number> = {
  "MD": 4,    // Doctors
  "FEL": 4,   // Fellows = MD level
  "RES": 4,   // Residents = MD level
  "NP": 3,    // Nurse Practitioners
  "PA": 3,    // Physician Assistants
  "RN": 2,    // Registered Nurses
};

/**
 * Check if a provider's job type can cover a position's job type
 * Based on hierarchy: MD/FEL/RES → NP/PA → RN
 */
function canCoverJobType(providerCode: string, positionCode: string): boolean {
  const providerLevel = JOB_TYPE_HIERARCHY[providerCode] ?? 1;
  const positionLevel = JOB_TYPE_HIERARCHY[positionCode] ?? 1;
  return providerLevel >= positionLevel;
}

// ═══════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Find matching providers for a scenario position
 * Cross-job-type matching: Non-striking providers can cover striking positions based on hierarchy
 * Availability is optional - affects score but doesn't filter out providers
 */
export const findMatchesForPosition = query({
  args: { scenarioPositionId: v.id("scenario_positions") },
  handler: async (ctx, args) => {
    const position = await ctx.db.get(args.scenarioPositionId);
    if (!position) return { error: "Position not found", matches: [] };

    if (position.status !== "Open") {
      return { error: "Position is not open", matches: [] };
    }

    // Get position details
    const service = await ctx.db.get(position.serviceId);
    const serviceJobType = await ctx.db.get(position.serviceJobTypeId);
    const positionJobType = await ctx.db.get(position.jobTypeId);

    if (!service || !serviceJobType || !positionJobType) {
      return { error: "Position data incomplete", matches: [] };
    }

    // Get the scenario to know which job types are striking
    const scenario = await ctx.db.get(position.scenarioId);
    if (!scenario) return { error: "Scenario not found", matches: [] };

    const strikingJobTypeIds = new Set(
      scenario.affectedJobTypes.map((ajt) => ajt.jobTypeId.toString())
    );

    // Get required skills for this position
    const skillLinks = await ctx.db
      .query("service_job_type_skills")
      .withIndex("by_service_job_type", (q) =>
        q.eq("serviceJobTypeId", position.serviceJobTypeId)
      )
      .filter((q) => q.eq(q.field("isRequired"), true))
      .collect();

    const requiredSkillIds = skillLinks.map((sl) => sl.skillId);

    // Get ALL active providers (not filtered by job type)
    // We'll filter by hierarchy and striking status
    const allProviders = await ctx.db
      .query("providers")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const matches: any[] = [];

    for (const provider of allProviders) {
      // Get provider's job type
      const providerJobType = await ctx.db.get(provider.jobTypeId);
      if (!providerJobType) continue;

      // Skip providers whose job type is striking (they're not available to cover)
      if (strikingJobTypeIds.has(provider.jobTypeId.toString())) {
        continue;
      }

      // Check if provider's job type can cover the position's job type (hierarchy)
      if (!canCoverJobType(providerJobType.code, positionJobType.code)) {
        continue;
      }

      // Check hospital access
      const canWorkAtHospital = await checkHospitalAccess(
        ctx,
        provider._id,
        provider.hospitalId,
        position.hospitalId
      );
      if (!canWorkAtHospital) continue;

      // Check visa restriction for fellows
      // Fellows with visas can ONLY work at their home hospital
      if (provider.hasVisa && providerJobType.code === "FEL") {
        if (provider.hospitalId !== position.hospitalId) {
          continue; // Skip: Fellow with visa cannot moonlight outside home hospital
        }
      }

      // Check for shift conflicts (already assigned to same date/shift)
      const existingAssignments = await ctx.db
        .query("scenario_assignments")
        .withIndex("by_provider_scenario", (q) =>
          q.eq("providerId", provider._id).eq("scenarioId", position.scenarioId)
        )
        .filter((q) => q.neq(q.field("status"), "Cancelled"))
        .collect();

      // Check if any assignment is for the same date/shift
      let hasConflict = false;
      for (const assignment of existingAssignments) {
        const assignedPos = await ctx.db.get(assignment.scenarioPositionId);
        if (
          assignedPos &&
          assignedPos.date === position.date &&
          assignedPos.shiftType === position.shiftType
        ) {
          hasConflict = true;
          break;
        }
      }
      if (hasConflict) continue;

      // Check availability (OPTIONAL - affects score, not eligibility)
      const availability = await ctx.db
        .query("provider_availability")
        .withIndex("by_provider_date", (q) =>
          q.eq("providerId", provider._id).eq("date", position.date)
        )
        .first();

      let availabilityStatus: "available" | "preferred" | "unavailable" | "unknown" = "unknown";
      let isPreferred = false;

      if (availability) {
        if (availability.availabilityType === "unavailable") {
          availabilityStatus = "unavailable";
        } else {
          const isAvailableForShift =
            position.shiftType === "AM"
              ? availability.amAvailable
              : availability.pmAvailable;
          const isPreferredForShift =
            position.shiftType === "AM"
              ? availability.amPreferred ?? false
              : availability.pmPreferred ?? false;

          if (isPreferredForShift) {
            availabilityStatus = "preferred";
            isPreferred = true;
          } else if (isAvailableForShift) {
            availabilityStatus = "available";
          } else {
            availabilityStatus = "unavailable";
          }
        }
      }

      // Calculate skill match
      const providerSkills = await ctx.db
        .query("provider_skills")
        .withIndex("by_provider", (q) => q.eq("providerId", provider._id))
        .collect();

      const providerSkillIds = new Set(providerSkills.map((ps) => ps.skillId.toString()));
      const matchedSkills: Id<"skills">[] = [];
      const missingSkills: Id<"skills">[] = [];

      for (const skillId of requiredSkillIds) {
        if (providerSkillIds.has(skillId.toString())) {
          matchedSkills.push(skillId);
        } else {
          missingSkills.push(skillId);
        }
      }

      // Calculate match quality
      let matchQuality: "Perfect" | "Good" | "Partial" = "Partial";
      if (missingSkills.length === 0) {
        matchQuality = "Perfect";
      } else if (matchedSkills.length > missingSkills.length) {
        matchQuality = "Good";
      }

      // Calculate workload in this scenario
      const currentAssignmentCount = existingAssignments.length;

      // Calculate score
      // Priority: Availability > Preferred shift > skill match > home department > fewer assignments
      let score = 0;

      // Skill matching
      score += matchedSkills.length * 10;
      score -= missingSkills.length * 15;

      // Availability scoring (optional - boosts or penalizes)
      if (availabilityStatus === "preferred") {
        score += 50;
      } else if (availabilityStatus === "available") {
        score += 20;
      } else if (availabilityStatus === "unavailable") {
        score -= 30; // Penalize but still show
      }
      // "unknown" = 0 (neutral)

      // Location preferences
      if (provider.departmentId === position.departmentId) score += 20;
      if (provider.hospitalId === position.hospitalId) score += 10;

      // Workload balance
      score -= currentAssignmentCount * 5; // Prefer less-busy providers

      // Get skill names for display
      const matchedSkillDetails = await Promise.all(
        matchedSkills.map(async (sid) => {
          const skill = await ctx.db.get(sid);
          return skill?.name;
        })
      );

      const missingSkillDetails = await Promise.all(
        missingSkills.map(async (sid) => {
          const skill = await ctx.db.get(sid);
          return skill?.name;
        })
      );

      matches.push({
        providerId: provider._id,
        providerName: `${provider.firstName} ${provider.lastName}`,
        providerEmail: provider.email,
        providerJobTypeName: providerJobType.name,
        providerJobTypeCode: providerJobType.code,
        matchQuality,
        availabilityStatus,
        isPreferred,
        matchedSkills: matchedSkillDetails.filter(Boolean),
        missingSkills: missingSkillDetails.filter(Boolean),
        currentAssignmentCount,
        score,
        isHomeDepartment: provider.departmentId === position.departmentId,
        isHomeHospital: provider.hospitalId === position.hospitalId,
        availabilityNotes: availability?.notes,
        hasVisa: provider.hasVisa ?? false,
      });
    }

    // Sort by score (descending), then by assignment count (ascending), then by name
    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.currentAssignmentCount !== b.currentAssignmentCount) {
        return a.currentAssignmentCount - b.currentAssignmentCount;
      }
      return a.providerName.localeCompare(b.providerName);
    });

    return {
      position: {
        ...position,
        serviceName: service.name,
        serviceCode: service.shortCode,
        jobTypeName: positionJobType.name,
        jobTypeCode: positionJobType.code,
      },
      requiredSkillCount: requiredSkillIds.length,
      matches,
    };
  },
});

async function checkHospitalAccess(
  ctx: any,
  providerId: Id<"providers">,
  homeHospitalId: Id<"hospitals">,
  targetHospitalId: Id<"hospitals">
): Promise<boolean> {
  // Home hospital is always accessible
  if (homeHospitalId === targetHospitalId) return true;

  // Check explicit access
  const access = await ctx.db
    .query("provider_hospital_access")
    .withIndex("by_provider", (q: any) => q.eq("providerId", providerId))
    .filter((q: any) => q.eq(q.field("hospitalId"), targetHospitalId))
    .first();

  return !!access;
}

/**
 * Get provider's current workload in a scenario
 */
export const getProviderWorkload = query({
  args: {
    providerId: v.id("providers"),
    scenarioId: v.id("strike_scenarios"),
  },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("scenario_assignments")
      .withIndex("by_provider_scenario", (q) =>
        q.eq("providerId", args.providerId).eq("scenarioId", args.scenarioId)
      )
      .filter((q) => q.neq(q.field("status"), "Cancelled"))
      .collect();

    // Get position details for each assignment
    const enrichedAssignments = await Promise.all(
      assignments.map(async (assignment) => {
        const position = await ctx.db.get(assignment.scenarioPositionId);
        const service = position ? await ctx.db.get(position.serviceId) : null;
        return {
          ...assignment,
          date: position?.date,
          shiftType: position?.shiftType,
          serviceName: service?.name,
        };
      })
    );

    // Group by date
    const byDate: Record<string, any[]> = {};
    for (const a of enrichedAssignments) {
      if (a.date) {
        if (!byDate[a.date]) byDate[a.date] = [];
        byDate[a.date].push(a);
      }
    }

    return {
      totalAssignments: assignments.length,
      assignments: enrichedAssignments,
      byDate,
    };
  },
});

/**
 * Get coverage gaps - positions with no or low matching providers
 */
export const getCoverageGaps = query({
  args: { scenarioId: v.id("strike_scenarios") },
  handler: async (ctx, args) => {
    const positions = await ctx.db
      .query("scenario_positions")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
      .filter((q) =>
        q.and(q.eq(q.field("isActive"), true), q.eq(q.field("status"), "Open"))
      )
      .collect();

    const gaps: any[] = [];

    for (const position of positions) {
      const service = await ctx.db.get(position.serviceId);

      gaps.push({
        positionId: position._id,
        date: position.date,
        shiftType: position.shiftType,
        serviceName: service?.name,
        serviceCode: service?.shortCode,
        positionNumber: position.positionNumber,
      });
    }

    // Sort by date, then service, then shift
    gaps.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.serviceName !== b.serviceName)
        return (a.serviceName || "").localeCompare(b.serviceName || "");
      return a.shiftType.localeCompare(b.shiftType);
    });

    return gaps;
  },
});

// ═══════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a scenario assignment
 */
export const createAssignment = mutation({
  args: {
    scenarioPositionId: v.id("scenario_positions"),
    providerId: v.id("providers"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const position = await ctx.db.get(args.scenarioPositionId);
    if (!position) throw new Error("Position not found");

    if (position.status !== "Open") {
      throw new Error("Position is not open for assignment");
    }

    const provider = await ctx.db.get(args.providerId);
    if (!provider) throw new Error("Provider not found");

    const user = await requireDepartmentAccess(ctx, position.departmentId);

    // Check for conflicts
    const existingAssignments = await ctx.db
      .query("scenario_assignments")
      .withIndex("by_provider_scenario", (q) =>
        q.eq("providerId", args.providerId).eq("scenarioId", position.scenarioId)
      )
      .filter((q) => q.neq(q.field("status"), "Cancelled"))
      .collect();

    for (const assignment of existingAssignments) {
      const assignedPos = await ctx.db.get(assignment.scenarioPositionId);
      if (
        assignedPos &&
        assignedPos.date === position.date &&
        assignedPos.shiftType === position.shiftType
      ) {
        throw new Error(
          `Provider already assigned to ${position.shiftType} shift on ${position.date}`
        );
      }
    }

    // Create assignment
    const assignmentId = await ctx.db.insert("scenario_assignments", {
      scenarioPositionId: args.scenarioPositionId,
      providerId: args.providerId,
      scenarioId: position.scenarioId,
      status: "Active",
      assignedAt: Date.now(),
      assignedBy: user._id,
      notes: args.notes,
    });

    // Update position status
    await ctx.db.patch(args.scenarioPositionId, { status: "Assigned" });

    await auditLog(ctx, user, "ASSIGN", "SCENARIO_ASSIGNMENT", assignmentId, {
      providerId: args.providerId,
      positionId: args.scenarioPositionId,
      date: position.date,
      shiftType: position.shiftType,
    });

    return { assignmentId };
  },
});

/**
 * Confirm an assignment
 */
export const confirmAssignment = mutation({
  args: { assignmentId: v.id("scenario_assignments") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error("Assignment not found");

    if (assignment.status !== "Active") {
      throw new Error("Can only confirm active assignments");
    }

    const position = await ctx.db.get(assignment.scenarioPositionId);
    if (!position) throw new Error("Position not found");

    const user = await requireDepartmentAccess(ctx, position.departmentId);

    await ctx.db.patch(args.assignmentId, { status: "Confirmed" });
    await ctx.db.patch(assignment.scenarioPositionId, { status: "Confirmed" });

    await auditLog(ctx, user, "UPDATE", "SCENARIO_ASSIGNMENT", args.assignmentId, {
      action: "confirm",
    });

    return { success: true };
  },
});

/**
 * Cancel an assignment
 */
export const cancelAssignment = mutation({
  args: {
    assignmentId: v.id("scenario_assignments"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error("Assignment not found");

    if (assignment.status === "Cancelled") {
      throw new Error("Assignment is already cancelled");
    }

    const position = await ctx.db.get(assignment.scenarioPositionId);
    if (!position) throw new Error("Position not found");

    const user = await requireDepartmentAccess(ctx, position.departmentId);

    await ctx.db.patch(args.assignmentId, {
      status: "Cancelled",
      cancelledAt: Date.now(),
      cancelledBy: user._id,
      cancelReason: args.reason,
    });

    // Reopen position
    await ctx.db.patch(assignment.scenarioPositionId, { status: "Open" });

    await auditLog(ctx, user, "CANCEL", "SCENARIO_ASSIGNMENT", args.assignmentId, {
      reason: args.reason,
    });

    return { success: true };
  },
});

/**
 * Get assignments for a scenario
 */
export const getAssignments = query({
  args: {
    scenarioId: v.id("strike_scenarios"),
    date: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let assignments = await ctx.db
      .query("scenario_assignments")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
      .collect();

    if (args.status) {
      assignments = assignments.filter((a) => a.status === args.status);
    }

    // Enrich with details
    const enriched = await Promise.all(
      assignments.map(async (assignment) => {
        const position = await ctx.db.get(assignment.scenarioPositionId);
        const provider = await ctx.db.get(assignment.providerId);
        const service = position ? await ctx.db.get(position.serviceId) : null;
        const jobType = position ? await ctx.db.get(position.jobTypeId) : null;

        return {
          ...assignment,
          position: position
            ? {
                date: position.date,
                shiftType: position.shiftType,
                jobCode: position.jobCode,
              }
            : null,
          providerName: provider
            ? `${provider.firstName} ${provider.lastName}`
            : "Unknown",
          serviceName: service?.name,
          jobTypeName: jobType?.name,
        };
      })
    );

    // Filter by date if provided
    let result = enriched;
    if (args.date) {
      result = enriched.filter((a) => a.position?.date === args.date);
    }

    return result.sort((a, b) => {
      // Sort by date, then service, then shift
      const dateA = a.position?.date || "";
      const dateB = b.position?.date || "";
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      if (a.serviceName !== b.serviceName)
        return (a.serviceName || "").localeCompare(b.serviceName || "");
      return (a.position?.shiftType || "").localeCompare(
        b.position?.shiftType || ""
      );
    });
  },
});

/**
 * Get grid data for scenario matching view
 * Returns positions grouped by service/role and organized by date/shift
 */
export const getGridData = query({
  args: {
    scenarioId: v.id("strike_scenarios"),
  },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) return { error: "Scenario not found", services: [], dates: [] };

    // Get all positions for this scenario
    const positions = await ctx.db
      .query("scenario_positions")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Get all assignments for this scenario
    const assignments = await ctx.db
      .query("scenario_assignments")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
      .filter((q) => q.neq(q.field("status"), "Cancelled"))
      .collect();

    // Create assignment lookup
    const assignmentByPosition = new Map<string, any>();
    for (const assignment of assignments) {
      const provider = await ctx.db.get(assignment.providerId);
      assignmentByPosition.set(assignment.scenarioPositionId.toString(), {
        ...assignment,
        providerName: provider ? `${provider.firstName} ${provider.lastName}` : "Unknown",
        providerInitials: provider
          ? `${provider.firstName[0]}${provider.lastName[0]}`
          : "??",
      });
    }

    // Get unique dates and sort them
    const dates = [...new Set(positions.map((p) => p.date))].sort();

    // Group positions by service + jobType
    const serviceJobTypeGroups = new Map<string, any>();

    for (const position of positions) {
      const service = await ctx.db.get(position.serviceId);
      const jobType = await ctx.db.get(position.jobTypeId);
      if (!service || !jobType) continue;

      const key = `${position.serviceId}-${position.jobTypeId}`;

      if (!serviceJobTypeGroups.has(key)) {
        serviceJobTypeGroups.set(key, {
          serviceId: position.serviceId,
          serviceName: service.name,
          serviceCode: service.shortCode,
          jobTypeId: position.jobTypeId,
          jobTypeName: jobType.name,
          jobTypeCode: jobType.code,
          positions: new Map<number, any>(), // positionNumber -> date/shift data
          maxPositionNumber: 0,
        });
      }

      const group = serviceJobTypeGroups.get(key)!;
      group.maxPositionNumber = Math.max(group.maxPositionNumber, position.positionNumber);

      if (!group.positions.has(position.positionNumber)) {
        group.positions.set(position.positionNumber, {});
      }

      const posData = group.positions.get(position.positionNumber)!;
      const dateShiftKey = `${position.date}-${position.shiftType}`;

      const assignment = assignmentByPosition.get(position._id.toString());

      posData[dateShiftKey] = {
        positionId: position._id,
        status: position.status,
        providerName: assignment?.providerName,
        providerInitials: assignment?.providerInitials,
        providerId: assignment?.providerId,
        assignmentId: assignment?._id,
        assignmentStatus: assignment?.status,
      };
    }

    // Convert to array format for the grid
    const services = Array.from(serviceJobTypeGroups.values()).map((group) => ({
      serviceId: group.serviceId,
      serviceName: group.serviceName,
      serviceCode: group.serviceCode,
      jobTypeId: group.jobTypeId,
      jobTypeName: group.jobTypeName,
      jobTypeCode: group.jobTypeCode,
      positionCount: group.maxPositionNumber,
      rows: Array.from({ length: group.maxPositionNumber }, (_, i) => {
        const positionNumber = i + 1;
        const posData = group.positions.get(positionNumber) || {};

        // Build shifts array for each date
        const shifts: any[] = [];
        for (const date of dates) {
          const amKey = `${date}-AM`;
          const pmKey = `${date}-PM`;
          shifts.push({
            date,
            am: posData[amKey] || null,
            pm: posData[pmKey] || null,
          });
        }

        return {
          positionNumber,
          shifts,
        };
      }),
    }));

    // Sort services by name then job type
    services.sort((a, b) => {
      if (a.serviceName !== b.serviceName) return a.serviceName.localeCompare(b.serviceName);
      return a.jobTypeCode.localeCompare(b.jobTypeCode);
    });

    return {
      scenarioName: scenario.name,
      startDate: scenario.startDate,
      endDate: scenario.endDate,
      dates,
      services,
    };
  },
});

/**
 * Get available providers for drag-and-drop assignment
 * Cross-job-type matching: Non-striking providers can cover striking positions based on hierarchy
 * Availability is optional - affects sorting but doesn't filter out providers
 */
export const getAvailableProviders = query({
  args: {
    scenarioId: v.id("strike_scenarios"),
    date: v.string(),
    shiftType: v.string(),
    positionJobTypeId: v.optional(v.id("job_types")), // The job type of the POSITION being filled
  },
  handler: async (ctx, args) => {
    // Get scenario to know which job types are striking
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) return [];

    const strikingJobTypeIds = new Set(
      scenario.affectedJobTypes.map((ajt) => ajt.jobTypeId.toString())
    );

    // Get position job type code if provided (for hierarchy filtering)
    let positionJobTypeCode: string | null = null;
    if (args.positionJobTypeId) {
      const posJobType = await ctx.db.get(args.positionJobTypeId);
      positionJobTypeCode = posJobType?.code ?? null;
    }

    // Get ALL active providers
    const allProviders = await ctx.db
      .query("providers")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const availableProviders: any[] = [];

    for (const provider of allProviders) {
      // Get provider's job type
      const providerJobType = await ctx.db.get(provider.jobTypeId);
      if (!providerJobType) continue;

      // Skip providers whose job type is striking
      if (strikingJobTypeIds.has(provider.jobTypeId.toString())) {
        continue;
      }

      // If position job type is specified, check hierarchy
      if (positionJobTypeCode && !canCoverJobType(providerJobType.code, positionJobTypeCode)) {
        continue;
      }

      // Check for existing assignment conflicts
      const existingAssignments = await ctx.db
        .query("scenario_assignments")
        .withIndex("by_provider_scenario", (q) =>
          q.eq("providerId", provider._id).eq("scenarioId", args.scenarioId)
        )
        .filter((q) => q.neq(q.field("status"), "Cancelled"))
        .collect();

      let hasConflict = false;
      for (const assignment of existingAssignments) {
        const pos = await ctx.db.get(assignment.scenarioPositionId);
        if (pos && pos.date === args.date && pos.shiftType === args.shiftType) {
          hasConflict = true;
          break;
        }
      }
      if (hasConflict) continue;

      // Check availability (OPTIONAL - affects sorting, not eligibility)
      const availability = await ctx.db
        .query("provider_availability")
        .withIndex("by_provider_date", (q) =>
          q.eq("providerId", provider._id).eq("date", args.date)
        )
        .first();

      let availabilityStatus: "available" | "preferred" | "unavailable" | "unknown" = "unknown";
      let isPreferred = false;

      if (availability) {
        if (availability.availabilityType === "unavailable") {
          availabilityStatus = "unavailable";
        } else {
          const isAvailableForShift =
            args.shiftType === "AM" ? availability.amAvailable : availability.pmAvailable;
          const isPreferredForShift =
            args.shiftType === "AM"
              ? availability.amPreferred ?? false
              : availability.pmPreferred ?? false;

          if (isPreferredForShift) {
            availabilityStatus = "preferred";
            isPreferred = true;
          } else if (isAvailableForShift) {
            availabilityStatus = "available";
          } else {
            availabilityStatus = "unavailable";
          }
        }
      }

      availableProviders.push({
        id: provider._id,
        name: `${provider.firstName} ${provider.lastName}`,
        initials: `${provider.firstName[0]}${provider.lastName[0]}`,
        jobType: providerJobType.code,
        jobTypeName: providerJobType.name,
        availabilityStatus,
        isPreferred,
        assignmentCount: existingAssignments.length,
      });
    }

    // Sort by: preferred first, then available, then unknown, then unavailable
    // Within each group, sort by assignment count (fewer first)
    const availabilityOrder = { preferred: 0, available: 1, unknown: 2, unavailable: 3 };
    availableProviders.sort((a, b) => {
      const orderA = availabilityOrder[a.availabilityStatus as keyof typeof availabilityOrder];
      const orderB = availabilityOrder[b.availabilityStatus as keyof typeof availabilityOrder];
      if (orderA !== orderB) return orderA - orderB;
      return a.assignmentCount - b.assignmentCount;
    });

    return availableProviders;
  },
});
