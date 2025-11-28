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
        headcount: v.number(), // positions per shift
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
      const shiftsToCreate: { shiftType: string; name: string; start: string; end: string }[] = [];

      // Use per-job-type shift times if provided, otherwise fall back to service defaults
      const dayStart = jtConfig.dayShiftStart ?? args.shiftConfig.dayShiftStart;
      const dayEnd = jtConfig.dayShiftEnd ?? args.shiftConfig.dayShiftEnd;
      const nightStart = jtConfig.nightShiftStart ?? args.shiftConfig.nightShiftStart;
      const nightEnd = jtConfig.nightShiftEnd ?? args.shiftConfig.nightShiftEnd;

      // Use per-job-type operating flags if provided, otherwise fall back to service defaults
      const operatesDays = jtConfig.operatesDays ?? args.operatesDays;
      const operatesNights = jtConfig.operatesNights ?? args.operatesNights;

      if (operatesDays) {
        shiftsToCreate.push({
          shiftType: "Weekday_AM",
          name: "Weekday Day Shift",
          start: dayStart,
          end: dayEnd,
        });
      }

      if (operatesNights) {
        shiftsToCreate.push({
          shiftType: "Weekday_PM",
          name: "Weekday Night Shift",
          start: nightStart,
          end: nightEnd,
        });
      }

      if (args.operatesWeekends && operatesDays) {
        shiftsToCreate.push({
          shiftType: "Weekend_AM",
          name: "Weekend Day Shift",
          start: dayStart,
          end: dayEnd,
        });
      }

      if (args.operatesWeekends && operatesNights) {
        shiftsToCreate.push({
          shiftType: "Weekend_PM",
          name: "Weekend Night Shift",
          start: nightStart,
          end: nightEnd,
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
          positionsNeeded: jtConfig.headcount,
          isActive: true,
        });

        shiftsCreated++;

        // Create job positions for each headcount
        for (let i = 1; i <= jtConfig.headcount; i++) {
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
 * Update a service
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
  },
  handler: async (ctx, args) => {
    const service = await ctx.db.get(args.serviceId);
    if (!service) throw new Error("Service not found");

    const user = await requireDepartmentAccess(ctx, service.departmentId);

    await ctx.db.patch(args.serviceId, {
      name: args.name,
      shortCode: args.shortCode.toUpperCase(),
      unitId: args.unitId,
      dayCapacity: args.dayCapacity,
      nightCapacity: args.nightCapacity,
      weekendCapacity: args.weekendCapacity,
    });

    await auditLog(ctx, user, "UPDATE", "SERVICE", args.serviceId, {
      name: args.name,
    });

    return { success: true };
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
