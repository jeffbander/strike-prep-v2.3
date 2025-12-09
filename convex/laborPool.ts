import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireDepartmentAccess, auditLog } from "./lib/auth";
import { Id, Doc } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";

/**
 * Get all labor pool data for a department (for Excel export)
 */
export const getLaborPoolExportData = query({
  args: {
    departmentId: v.id("departments"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) return null;

    // Get department and hospital info
    const department = await ctx.db.get(args.departmentId);
    if (!department) return null;

    const hospital = await ctx.db.get(department.hospitalId);
    if (!hospital) return null;

    // Get all services in this department
    const services = await ctx.db
      .query("services")
      .withIndex("by_department", (q) => q.eq("departmentId", args.departmentId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Build rows: one per service-job-type combination
    const rows: Array<{
      serviceName: string;
      serviceShortCode: string;
      roleName: string;
      roleCode: string;
      headcounts: Record<string, number>;
      capacities: { day: number | null; night: number | null; weekend: number | null };
      skills: string[];
    }> = [];

    for (const service of services) {
      // Get all service_job_types for this service
      const serviceJobTypes = await ctx.db
        .query("service_job_types")
        .withIndex("by_service", (q) => q.eq("serviceId", service._id))
        .collect();

      for (const sjt of serviceJobTypes) {
        const jobType = await ctx.db.get(sjt.jobTypeId);
        if (!jobType) continue;

        // Get skills for this service_job_type
        const skillLinks = await ctx.db
          .query("service_job_type_skills")
          .withIndex("by_service_job_type", (q) => q.eq("serviceJobTypeId", sjt._id))
          .collect();

        const skills: string[] = [];
        for (const link of skillLinks) {
          const skill = await ctx.db.get(link.skillId);
          if (skill) skills.push(skill.name);
        }

        // Get headcounts from shifts
        const shifts = await ctx.db
          .query("shifts")
          .withIndex("by_service_job_type", (q) => q.eq("serviceJobTypeId", sjt._id))
          .collect();

        const headcounts: Record<string, number> = {};
        for (const shift of shifts) {
          headcounts[shift.shiftType] = shift.positionsNeeded;
        }

        rows.push({
          serviceName: service.name,
          serviceShortCode: service.shortCode,
          roleName: jobType.name,
          roleCode: jobType.code,
          headcounts,
          capacities: {
            day: service.dayCapacity ?? null,
            night: service.nightCapacity ?? null,
            weekend: service.weekendCapacity ?? null,
          },
          skills,
        });
      }
    }

    // Get available job types for this health system (for reference sheet)
    const availableRoles = await ctx.db
      .query("job_types")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", department.healthSystemId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Get all available skills (for reference sheet)
    const availableSkills = await ctx.db
      .query("skills")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Collect all shift types used in this department
    const shiftTypesSet = new Set<string>();
    rows.forEach((row) => {
      Object.keys(row.headcounts).forEach((st) => shiftTypesSet.add(st));
    });
    // Default shift types if none found
    const shiftTypes = shiftTypesSet.size > 0
      ? Array.from(shiftTypesSet).sort()
      : ["Weekday_AM", "Weekday_PM", "Weekend_AM", "Weekend_PM"];

    return {
      department: {
        name: department.name,
        hospitalName: hospital.name,
        hospitalCode: hospital.shortCode,
      },
      shiftTypes,
      rows,
      availableRoles: availableRoles.map((r) => ({ name: r.name, code: r.code })),
      availableSkills: availableSkills.map((s) => ({ name: s.name, category: s.category })),
    };
  },
});

/**
 * Bulk import labor pool data from Excel
 * UPSERT behavior: creates new services/job-types, updates existing
 */
export const bulkImportLaborPool = mutation({
  args: {
    departmentId: v.id("departments"),
    rows: v.array(
      v.object({
        serviceName: v.string(),
        serviceShortCode: v.string(),
        roleCode: v.string(),
        headcounts: v.object({
          Weekday_AM: v.optional(v.number()),
          Weekday_PM: v.optional(v.number()),
          Weekend_AM: v.optional(v.number()),
          Weekend_PM: v.optional(v.number()),
        }),
        capacities: v.object({
          day: v.optional(v.number()),
          night: v.optional(v.number()),
          weekend: v.optional(v.number()),
        }),
        skills: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireDepartmentAccess(ctx, args.departmentId);

    const department = await ctx.db.get(args.departmentId);
    if (!department) throw new Error("Department not found");

    const hospital = await ctx.db.get(department.hospitalId);
    if (!hospital) throw new Error("Hospital not found");

    // Build lookup maps
    const jobTypes = await ctx.db
      .query("job_types")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", department.healthSystemId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    const jobTypeByCode = new Map(jobTypes.map((jt) => [jt.code.toUpperCase(), jt]));

    const skills = await ctx.db
      .query("skills")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    const skillByName = new Map(skills.map((s) => [s.name.toUpperCase(), s]));

    // Get existing services in department
    const existingServices = await ctx.db
      .query("services")
      .withIndex("by_department", (q) => q.eq("departmentId", args.departmentId))
      .collect();
    const serviceByName = new Map<string, Doc<"services">>(
      existingServices.map((s) => [s.name.toUpperCase(), s])
    );

    // Group rows by service name
    const rowsByService = new Map<string, typeof args.rows>();
    for (const row of args.rows) {
      const key = row.serviceName.toUpperCase();
      if (!rowsByService.has(key)) {
        rowsByService.set(key, []);
      }
      rowsByService.get(key)!.push(row);
    }

    const results = {
      servicesCreated: 0,
      servicesUpdated: 0,
      jobTypesAdded: 0,
      jobTypesUpdated: 0,
      errors: [] as string[],
    };

    // Process each service group
    for (const [serviceKey, serviceRows] of rowsByService) {
      const firstRow = serviceRows[0];
      let service = serviceByName.get(serviceKey);

      // Determine capacities from first row (all rows for same service should have same capacities)
      const dayCapacity = firstRow.capacities.day;
      const nightCapacity = firstRow.capacities.night;
      const weekendCapacity = firstRow.capacities.weekend;

      // Determine operating modes from headcounts
      const hasWeekdayAM = serviceRows.some((r) => (r.headcounts.Weekday_AM ?? 0) > 0);
      const hasWeekdayPM = serviceRows.some((r) => (r.headcounts.Weekday_PM ?? 0) > 0);
      const hasWeekendAM = serviceRows.some((r) => (r.headcounts.Weekend_AM ?? 0) > 0);
      const hasWeekendPM = serviceRows.some((r) => (r.headcounts.Weekend_PM ?? 0) > 0);

      if (!service) {
        // Create new service
        let shortCode = firstRow.serviceShortCode.toUpperCase();

        // Check for short code uniqueness, add suffix if needed
        const existingWithCode = existingServices.find(
          (s) => s.shortCode.toUpperCase() === shortCode
        );
        if (existingWithCode) {
          shortCode = `${shortCode}${Date.now() % 1000}`;
        }

        const serviceId = await ctx.db.insert("services", {
          departmentId: args.departmentId,
          hospitalId: department.hospitalId,
          healthSystemId: department.healthSystemId,
          name: firstRow.serviceName,
          shortCode,
          dayCapacity,
          nightCapacity,
          weekendCapacity,
          dayShiftStart: "07:00",
          dayShiftEnd: "19:00",
          nightShiftStart: "19:00",
          nightShiftEnd: "07:00",
          operatesDays: hasWeekdayAM,
          operatesNights: hasWeekdayPM,
          operatesWeekends: hasWeekendAM || hasWeekendPM,
          createdBy: user._id,
          isActive: true,
          createdAt: Date.now(),
        });

        const newService = await ctx.db.get(serviceId);
        if (newService) {
          service = newService;
          serviceByName.set(serviceKey, newService);
        }
        results.servicesCreated++;
      } else {
        // Update existing service capacities and operating modes
        await ctx.db.patch(service._id, {
          dayCapacity,
          nightCapacity,
          weekendCapacity,
          operatesDays: hasWeekdayAM,
          operatesNights: hasWeekdayPM,
          operatesWeekends: hasWeekendAM || hasWeekendPM,
        });
        results.servicesUpdated++;
      }

      if (!service) continue;

      // Process each job type row for this service
      for (const row of serviceRows) {
        const jobType = jobTypeByCode.get(row.roleCode.toUpperCase());

        if (!jobType) {
          results.errors.push(
            `Service "${row.serviceName}", Role "${row.roleCode}": Unknown job type code`
          );
          continue;
        }

        // Find or create service_job_type
        let serviceJobType = await ctx.db
          .query("service_job_types")
          .withIndex("by_service", (q) => q.eq("serviceId", service!._id))
          .filter((q) => q.eq(q.field("jobTypeId"), jobType._id))
          .first();

        if (!serviceJobType) {
          // Create new service_job_type
          const sjtId = await ctx.db.insert("service_job_types", {
            serviceId: service._id,
            jobTypeId: jobType._id,
            headcount: row.headcounts.Weekday_AM ?? row.headcounts.Weekday_PM ?? 1,
            weekdayAmHeadcount: row.headcounts.Weekday_AM,
            weekdayPmHeadcount: row.headcounts.Weekday_PM,
            weekendAmHeadcount: row.headcounts.Weekend_AM,
            weekendPmHeadcount: row.headcounts.Weekend_PM,
          });
          serviceJobType = await ctx.db.get(sjtId);
          results.jobTypesAdded++;
        } else {
          // Update existing service_job_type headcounts
          await ctx.db.patch(serviceJobType._id, {
            weekdayAmHeadcount: row.headcounts.Weekday_AM,
            weekdayPmHeadcount: row.headcounts.Weekday_PM,
            weekendAmHeadcount: row.headcounts.Weekend_AM,
            weekendPmHeadcount: row.headcounts.Weekend_PM,
          });
          results.jobTypesUpdated++;
        }

        if (!serviceJobType) continue;

        // Sync shifts and positions
        await syncShiftsAndPositions(
          ctx,
          service,
          serviceJobType,
          jobType,
          department,
          hospital,
          row.headcounts
        );

        // Sync skills
        await syncSkills(ctx, serviceJobType._id, row.skills, skillByName, results);
      }
    }

    await auditLog(ctx, user, "BULK_IMPORT", "LABOR_POOL", args.departmentId, {
      servicesCreated: results.servicesCreated,
      servicesUpdated: results.servicesUpdated,
      jobTypesAdded: results.jobTypesAdded,
      jobTypesUpdated: results.jobTypesUpdated,
      errors: results.errors.length,
    });

    return results;
  },
});

/**
 * Helper: Sync shifts and job positions for a service_job_type
 */
async function syncShiftsAndPositions(
  ctx: MutationCtx,
  service: Doc<"services">,
  serviceJobType: Doc<"service_job_types">,
  jobType: Doc<"job_types">,
  department: Doc<"departments">,
  hospital: Doc<"hospitals">,
  headcounts: { Weekday_AM?: number; Weekday_PM?: number; Weekend_AM?: number; Weekend_PM?: number }
) {
  const shiftConfigs = [
    { type: "Weekday_AM" as const, name: "Weekday Day Shift", start: service.dayShiftStart, end: service.dayShiftEnd },
    { type: "Weekday_PM" as const, name: "Weekday Night Shift", start: service.nightShiftStart, end: service.nightShiftEnd },
    { type: "Weekend_AM" as const, name: "Weekend Day Shift", start: service.dayShiftStart, end: service.dayShiftEnd },
    { type: "Weekend_PM" as const, name: "Weekend Night Shift", start: service.nightShiftStart, end: service.nightShiftEnd },
  ];

  for (const config of shiftConfigs) {
    const headcount = headcounts[config.type] ?? 0;

    // Find existing shift
    const existingShifts = await ctx.db
      .query("shifts")
      .withIndex("by_service_job_type", (q) => q.eq("serviceJobTypeId", serviceJobType._id))
      .collect();

    let shift = existingShifts.find((s) => s.shiftType === config.type);

    if (headcount > 0) {
      if (!shift) {
        // Create shift
        const shiftId = await ctx.db.insert("shifts", {
          serviceId: service._id,
          serviceJobTypeId: serviceJobType._id,
          name: config.name,
          shiftType: config.type,
          startTime: config.start,
          endTime: config.end,
          positionsNeeded: headcount,
          isActive: true,
        });
        shift = await ctx.db.get(shiftId) ?? undefined;
      } else {
        // Update shift
        await ctx.db.patch(shift._id, {
          positionsNeeded: headcount,
          isActive: true,
        });
      }

      if (shift) {
        // Sync job positions
        await syncJobPositions(ctx, shift, service, serviceJobType, jobType, department, hospital, headcount);
      }
    } else if (shift) {
      // Deactivate shift if headcount is 0
      await ctx.db.patch(shift._id, { isActive: false });

      // Deactivate positions
      const positions = await ctx.db
        .query("job_positions")
        .withIndex("by_shift", (q) => q.eq("shiftId", shift!._id))
        .collect();
      for (const pos of positions) {
        await ctx.db.patch(pos._id, { isActive: false });
      }
    }
  }
}

/**
 * Helper: Sync job positions for a shift
 */
async function syncJobPositions(
  ctx: MutationCtx,
  shift: Doc<"shifts">,
  service: Doc<"services">,
  serviceJobType: Doc<"service_job_types">,
  jobType: Doc<"job_types">,
  department: Doc<"departments">,
  hospital: Doc<"hospitals">,
  targetCount: number
) {
  const existingPositions = await ctx.db
    .query("job_positions")
    .withIndex("by_shift", (q) => q.eq("shiftId", shift._id))
    .collect();

  const activePositions = existingPositions.filter((p) => p.isActive);
  const currentCount = activePositions.length;

  if (targetCount > currentCount) {
    // Add positions
    for (let i = currentCount + 1; i <= targetCount; i++) {
      const jobCode = generateJobCode(
        department.name,
        hospital.shortCode,
        service.shortCode,
        jobType.code,
        shift.shiftType,
        i
      );

      await ctx.db.insert("job_positions", {
        shiftId: shift._id,
        serviceJobTypeId: serviceJobType._id,
        serviceId: service._id,
        hospitalId: service.hospitalId,
        departmentId: service.departmentId,
        jobCode,
        positionNumber: i,
        status: "Open",
        isActive: true,
      });
    }
  } else if (targetCount < currentCount) {
    // Deactivate excess positions (from highest position number)
    const sortedPositions = activePositions.sort((a, b) => b.positionNumber - a.positionNumber);
    const toDeactivate = currentCount - targetCount;
    for (let i = 0; i < toDeactivate; i++) {
      await ctx.db.patch(sortedPositions[i]._id, { isActive: false, status: "Cancelled" });
    }
  }
}

/**
 * Helper: Generate job code
 */
function generateJobCode(
  deptName: string,
  hospitalCode: string,
  serviceCode: string,
  jobTypeCode: string,
  shiftType: string,
  positionNum: number
): string {
  const deptCode = deptName.replace(/[^a-zA-Z]/g, "").substring(0, 8);
  const shiftCodeMap: Record<string, string> = {
    Weekday_AM: "WD_AM",
    Weekday_PM: "WD_PM",
    Weekend_AM: "WE_AM",
    Weekend_PM: "WE_PM",
  };
  const shiftCode = shiftCodeMap[shiftType] || shiftType;
  return `${deptCode}${hospitalCode}${serviceCode}${jobTypeCode}${shiftCode}_${positionNum}`;
}

/**
 * Helper: Sync skills for a service_job_type
 */
async function syncSkills(
  ctx: MutationCtx,
  serviceJobTypeId: Id<"service_job_types">,
  skillNames: string[],
  skillByName: Map<string, Doc<"skills">>,
  results: { errors: string[] }
) {
  // Get existing skill links
  const existingLinks = await ctx.db
    .query("service_job_type_skills")
    .withIndex("by_service_job_type", (q) => q.eq("serviceJobTypeId", serviceJobTypeId))
    .collect();

  const existingSkillIds = new Set(existingLinks.map((l) => l.skillId.toString()));
  const targetSkillIds = new Set<string>();

  // Add new skills
  for (const skillName of skillNames) {
    const trimmedName = skillName.trim();
    if (!trimmedName) continue;

    const skill = skillByName.get(trimmedName.toUpperCase());
    if (!skill) {
      results.errors.push(`Unknown skill: "${trimmedName}"`);
      continue;
    }

    targetSkillIds.add(skill._id.toString());

    if (!existingSkillIds.has(skill._id.toString())) {
      await ctx.db.insert("service_job_type_skills", {
        serviceJobTypeId,
        skillId: skill._id,
        isRequired: true,
      });
    }
  }

  // Remove skills no longer in the list
  for (const link of existingLinks) {
    if (!targetSkillIds.has(link.skillId.toString())) {
      await ctx.db.delete(link._id);
    }
  }
}
