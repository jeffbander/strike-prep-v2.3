import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireAuth, requireDepartmentAccess, auditLog } from "./lib/auth";

// ═══════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Find matching providers for a scenario position
 * Priority: Availability first, then skills, then hospital access, then workload balance
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
    const jobType = await ctx.db.get(position.jobTypeId);

    if (!service || !serviceJobType || !jobType) {
      return { error: "Position data incomplete", matches: [] };
    }

    // Get required skills for this position
    const skillLinks = await ctx.db
      .query("service_job_type_skills")
      .withIndex("by_service_job_type", (q) =>
        q.eq("serviceJobTypeId", position.serviceJobTypeId)
      )
      .filter((q) => q.eq(q.field("isRequired"), true))
      .collect();

    const requiredSkillIds = skillLinks.map((sl) => sl.skillId);

    // Get all active providers that could potentially work this position
    // They need to match the job type OR be able to cover it
    const providers = await ctx.db
      .query("providers")
      .withIndex("by_job_type", (q) => q.eq("jobTypeId", position.jobTypeId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Also get providers from other job types who might cross-cover
    // (This could be extended based on your cross-coverage rules)

    const matches: any[] = [];

    for (const provider of providers) {
      // 1. Check availability (MUST be available for this date/shift)
      const availability = await ctx.db
        .query("provider_availability")
        .withIndex("by_provider_date", (q) =>
          q.eq("providerId", provider._id).eq("date", position.date)
        )
        .first();

      let isAvailable = true;
      let isPreferred = false;

      if (availability) {
        if (availability.availabilityType === "unavailable") {
          continue; // Skip unavailable providers
        }
        isAvailable =
          position.shiftType === "AM"
            ? availability.amAvailable
            : availability.pmAvailable;
        isPreferred =
          position.shiftType === "AM"
            ? availability.amPreferred ?? false
            : availability.pmPreferred ?? false;

        if (!isAvailable) continue;
      }
      // If no availability record, assume available (or could require explicit availability)

      // 2. Check hospital access
      const canWorkAtHospital = await checkHospitalAccess(
        ctx,
        provider._id,
        provider.hospitalId,
        position.hospitalId
      );
      if (!canWorkAtHospital) continue;

      // 2b. Check visa restriction for fellows
      // Fellows with visas can ONLY work at their home hospital
      if (provider.hasVisa && jobType?.code === "FEL") {
        if (provider.hospitalId !== position.hospitalId) {
          continue; // Skip: Fellow with visa cannot moonlight outside home hospital
        }
      }

      // 3. Check for shift conflicts (already assigned to same date/shift)
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

      // 4. Calculate skill match
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

      // 5. Calculate workload in this scenario
      const currentAssignmentCount = existingAssignments.length;

      // 6. Calculate score
      // Priority: Preferred shift > skill match > home department > fewer assignments
      let score = 0;
      score += matchedSkills.length * 10;
      score += isPreferred ? 50 : 0;
      if (provider.departmentId === position.departmentId) score += 20;
      if (provider.hospitalId === position.hospitalId) score += 10;
      score -= currentAssignmentCount * 5; // Prefer less-busy providers
      score -= missingSkills.length * 15;

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
        jobTypeName: jobType.name,
        jobTypeCode: jobType.code,
        matchQuality,
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
        jobTypeName: jobType.name,
        jobTypeCode: jobType.code,
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
