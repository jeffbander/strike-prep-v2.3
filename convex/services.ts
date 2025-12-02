import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireDepartmentAccess, auditLog } from "./lib/auth";

/**
 * Create a service with job types, skills, and shifts
 */
export const create = mutation({
  args: {
    departmentId: v.id("departments"),
    name: v.string(),
    shortCode: v.string(),
    unitId: v.optional(v.id("units")),
    dayCapacity: v.optional(v.number()),
    nightCapacity: v.optional(v.number()),
    weekendCapacity: v.optional(v.number()),
    shiftConfig: v.object({
      dayShiftStart: v.string(),
      dayShiftEnd: v.string(),
      nightShiftStart: v.string(),
      nightShiftEnd: v.string(),
    }),
    operatesDays: v.boolean(),
    operatesNights: v.boolean(),
    operatesWeekends: v.boolean(),
    jobTypes: v.array(
      v.object({
        jobTypeId: v.id("job_types"),
        skillIds: v.array(v.id("skills")),
        headcount: v.number(), // default positions per shift
        // Per-shift-type headcount (optional - falls back to headcount)
        weekdayAmHeadcount: v.optional(v.number()),
        weekdayPmHeadcount: v.optional(v.number()),
        weekendAmHeadcount: v.optional(v.number()),
        weekendPmHeadcount: v.optional(v.number()),
        // Per-job-type shift configuration (optional - falls back to service defaults)
        operatesDays: v.optional(v.boolean()),
        operatesNights: v.optional(v.boolean()),
        dayShiftStart: v.optional(v.string()),
        dayShiftEnd: v.optional(v.string()),
        nightShiftStart: v.optional(v.string()),
        nightShiftEnd: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireDepartmentAccess(ctx, args.departmentId);

    const department = await ctx.db.get(args.departmentId);
    if (!department) throw new Error("Department not found");

    const hospital = await ctx.db.get(department.hospitalId);
    if (!hospital) throw new Error("Hospital not found");

    // Create service
    const serviceId = await ctx.db.insert("services", {
      departmentId: args.departmentId,
      hospitalId: department.hospitalId,
      healthSystemId: department.healthSystemId,
      name: args.name,
      shortCode: args.shortCode.toUpperCase(),
      unitId: args.unitId,
      dayCapacity: args.dayCapacity,
      nightCapacity: args.nightCapacity,
      weekendCapacity: args.weekendCapacity,
      dayShiftStart: args.shiftConfig.dayShiftStart,
      dayShiftEnd: args.shiftConfig.dayShiftEnd,
      nightShiftStart: args.shiftConfig.nightShiftStart,
      nightShiftEnd: args.shiftConfig.nightShiftEnd,
      operatesDays: args.operatesDays,
      operatesNights: args.operatesNights,
      operatesWeekends: args.operatesWeekends,
      createdBy: user._id,
      isActive: true,
      createdAt: Date.now(),
    });

    let totalPositions = 0;
    let shiftsCreated = 0;

    // Create job types, skills, shifts, and positions
    for (const jtConfig of args.jobTypes) {
      const jobType = await ctx.db.get(jtConfig.jobTypeId);
      if (!jobType) continue;

      // Create service_job_type with per-job-type shift config
      const serviceJobTypeId = await ctx.db.insert("service_job_types", {
        serviceId,
        jobTypeId: jtConfig.jobTypeId,
        // Store per-job-type shift configuration
        dayShiftStart: jtConfig.dayShiftStart,
        dayShiftEnd: jtConfig.dayShiftEnd,
        nightShiftStart: jtConfig.nightShiftStart,
        nightShiftEnd: jtConfig.nightShiftEnd,
        operatesDays: jtConfig.operatesDays,
        operatesNights: jtConfig.operatesNights,
        headcount: jtConfig.headcount,
        // Per-shift-type headcount
        weekdayAmHeadcount: jtConfig.weekdayAmHeadcount,
        weekdayPmHeadcount: jtConfig.weekdayPmHeadcount,
        weekendAmHeadcount: jtConfig.weekendAmHeadcount,
        weekendPmHeadcount: jtConfig.weekendPmHeadcount,
      });

      // Create skills for this job type
      for (const skillId of jtConfig.skillIds) {
        await ctx.db.insert("service_job_type_skills", {
          serviceJobTypeId,
          skillId,
          isRequired: true,
        });
      }

      // Determine which shifts to create based on operating hours
      // Per-job-type config overrides service-level settings
      // Shift types per PRD: Weekday_AM, Weekday_PM, Weekend_AM, Weekend_PM
      const shiftsToCreate: { shiftType: string; name: string; start: string; end: string; headcount: number }[] = [];

      // Use per-job-type shift times if provided, otherwise fall back to service defaults
      const dayStart = jtConfig.dayShiftStart ?? args.shiftConfig.dayShiftStart;
      const dayEnd = jtConfig.dayShiftEnd ?? args.shiftConfig.dayShiftEnd;
      const nightStart = jtConfig.nightShiftStart ?? args.shiftConfig.nightShiftStart;
      const nightEnd = jtConfig.nightShiftEnd ?? args.shiftConfig.nightShiftEnd;

      // Use per-job-type operating flags if provided, otherwise fall back to service defaults
      const operatesDays = jtConfig.operatesDays ?? args.operatesDays;
      const operatesNights = jtConfig.operatesNights ?? args.operatesNights;

      // Helper to get headcount for a shift type (falls back to default headcount)
      const getHeadcount = (shiftType: string): number => {
        switch (shiftType) {
          case "Weekday_AM": return jtConfig.weekdayAmHeadcount ?? jtConfig.headcount;
          case "Weekday_PM": return jtConfig.weekdayPmHeadcount ?? jtConfig.headcount;
          case "Weekend_AM": return jtConfig.weekendAmHeadcount ?? jtConfig.headcount;
          case "Weekend_PM": return jtConfig.weekendPmHeadcount ?? jtConfig.headcount;
          default: return jtConfig.headcount;
        }
      };

      if (operatesDays) {
        shiftsToCreate.push({
          shiftType: "Weekday_AM",
          name: "Weekday Day Shift",
          start: dayStart,
          end: dayEnd,
          headcount: getHeadcount("Weekday_AM"),
        });
      }

      if (operatesNights) {
        shiftsToCreate.push({
          shiftType: "Weekday_PM",
          name: "Weekday Night Shift",
          start: nightStart,
          end: nightEnd,
          headcount: getHeadcount("Weekday_PM"),
        });
      }

      if (args.operatesWeekends && operatesDays) {
        shiftsToCreate.push({
          shiftType: "Weekend_AM",
          name: "Weekend Day Shift",
          start: dayStart,
          end: dayEnd,
          headcount: getHeadcount("Weekend_AM"),
        });
      }

      if (args.operatesWeekends && operatesNights) {
        shiftsToCreate.push({
          shiftType: "Weekend_PM",
          name: "Weekend Night Shift",
          start: nightStart,
          end: nightEnd,
          headcount: getHeadcount("Weekend_PM"),
        });
      }

      // Create shifts and positions
      for (const shiftInfo of shiftsToCreate) {
        const shiftId = await ctx.db.insert("shifts", {
          serviceId,
          serviceJobTypeId,
          name: shiftInfo.name,
          shiftType: shiftInfo.shiftType,
          startTime: shiftInfo.start,
          endTime: shiftInfo.end,
          positionsNeeded: shiftInfo.headcount,
          isActive: true,
        });

        shiftsCreated++;

        // Create job positions for each headcount
        for (let i = 1; i <= shiftInfo.headcount; i++) {
          const jobCode = generateJobCode(
            department.name,
            hospital.shortCode,
            args.shortCode,
            jobType.code,
            shiftInfo.shiftType,
            i
          );

          await ctx.db.insert("job_positions", {
            shiftId,
            serviceJobTypeId,
            serviceId,
            hospitalId: department.hospitalId,
            departmentId: args.departmentId,
            jobCode,
            positionNumber: i,
            status: "Open",
            isActive: true,
          });

          totalPositions++;
        }
      }
    }

    await auditLog(ctx, user, "CREATE", "SERVICE", serviceId, {
      name: args.name,
      shortCode: args.shortCode,
      shiftsCreated,
      positionsCreated: totalPositions,
    });

    return { serviceId, shiftsCreated, positionsCreated: totalPositions };
  },
});

function generateJobCode(
  dept: string,
  hospital: string,
  serviceCode: string,
  jobType: string,
  shiftType: string,
  num: number
): string {
  // Format: [Dept][Hospital][Service][JobType][Shift]_[Number]
  // shiftType is one of: Weekday_AM, Weekday_PM, Weekend_AM, Weekend_PM
  const deptCode = dept.replace(/[^a-zA-Z]/g, "").substring(0, 8);

  // Convert shift type to short code: WD_AM, WD_PM, WE_AM, WE_PM
  const shiftCodeMap: Record<string, string> = {
    "Weekday_AM": "WD_AM",
    "Weekday_PM": "WD_PM",
    "Weekend_AM": "WE_AM",
    "Weekend_PM": "WE_PM",
    // Fallback for legacy shift types
    "day": "AM",
    "night": "PM",
  };
  const shiftCode = shiftCodeMap[shiftType] || shiftType;

  return `${deptCode}${hospital}${serviceCode}${jobType}${shiftCode}_${num}`;
}

/**
 * List services based on user scope
 */
export const list = query({
  args: {
    departmentId: v.optional(v.id("departments")),
    hospitalId: v.optional(v.id("hospitals")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) return [];

    if (args.departmentId) {
      const departmentId = args.departmentId;
      return await ctx.db
        .query("services")
        .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
        .collect();
    }

    if (args.hospitalId) {
      const hospitalId = args.hospitalId;
      return await ctx.db
        .query("services")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
        .collect();
    }

    // Dept admin sees services in their department
    if (currentUser.role === "departmental_admin" && currentUser.departmentId) {
      const departmentId = currentUser.departmentId;
      return await ctx.db
        .query("services")
        .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
        .collect();
    }

    // Hospital admin sees all services in their hospital
    if (currentUser.role === "hospital_admin" && currentUser.hospitalId) {
      const hospitalId = currentUser.hospitalId;
      return await ctx.db
        .query("services")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
        .collect();
    }

    return [];
  },
});

/**
 * Get service with full details
 */
export const getWithDetails = query({
  args: { serviceId: v.id("services") },
  handler: async (ctx, args) => {
    const service = await ctx.db.get(args.serviceId);
    if (!service) return null;

    const serviceJobTypes = await ctx.db
      .query("service_job_types")
      .withIndex("by_service", (q) => q.eq("serviceId", args.serviceId))
      .collect();

    // Enrich with job type info, skills, and per-job-type shift config
    const enrichedJobTypes = await Promise.all(
      serviceJobTypes.map(async (sjt) => {
        const jobType = await ctx.db.get(sjt.jobTypeId);
        const skillLinks = await ctx.db
          .query("service_job_type_skills")
          .withIndex("by_service_job_type", (q) => q.eq("serviceJobTypeId", sjt._id))
          .collect();

        const skills = await Promise.all(
          skillLinks.map(async (sl) => {
            const skill = await ctx.db.get(sl.skillId);
            return skill ? { ...skill, isRequired: sl.isRequired } : null;
          })
        );

        // Get shifts specific to this job type
        const jobTypeShifts = await ctx.db
          .query("shifts")
          .withIndex("by_service_job_type", (q) => q.eq("serviceJobTypeId", sjt._id))
          .collect();

        return {
          ...sjt,
          jobType,
          skills: skills.filter(Boolean),
          shifts: jobTypeShifts,
          // Include resolved shift times (per-job-type or fallback to service)
          shiftConfig: {
            dayShiftStart: sjt.dayShiftStart ?? service.dayShiftStart,
            dayShiftEnd: sjt.dayShiftEnd ?? service.dayShiftEnd,
            nightShiftStart: sjt.nightShiftStart ?? service.nightShiftStart,
            nightShiftEnd: sjt.nightShiftEnd ?? service.nightShiftEnd,
            operatesDays: sjt.operatesDays ?? service.operatesDays,
            operatesNights: sjt.operatesNights ?? service.operatesNights,
            headcount: sjt.headcount,
            // Flag to indicate if this job type has custom shift config
            hasCustomShiftConfig: !!(sjt.dayShiftStart || sjt.operatesDays !== undefined),
          },
        };
      })
    );

    const shifts = await ctx.db
      .query("shifts")
      .withIndex("by_service", (q) => q.eq("serviceId", args.serviceId))
      .collect();

    const jobPositions = await ctx.db
      .query("job_positions")
      .withIndex("by_service", (q) => q.eq("serviceId", args.serviceId))
      .collect();

    // Get unit if exists
    const unit = service.unitId ? await ctx.db.get(service.unitId) : null;

    return {
      ...service,
      unit,
      serviceJobTypes: enrichedJobTypes,
      shifts,
      jobPositions,
      stats: {
        totalPositions: jobPositions.length,
        openPositions: jobPositions.filter((p) => p.status === "Open").length,
        assignedPositions: jobPositions.filter((p) => p.status === "Assigned").length,
        confirmedPositions: jobPositions.filter((p) => p.status === "Confirmed").length,
      },
    };
  },
});

/**
 * Update a service (basic info)
 * When operating modes change (day/night/weekend), soft-delete/reactivate affected shifts
 */
export const update = mutation({
  args: {
    serviceId: v.id("services"),
    name: v.string(),
    shortCode: v.string(),
    unitId: v.optional(v.id("units")),
    dayCapacity: v.optional(v.number()),
    nightCapacity: v.optional(v.number()),
    weekendCapacity: v.optional(v.number()),
    // Shift times
    dayShiftStart: v.optional(v.string()),
    dayShiftEnd: v.optional(v.string()),
    nightShiftStart: v.optional(v.string()),
    nightShiftEnd: v.optional(v.string()),
    // Operating flags
    operatesDays: v.optional(v.boolean()),
    operatesNights: v.optional(v.boolean()),
    operatesWeekends: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const service = await ctx.db.get(args.serviceId);
    if (!service) throw new Error("Service not found");

    const user = await requireDepartmentAccess(ctx, service.departmentId);

    // Check for operating mode changes to soft-delete/reactivate shifts
    const newOperatesDays = args.operatesDays ?? service.operatesDays;
    const newOperatesNights = args.operatesNights ?? service.operatesNights;
    const newOperatesWeekends = args.operatesWeekends ?? service.operatesWeekends;

    // Get all shifts for this service
    const shifts = await ctx.db
      .query("shifts")
      .withIndex("by_service", (q) => q.eq("serviceId", args.serviceId))
      .collect();

    let shiftsDeactivated = 0;
    let shiftsReactivated = 0;

    for (const shift of shifts) {
      // Determine if this shift should be active based on new operating modes
      const shiftType = shift.shiftType;
      let shouldBeActive = false;

      if (shiftType === "Weekday_AM") {
        shouldBeActive = newOperatesDays;
      } else if (shiftType === "Weekday_PM") {
        shouldBeActive = newOperatesNights;
      } else if (shiftType === "Weekend_AM") {
        shouldBeActive = newOperatesWeekends && newOperatesDays;
      } else if (shiftType === "Weekend_PM") {
        shouldBeActive = newOperatesWeekends && newOperatesNights;
      }

      // If shift's active status needs to change, update it and its positions
      if (shift.isActive !== shouldBeActive) {
        await ctx.db.patch(shift._id, { isActive: shouldBeActive });

        // Update positions for this shift
        const positions = await ctx.db
          .query("job_positions")
          .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
          .collect();

        for (const pos of positions) {
          if (shouldBeActive) {
            // Reactivating - restore cancelled positions to Open
            if (pos.status === "Cancelled") {
              await ctx.db.patch(pos._id, { status: "Open", isActive: true });
            } else {
              await ctx.db.patch(pos._id, { isActive: true });
            }
          } else {
            // Deactivating - mark positions inactive but keep status for history
            await ctx.db.patch(pos._id, { isActive: false });
          }
        }

        if (shouldBeActive) {
          shiftsReactivated++;
        } else {
          shiftsDeactivated++;
        }
      }
    }

    await ctx.db.patch(args.serviceId, {
      name: args.name,
      shortCode: args.shortCode.toUpperCase(),
      unitId: args.unitId,
      dayCapacity: args.dayCapacity,
      nightCapacity: args.nightCapacity,
      weekendCapacity: args.weekendCapacity,
      ...(args.dayShiftStart !== undefined && { dayShiftStart: args.dayShiftStart }),
      ...(args.dayShiftEnd !== undefined && { dayShiftEnd: args.dayShiftEnd }),
      ...(args.nightShiftStart !== undefined && { nightShiftStart: args.nightShiftStart }),
      ...(args.nightShiftEnd !== undefined && { nightShiftEnd: args.nightShiftEnd }),
      ...(args.operatesDays !== undefined && { operatesDays: args.operatesDays }),
      ...(args.operatesNights !== undefined && { operatesNights: args.operatesNights }),
      ...(args.operatesWeekends !== undefined && { operatesWeekends: args.operatesWeekends }),
    });

    await auditLog(ctx, user, "UPDATE", "SERVICE", args.serviceId, {
      name: args.name,
      shiftsDeactivated,
      shiftsReactivated,
    });

    return { success: true, shiftsDeactivated, shiftsReactivated };
  },
});

/**
 * Update shift headcount and optionally regenerate positions
 */
export const updateShift = mutation({
  args: {
    shiftId: v.id("shifts"),
    positionsNeeded: v.number(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    regeneratePositions: v.boolean(), // If true, adjusts job positions to match new headcount
  },
  handler: async (ctx, args) => {
    const shift = await ctx.db.get(args.shiftId);
    if (!shift) throw new Error("Shift not found");

    const service = await ctx.db.get(shift.serviceId);
    if (!service) throw new Error("Service not found");

    const user = await requireDepartmentAccess(ctx, service.departmentId);

    const oldPositionsNeeded = shift.positionsNeeded;

    // Update shift
    await ctx.db.patch(args.shiftId, {
      positionsNeeded: args.positionsNeeded,
      ...(args.startTime && { startTime: args.startTime }),
      ...(args.endTime && { endTime: args.endTime }),
    });

    let positionsAdded = 0;
    let positionsRemoved = 0;

    if (args.regeneratePositions) {
      const department = await ctx.db.get(service.departmentId);
      const hospital = await ctx.db.get(service.hospitalId);
      const serviceJobType = await ctx.db.get(shift.serviceJobTypeId);
      const jobType = serviceJobType ? await ctx.db.get(serviceJobType.jobTypeId) : null;

      // Get current positions for this shift
      const existingPositions = await ctx.db
        .query("job_positions")
        .withIndex("by_shift", (q) => q.eq("shiftId", args.shiftId))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

      const currentCount = existingPositions.length;

      if (args.positionsNeeded > currentCount) {
        // Need to add positions
        for (let i = currentCount + 1; i <= args.positionsNeeded; i++) {
          const jobCode = generateJobCode(
            department?.name || "DEPT",
            hospital?.shortCode || "HOSP",
            service.shortCode,
            jobType?.code || "JT",
            shift.shiftType,
            i
          );

          await ctx.db.insert("job_positions", {
            shiftId: args.shiftId,
            serviceJobTypeId: shift.serviceJobTypeId,
            serviceId: shift.serviceId,
            hospitalId: service.hospitalId,
            departmentId: service.departmentId,
            jobCode,
            positionNumber: i,
            status: "Open",
            isActive: true,
          });
          positionsAdded++;
        }
      } else if (args.positionsNeeded < currentCount) {
        // Need to remove positions (cancel unassigned first, then remove from end)
        const sortedPositions = existingPositions.sort((a, b) => b.positionNumber - a.positionNumber);
        const toRemove = currentCount - args.positionsNeeded;

        for (let i = 0; i < toRemove && i < sortedPositions.length; i++) {
          const pos = sortedPositions[i];
          if (pos.status === "Open") {
            await ctx.db.patch(pos._id, { status: "Cancelled", isActive: false });
            positionsRemoved++;
          }
        }
      }
    }

    // Update service_job_type per-shift headcount
    const serviceJobType = await ctx.db.get(shift.serviceJobTypeId);
    if (serviceJobType) {
      const headcountField = {
        "Weekday_AM": "weekdayAmHeadcount",
        "Weekday_PM": "weekdayPmHeadcount",
        "Weekend_AM": "weekendAmHeadcount",
        "Weekend_PM": "weekendPmHeadcount",
      }[shift.shiftType];

      if (headcountField) {
        await ctx.db.patch(shift.serviceJobTypeId, {
          [headcountField]: args.positionsNeeded,
        });
      }
    }

    await auditLog(ctx, user, "UPDATE", "SHIFT", args.shiftId, {
      shiftType: shift.shiftType,
      oldPositionsNeeded,
      newPositionsNeeded: args.positionsNeeded,
      positionsAdded,
      positionsRemoved,
    });

    return {
      success: true,
      positionsAdded,
      positionsRemoved,
      totalPositions: args.positionsNeeded,
    };
  },
});

/**
 * Toggle a shift's active status (soft delete/reactivate)
 * When deactivating, positions are marked inactive and won't count in matching
 * When reactivating, positions are restored
 */
export const toggleShiftActive = mutation({
  args: {
    shiftId: v.id("shifts"),
  },
  handler: async (ctx, args) => {
    const shift = await ctx.db.get(args.shiftId);
    if (!shift) throw new Error("Shift not found");

    const service = await ctx.db.get(shift.serviceId);
    if (!service) throw new Error("Service not found");

    const user = await requireDepartmentAccess(ctx, service.departmentId);

    const newStatus = !shift.isActive;

    // Update shift status
    await ctx.db.patch(args.shiftId, { isActive: newStatus });

    // Update all positions for this shift
    const positions = await ctx.db
      .query("job_positions")
      .withIndex("by_shift", (q) => q.eq("shiftId", args.shiftId))
      .collect();

    for (const pos of positions) {
      if (newStatus) {
        // Reactivating - restore Open positions
        if (pos.status === "Cancelled") {
          await ctx.db.patch(pos._id, { status: "Open", isActive: true });
        }
      } else {
        // Deactivating - mark positions inactive (but keep their status for tracking)
        await ctx.db.patch(pos._id, { isActive: false });
      }
    }

    await auditLog(
      ctx,
      user,
      newStatus ? "ACTIVATE" : "DEACTIVATE",
      "SHIFT",
      args.shiftId,
      {
        shiftType: shift.shiftType,
        positionsAffected: positions.length,
      }
    );

    return {
      isActive: newStatus,
      positionsAffected: positions.length,
    };
  },
});

/**
 * Toggle service active status
 */
export const toggleActive = mutation({
  args: { serviceId: v.id("services") },
  handler: async (ctx, args) => {
    const service = await ctx.db.get(args.serviceId);
    if (!service) throw new Error("Service not found");

    const user = await requireDepartmentAccess(ctx, service.departmentId);

    const newStatus = !service.isActive;

    // If deactivating, cancel all open positions
    if (!newStatus) {
      const positions = await ctx.db
        .query("job_positions")
        .withIndex("by_service", (q) => q.eq("serviceId", args.serviceId))
        .filter((q) => q.eq(q.field("status"), "Open"))
        .collect();

      for (const pos of positions) {
        await ctx.db.patch(pos._id, { status: "Cancelled", isActive: false });
      }
    }

    await ctx.db.patch(args.serviceId, { isActive: newStatus });

    await auditLog(
      ctx,
      user,
      newStatus ? "ACTIVATE" : "DEACTIVATE",
      "SERVICE",
      args.serviceId,
      { name: service.name }
    );

    return { isActive: newStatus };
  },
});
