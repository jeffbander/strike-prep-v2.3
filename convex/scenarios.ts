import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireAuth, requireHealthSystemAccess, auditLog } from "./lib/auth";

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate reduced headcount for a strike scenario
 * Minimum 1 FTE rule: can't reduce below 1 person
 */
function calculateScenarioHeadcount(
  originalHeadcount: number,
  reductionPercent: number
): number {
  if (reductionPercent === 0) return originalHeadcount; // Non-striking job type
  const reduced = originalHeadcount * (1 - reductionPercent / 100);
  return Math.max(1, Math.ceil(reduced)); // Minimum 1 FTE
}

/**
 * Generate all dates between start and end (inclusive)
 */
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split("T")[0]);
  }

  return dates;
}

/**
 * Determine if a date is a weekend (Saturday=6, Sunday=0)
 */
function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr);
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Generate job code for scenario position (includes date)
 */
function generateScenarioJobCode(
  deptName: string,
  hospitalCode: string,
  serviceCode: string,
  jobTypeCode: string,
  date: string,
  shiftType: string,
  positionNumber: number
): string {
  const deptCode = deptName.replace(/[^a-zA-Z]/g, "").substring(0, 6);
  return `${deptCode}_${hospitalCode}_${serviceCode}_${jobTypeCode}_${date}_${shiftType}_${positionNumber}`;
}

// ═══════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════

/**
 * List scenarios for user's scope
 */
export const list = query({
  args: {
    healthSystemId: v.optional(v.id("health_systems")),
    hospitalId: v.optional(v.id("hospitals")),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) return [];

    let scenarios;

    // Filter by status if provided
    if (args.status) {
      scenarios = await ctx.db
        .query("strike_scenarios")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      // Get all scenarios for health system
      const healthSystemId = args.healthSystemId || currentUser.healthSystemId;
      if (!healthSystemId) return [];

      scenarios = await ctx.db
        .query("strike_scenarios")
        .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
        .collect();
    }

    // Filter by hospital if provided
    if (args.hospitalId) {
      scenarios = scenarios.filter(
        (s) => s.hospitalId === args.hospitalId || !s.hospitalId
      );
    }

    // Enrich with stats
    const enrichedScenarios = await Promise.all(
      scenarios.map(async (scenario) => {
        const positions = await ctx.db
          .query("scenario_positions")
          .withIndex("by_scenario", (q) => q.eq("scenarioId", scenario._id))
          .collect();

        const totalPositions = positions.filter((p) => p.isActive).length;
        const filledPositions = positions.filter(
          (p) => p.isActive && (p.status === "Assigned" || p.status === "Confirmed")
        ).length;

        // Calculate total days in scenario
        const startDate = new Date(scenario.startDate);
        const endDate = new Date(scenario.endDate);
        const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        // Get affected job type names
        const affectedJobTypeNames = await Promise.all(
          scenario.affectedJobTypes.map(async (ajt) => {
            const jobType = await ctx.db.get(ajt.jobTypeId);
            return jobType
              ? { name: jobType.name, code: jobType.code, reductionPercent: ajt.reductionPercent }
              : null;
          })
        );

        return {
          ...scenario,
          affectedJobTypeDetails: affectedJobTypeNames.filter(Boolean),
          stats: {
            totalPositions,
            filledPositions,
            openPositions: totalPositions - filledPositions,
            coveragePercent: totalPositions > 0
              ? Math.round((filledPositions / totalPositions) * 100)
              : 0,
            totalDays,
          },
        };
      })
    );

    return enrichedScenarios.sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );
  },
});

/**
 * Get a single scenario with full details
 */
export const get = query({
  args: { scenarioId: v.id("strike_scenarios") },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) return null;

    // Get all positions for stats
    const positions = await ctx.db
      .query("scenario_positions")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
      .collect();

    const activePositions = positions.filter((p) => p.isActive);
    const totalPositions = activePositions.length;
    const filledPositions = activePositions.filter(
      (p) => p.status === "Assigned" || p.status === "Confirmed"
    ).length;

    // Get affected job type details
    const affectedJobTypeDetails = await Promise.all(
      scenario.affectedJobTypes.map(async (ajt) => {
        const jobType = await ctx.db.get(ajt.jobTypeId);
        return jobType
          ? {
              jobTypeId: ajt.jobTypeId,
              name: jobType.name,
              code: jobType.code,
              reductionPercent: ajt.reductionPercent
            }
          : null;
      })
    );

    // Get hospital name if scoped
    const hospital = scenario.hospitalId
      ? await ctx.db.get(scenario.hospitalId)
      : null;

    // Get health system name
    const healthSystem = await ctx.db.get(scenario.healthSystemId);

    // Calculate coverage by date
    const dates = getDateRange(scenario.startDate, scenario.endDate);
    const coverageByDate = dates.map((date) => {
      const datePositions = activePositions.filter((p) => p.date === date);
      const total = datePositions.length;
      const filled = datePositions.filter(
        (p) => p.status === "Assigned" || p.status === "Confirmed"
      ).length;
      return {
        date,
        total,
        filled,
        open: total - filled,
        coveragePercent: total > 0 ? Math.round((filled / total) * 100) : 0,
      };
    });

    return {
      ...scenario,
      hospital,
      healthSystem,
      affectedJobTypeDetails: affectedJobTypeDetails.filter(Boolean),
      stats: {
        totalPositions,
        filledPositions,
        openPositions: totalPositions - filledPositions,
        coveragePercent: totalPositions > 0
          ? Math.round((filledPositions / totalPositions) * 100)
          : 0,
        totalDays: dates.length,
      },
      coverageByDate,
    };
  },
});

/**
 * Get calendar/grid view data for a scenario
 * Returns services as rows, dates as columns, with coverage per cell
 */
export const getCalendarView = query({
  args: { scenarioId: v.id("strike_scenarios") },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) return null;

    const positions = await ctx.db
      .query("scenario_positions")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Get unique services
    const serviceIds = [...new Set(positions.map((p) => p.serviceId))];
    const services = await Promise.all(
      serviceIds.map(async (sid) => {
        const service = await ctx.db.get(sid);
        const dept = service ? await ctx.db.get(service.departmentId) : null;
        return service ? { ...service, departmentName: dept?.name } : null;
      })
    );

    // Get date range
    const dates = getDateRange(scenario.startDate, scenario.endDate);

    // Build grid data
    const grid = services.filter(Boolean).map((service) => {
      const servicePositions = positions.filter((p) => p.serviceId === service!._id);

      const dateData = dates.map((date) => {
        const amPositions = servicePositions.filter(
          (p) => p.date === date && p.shiftType === "AM"
        );
        const pmPositions = servicePositions.filter(
          (p) => p.date === date && p.shiftType === "PM"
        );

        const amTotal = amPositions.length;
        const amFilled = amPositions.filter(
          (p) => p.status === "Assigned" || p.status === "Confirmed"
        ).length;

        const pmTotal = pmPositions.length;
        const pmFilled = pmPositions.filter(
          (p) => p.status === "Assigned" || p.status === "Confirmed"
        ).length;

        return {
          date,
          isWeekend: isWeekend(date),
          am: {
            total: amTotal,
            filled: amFilled,
            open: amTotal - amFilled,
            coveragePercent: amTotal > 0 ? Math.round((amFilled / amTotal) * 100) : 100,
          },
          pm: {
            total: pmTotal,
            filled: pmFilled,
            open: pmTotal - pmFilled,
            coveragePercent: pmTotal > 0 ? Math.round((pmFilled / pmTotal) * 100) : 100,
          },
        };
      });

      return {
        serviceId: service!._id,
        serviceName: service!.name,
        serviceCode: service!.shortCode,
        departmentName: service!.departmentName,
        dates: dateData,
      };
    });

    return {
      scenario,
      dates,
      grid,
    };
  },
});

/**
 * Get open positions for a scenario, optionally filtered
 */
export const getOpenPositions = query({
  args: {
    scenarioId: v.id("strike_scenarios"),
    date: v.optional(v.string()),
    serviceId: v.optional(v.id("services")),
    shiftType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let positions = await ctx.db
      .query("scenario_positions")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
      .filter((q) =>
        q.and(q.eq(q.field("isActive"), true), q.eq(q.field("status"), "Open"))
      )
      .collect();

    if (args.date) {
      positions = positions.filter((p) => p.date === args.date);
    }

    if (args.serviceId) {
      positions = positions.filter((p) => p.serviceId === args.serviceId);
    }

    if (args.shiftType) {
      positions = positions.filter((p) => p.shiftType === args.shiftType);
    }

    // Enrich with service and job type details
    const enrichedPositions = await Promise.all(
      positions.map(async (pos) => {
        const service = await ctx.db.get(pos.serviceId);
        const jobType = await ctx.db.get(pos.jobTypeId);
        const department = service ? await ctx.db.get(service.departmentId) : null;

        return {
          ...pos,
          serviceName: service?.name,
          serviceCode: service?.shortCode,
          departmentName: department?.name,
          jobTypeName: jobType?.name,
          jobTypeCode: jobType?.code,
        };
      })
    );

    return enrichedPositions.sort((a, b) => {
      // Sort by date, then service, then shift, then position number
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.serviceName !== b.serviceName) return (a.serviceName || "").localeCompare(b.serviceName || "");
      if (a.shiftType !== b.shiftType) return a.shiftType.localeCompare(b.shiftType);
      return a.positionNumber - b.positionNumber;
    });
  },
});

// ═══════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a new strike scenario and generate all positions
 */
export const create = mutation({
  args: {
    healthSystemId: v.id("health_systems"),
    hospitalId: v.optional(v.id("hospitals")),
    name: v.string(),
    description: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.string(),
    affectedJobTypes: v.array(
      v.object({
        jobTypeId: v.id("job_types"),
        reductionPercent: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireHealthSystemAccess(ctx, args.healthSystemId);

    // Validate date range
    if (new Date(args.startDate) > new Date(args.endDate)) {
      throw new Error("Start date must be before or equal to end date");
    }

    // Validate reduction percentages
    for (const ajt of args.affectedJobTypes) {
      if (ajt.reductionPercent < 0 || ajt.reductionPercent > 100) {
        throw new Error("Reduction percent must be between 0 and 100");
      }
    }

    // Create the scenario
    const scenarioId = await ctx.db.insert("strike_scenarios", {
      healthSystemId: args.healthSystemId,
      hospitalId: args.hospitalId,
      name: args.name,
      description: args.description,
      startDate: args.startDate,
      endDate: args.endDate,
      affectedJobTypes: args.affectedJobTypes,
      status: "Draft",
      createdBy: user._id,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Generate positions
    const positionStats = await generatePositionsForScenario(
      ctx,
      scenarioId,
      args.healthSystemId,
      args.hospitalId,
      args.startDate,
      args.endDate,
      args.affectedJobTypes
    );

    await auditLog(ctx, user, "CREATE", "STRIKE_SCENARIO", scenarioId, {
      name: args.name,
      startDate: args.startDate,
      endDate: args.endDate,
      ...positionStats,
    });

    return { scenarioId, ...positionStats };
  },
});

/**
 * Generate positions for a scenario
 * This is called on create and can be called to regenerate positions
 */
async function generatePositionsForScenario(
  ctx: any,
  scenarioId: Id<"strike_scenarios">,
  healthSystemId: Id<"health_systems">,
  hospitalId: Id<"hospitals"> | undefined,
  startDate: string,
  endDate: string,
  affectedJobTypes: { jobTypeId: Id<"job_types">; reductionPercent: number }[]
) {
  // Get all services in scope
  let services;
  if (hospitalId) {
    services = await ctx.db
      .query("services")
      .withIndex("by_hospital", (q: any) => q.eq("hospitalId", hospitalId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();
  } else {
    services = await ctx.db
      .query("services")
      .withIndex("by_health_system", (q: any) => q.eq("healthSystemId", healthSystemId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();
  }

  // Create a map of affected job types for quick lookup
  const affectedJobTypeMap = new Map(
    affectedJobTypes.map((ajt) => [ajt.jobTypeId.toString(), ajt.reductionPercent])
  );

  const dates = getDateRange(startDate, endDate);
  let totalPositions = 0;
  let affectedServices = 0;

  for (const service of services) {
    // Get service job types
    const serviceJobTypes = await ctx.db
      .query("service_job_types")
      .withIndex("by_service", (q: any) => q.eq("serviceId", service._id))
      .collect();

    // Check if any of the service's job types are affected
    const hasAffectedJobType = serviceJobTypes.some((sjt: any) =>
      affectedJobTypeMap.has(sjt.jobTypeId.toString())
    );

    if (!hasAffectedJobType && affectedJobTypes.length > 0) {
      // Service has no affected job types, skip (unless we want all services)
      // For now, we'll generate for affected job types only
      continue;
    }

    affectedServices++;

    // Get department and hospital info for job code
    const department = await ctx.db.get(service.departmentId);
    const hospital = await ctx.db.get(service.hospitalId);

    for (const sjt of serviceJobTypes) {
      const jobType = await ctx.db.get(sjt.jobTypeId);
      if (!jobType) continue;

      // Check if this job type is affected by the strike
      const reductionPercent = affectedJobTypeMap.get(sjt.jobTypeId.toString()) ?? 0;

      // Get the original headcounts
      const weekdayAmHeadcount = sjt.weekdayAmHeadcount ?? sjt.headcount ?? 1;
      const weekdayPmHeadcount = sjt.weekdayPmHeadcount ?? sjt.headcount ?? 1;
      const weekendAmHeadcount = sjt.weekendAmHeadcount ?? sjt.headcount ?? 1;
      const weekendPmHeadcount = sjt.weekendPmHeadcount ?? sjt.headcount ?? 1;

      // Determine shift times
      const dayStart = sjt.dayShiftStart ?? service.dayShiftStart;
      const dayEnd = sjt.dayShiftEnd ?? service.dayShiftEnd;
      const nightStart = sjt.nightShiftStart ?? service.nightShiftStart;
      const nightEnd = sjt.nightShiftEnd ?? service.nightShiftEnd;

      // Operating flags
      const operatesDays = sjt.operatesDays ?? service.operatesDays;
      const operatesNights = sjt.operatesNights ?? service.operatesNights;

      for (const date of dates) {
        const weekend = isWeekend(date);

        // AM shift
        if (operatesDays) {
          const originalHeadcount = weekend ? weekendAmHeadcount : weekdayAmHeadcount;

          // Skip if service doesn't operate weekends and this is a weekend
          if (weekend && !service.operatesWeekends) continue;

          const scenarioHeadcount = calculateScenarioHeadcount(
            originalHeadcount,
            reductionPercent
          );

          for (let i = 1; i <= scenarioHeadcount; i++) {
            const jobCode = generateScenarioJobCode(
              department?.name || "DEPT",
              hospital?.shortCode || "HOSP",
              service.shortCode,
              jobType.code,
              date,
              "AM",
              i
            );

            await ctx.db.insert("scenario_positions", {
              scenarioId,
              serviceId: service._id,
              serviceJobTypeId: sjt._id,
              jobTypeId: sjt.jobTypeId,
              hospitalId: service.hospitalId,
              departmentId: service.departmentId,
              date,
              shiftType: "AM",
              shiftStart: dayStart,
              shiftEnd: dayEnd,
              positionNumber: i,
              jobCode,
              originalHeadcount,
              scenarioHeadcount,
              status: "Open",
              isActive: true,
            });

            totalPositions++;
          }
        }

        // PM shift
        if (operatesNights) {
          const originalHeadcount = weekend ? weekendPmHeadcount : weekdayPmHeadcount;

          // Skip if service doesn't operate weekends and this is a weekend
          if (weekend && !service.operatesWeekends) continue;

          const scenarioHeadcount = calculateScenarioHeadcount(
            originalHeadcount,
            reductionPercent
          );

          for (let i = 1; i <= scenarioHeadcount; i++) {
            const jobCode = generateScenarioJobCode(
              department?.name || "DEPT",
              hospital?.shortCode || "HOSP",
              service.shortCode,
              jobType.code,
              date,
              "PM",
              i
            );

            await ctx.db.insert("scenario_positions", {
              scenarioId,
              serviceId: service._id,
              serviceJobTypeId: sjt._id,
              jobTypeId: sjt.jobTypeId,
              hospitalId: service.hospitalId,
              departmentId: service.departmentId,
              date,
              shiftType: "PM",
              shiftStart: nightStart,
              shiftEnd: nightEnd,
              positionNumber: i,
              jobCode,
              originalHeadcount,
              scenarioHeadcount,
              status: "Open",
              isActive: true,
            });

            totalPositions++;
          }
        }
      }
    }
  }

  return {
    totalPositions,
    affectedServices,
    totalDays: dates.length,
  };
}

/**
 * Update a scenario (only in Draft status)
 */
export const update = mutation({
  args: {
    scenarioId: v.id("strike_scenarios"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    affectedJobTypes: v.optional(
      v.array(
        v.object({
          jobTypeId: v.id("job_types"),
          reductionPercent: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) throw new Error("Scenario not found");

    if (scenario.status !== "Draft") {
      throw new Error("Can only update scenarios in Draft status");
    }

    const user = await requireHealthSystemAccess(ctx, scenario.healthSystemId);

    const needsRegeneration =
      args.startDate !== undefined ||
      args.endDate !== undefined ||
      args.affectedJobTypes !== undefined;

    // Update the scenario
    await ctx.db.patch(args.scenarioId, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.description !== undefined && { description: args.description }),
      ...(args.startDate !== undefined && { startDate: args.startDate }),
      ...(args.endDate !== undefined && { endDate: args.endDate }),
      ...(args.affectedJobTypes !== undefined && { affectedJobTypes: args.affectedJobTypes }),
      updatedAt: Date.now(),
    });

    let positionStats = null;

    // Regenerate positions if date range or job types changed
    if (needsRegeneration) {
      // Delete existing positions
      const existingPositions = await ctx.db
        .query("scenario_positions")
        .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
        .collect();

      for (const pos of existingPositions) {
        await ctx.db.delete(pos._id);
      }

      // Get updated scenario
      const updatedScenario = await ctx.db.get(args.scenarioId);
      if (updatedScenario) {
        positionStats = await generatePositionsForScenario(
          ctx,
          args.scenarioId,
          updatedScenario.healthSystemId,
          updatedScenario.hospitalId,
          updatedScenario.startDate,
          updatedScenario.endDate,
          updatedScenario.affectedJobTypes
        );
      }
    }

    await auditLog(ctx, user, "UPDATE", "STRIKE_SCENARIO", args.scenarioId, {
      name: args.name,
      regeneratedPositions: needsRegeneration,
      ...positionStats,
    });

    return { success: true, positionStats };
  },
});

/**
 * Activate a scenario (move from Draft to Active)
 */
export const activate = mutation({
  args: { scenarioId: v.id("strike_scenarios") },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) throw new Error("Scenario not found");

    if (scenario.status !== "Draft") {
      throw new Error("Can only activate scenarios in Draft status");
    }

    const user = await requireHealthSystemAccess(ctx, scenario.healthSystemId);

    await ctx.db.patch(args.scenarioId, {
      status: "Active",
      updatedAt: Date.now(),
    });

    await auditLog(ctx, user, "ACTIVATE", "STRIKE_SCENARIO", args.scenarioId, {
      name: scenario.name,
    });

    return { success: true };
  },
});

/**
 * Complete a scenario
 */
export const complete = mutation({
  args: { scenarioId: v.id("strike_scenarios") },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) throw new Error("Scenario not found");

    if (scenario.status !== "Active") {
      throw new Error("Can only complete scenarios in Active status");
    }

    const user = await requireHealthSystemAccess(ctx, scenario.healthSystemId);

    await ctx.db.patch(args.scenarioId, {
      status: "Completed",
      updatedAt: Date.now(),
    });

    await auditLog(ctx, user, "COMPLETE", "STRIKE_SCENARIO", args.scenarioId, {
      name: scenario.name,
    });

    return { success: true };
  },
});

/**
 * Cancel a scenario
 */
export const cancel = mutation({
  args: {
    scenarioId: v.id("strike_scenarios"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) throw new Error("Scenario not found");

    if (scenario.status === "Completed" || scenario.status === "Cancelled") {
      throw new Error("Cannot cancel a completed or already cancelled scenario");
    }

    const user = await requireHealthSystemAccess(ctx, scenario.healthSystemId);

    await ctx.db.patch(args.scenarioId, {
      status: "Cancelled",
      isActive: false,
      updatedAt: Date.now(),
    });

    await auditLog(ctx, user, "CANCEL", "STRIKE_SCENARIO", args.scenarioId, {
      name: scenario.name,
      reason: args.reason,
    });

    return { success: true };
  },
});

/**
 * Regenerate all positions for a scenario (useful after service changes)
 */
export const regeneratePositions = mutation({
  args: { scenarioId: v.id("strike_scenarios") },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) throw new Error("Scenario not found");

    if (scenario.status !== "Draft") {
      throw new Error("Can only regenerate positions for scenarios in Draft status");
    }

    const user = await requireHealthSystemAccess(ctx, scenario.healthSystemId);

    // Delete existing positions
    const existingPositions = await ctx.db
      .query("scenario_positions")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
      .collect();

    for (const pos of existingPositions) {
      await ctx.db.delete(pos._id);
    }

    // Regenerate
    const positionStats = await generatePositionsForScenario(
      ctx,
      args.scenarioId,
      scenario.healthSystemId,
      scenario.hospitalId,
      scenario.startDate,
      scenario.endDate,
      scenario.affectedJobTypes
    );

    await auditLog(ctx, user, "REGENERATE", "STRIKE_SCENARIO", args.scenarioId, {
      name: scenario.name,
      ...positionStats,
    });

    return positionStats;
  },
});

/**
 * Delete a scenario (only if in Draft status with no assignments)
 */
export const deleteScenario = mutation({
  args: { scenarioId: v.id("strike_scenarios") },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) throw new Error("Scenario not found");

    if (scenario.status !== "Draft") {
      throw new Error("Can only delete scenarios in Draft status");
    }

    const user = await requireHealthSystemAccess(ctx, scenario.healthSystemId);

    // Check for assignments
    const assignments = await ctx.db
      .query("scenario_assignments")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
      .first();

    if (assignments) {
      throw new Error("Cannot delete scenario with existing assignments");
    }

    // Delete all positions
    const positions = await ctx.db
      .query("scenario_positions")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
      .collect();

    for (const pos of positions) {
      await ctx.db.delete(pos._id);
    }

    // Delete scenario
    await ctx.db.delete(args.scenarioId);

    await auditLog(ctx, user, "DELETE", "STRIKE_SCENARIO", args.scenarioId, {
      name: scenario.name,
    });

    return { success: true };
  },
});
