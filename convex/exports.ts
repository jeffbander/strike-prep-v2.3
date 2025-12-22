import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get all data needed for Excel export
 */
export const getCoverageExportData = query({
  args: {
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) return null;

    // Get all job positions based on scope
    let positions;
    if (args.departmentId) {
      const departmentId = args.departmentId;
      positions = await ctx.db
        .query("job_positions")
        .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    } else if (args.hospitalId) {
      const hospitalId = args.hospitalId;
      positions = await ctx.db
        .query("job_positions")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    } else {
      positions = await ctx.db
        .query("job_positions")
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    }

    // Get all assignments
    const assignments = await ctx.db.query("assignments").collect();
    const assignmentMap = new Map(
      assignments
        .filter((a) => a.status === "Active" || a.status === "Confirmed")
        .map((a) => [a.jobPositionId.toString(), a])
    );

    // Enrich positions with all related data
    const enrichedPositions = await Promise.all(
      positions.map(async (pos) => {
        const shift = await ctx.db.get(pos.shiftId);
        const service = await ctx.db.get(pos.serviceId);
        const department = await ctx.db.get(pos.departmentId);
        const hospital = await ctx.db.get(pos.hospitalId);
        const serviceJobType = await ctx.db.get(pos.serviceJobTypeId);
        const jobType = serviceJobType
          ? await ctx.db.get(serviceJobType.jobTypeId)
          : null;

        // Get assignment and provider if assigned
        const assignment = assignmentMap.get(pos._id.toString());
        let provider = null;
        if (assignment) {
          provider = await ctx.db.get(assignment.providerId);
        }

        return {
          jobCode: pos.jobCode,
          status: pos.status,
          hospitalName: hospital?.name || "",
          hospitalCode: hospital?.shortCode || "",
          departmentName: department?.name || "",
          serviceName: service?.name || "",
          serviceCode: service?.shortCode || "",
          jobTypeName: jobType?.name || "",
          jobTypeCode: jobType?.code || "",
          shiftType: shift?.shiftType || "",
          shiftStart: shift?.startTime || "",
          shiftEnd: shift?.endTime || "",
          positionNumber: pos.positionNumber,
          // Provider info (if assigned)
          providerFirstName: provider?.firstName || "",
          providerLastName: provider?.lastName || "",
          providerEmployeeId: provider?.employeeId || "",
          providerPhone: provider?.cellPhone || "",
          assignmentStatus: assignment?.status || "",
          assignedAt: assignment?.assignedAt
            ? new Date(assignment.assignedAt).toISOString()
            : "",
        };
      })
    );

    // Calculate summary stats
    const total = enrichedPositions.length;
    const open = enrichedPositions.filter((p) => p.status === "Open").length;
    const assigned = enrichedPositions.filter((p) => p.status === "Assigned").length;
    const confirmed = enrichedPositions.filter((p) => p.status === "Confirmed").length;

    // Group by hospital for summary
    const byHospital = enrichedPositions.reduce((acc, pos) => {
      const key = pos.hospitalCode;
      if (!acc[key]) {
        acc[key] = {
          hospitalName: pos.hospitalName,
          hospitalCode: key,
          total: 0,
          open: 0,
          assigned: 0,
          confirmed: 0,
        };
      }
      acc[key].total++;
      if (pos.status === "Open") acc[key].open++;
      if (pos.status === "Assigned") acc[key].assigned++;
      if (pos.status === "Confirmed") acc[key].confirmed++;
      return acc;
    }, {} as Record<string, any>);

    // Group by department
    const byDepartment = enrichedPositions.reduce((acc, pos) => {
      const key = `${pos.hospitalCode}-${pos.departmentName}`;
      if (!acc[key]) {
        acc[key] = {
          hospitalCode: pos.hospitalCode,
          departmentName: pos.departmentName,
          total: 0,
          open: 0,
          assigned: 0,
          confirmed: 0,
        };
      }
      acc[key].total++;
      if (pos.status === "Open") acc[key].open++;
      if (pos.status === "Assigned") acc[key].assigned++;
      if (pos.status === "Confirmed") acc[key].confirmed++;
      return acc;
    }, {} as Record<string, any>);

    // Group by shift type
    const byShiftType = enrichedPositions.reduce((acc, pos) => {
      const key = pos.shiftType || "Unknown";
      if (!acc[key]) {
        acc[key] = {
          shiftType: key,
          total: 0,
          open: 0,
          assigned: 0,
          confirmed: 0,
        };
      }
      acc[key].total++;
      if (pos.status === "Open") acc[key].open++;
      if (pos.status === "Assigned") acc[key].assigned++;
      if (pos.status === "Confirmed") acc[key].confirmed++;
      return acc;
    }, {} as Record<string, any>);

    // Group by service
    const byService = enrichedPositions.reduce((acc, pos) => {
      const key = `${pos.hospitalCode}-${pos.serviceName}`;
      if (!acc[key]) {
        acc[key] = {
          hospitalCode: pos.hospitalCode,
          serviceName: pos.serviceName,
          serviceCode: pos.serviceCode,
          total: 0,
          open: 0,
          assigned: 0,
          confirmed: 0,
        };
      }
      acc[key].total++;
      if (pos.status === "Open") acc[key].open++;
      if (pos.status === "Assigned") acc[key].assigned++;
      if (pos.status === "Confirmed") acc[key].confirmed++;
      return acc;
    }, {} as Record<string, any>);

    return {
      summary: {
        total,
        open,
        assigned,
        confirmed,
        filled: assigned + confirmed,
        coveragePercent: total > 0 ? Math.round(((assigned + confirmed) / total) * 100) : 0,
        exportedAt: new Date().toISOString(),
        exportedBy: currentUser.email,
      },
      byHospital: Object.values(byHospital),
      byDepartment: Object.values(byDepartment),
      byShiftType: Object.values(byShiftType),
      byService: Object.values(byService),
      positions: enrichedPositions,
    };
  },
});

/**
 * Get services export data with all attributes for CSV export
 */
export const getServicesExportData = query({
  args: {
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),
    healthSystemId: v.optional(v.id("health_systems")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Get services based on scope
    let services;
    if (args.departmentId) {
      const departmentId = args.departmentId;
      services = await ctx.db
        .query("services")
        .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
        .collect();
    } else if (args.hospitalId) {
      const hospitalId = args.hospitalId;
      services = await ctx.db
        .query("services")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
        .collect();
    } else if (args.healthSystemId) {
      const healthSystemId = args.healthSystemId;
      services = await ctx.db
        .query("services")
        .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
        .collect();
    } else {
      services = await ctx.db.query("services").collect();
    }

    // Enrich with related data
    const enrichedServices = await Promise.all(
      services.map(async (service) => {
        const hospital = await ctx.db.get(service.hospitalId);
        const department = await ctx.db.get(service.departmentId);
        const unit = service.unitId ? await ctx.db.get(service.unitId) : null;
        const linkedDownstream = service.linkedDownstreamServiceId
          ? await ctx.db.get(service.linkedDownstreamServiceId)
          : null;

        // Get service job types with their details
        const serviceJobTypes = await ctx.db
          .query("service_job_types")
          .withIndex("by_service", (q) => q.eq("serviceId", service._id))
          .collect();

        const jobTypesData = await Promise.all(
          serviceJobTypes.map(async (sjt) => {
            const jobType = await ctx.db.get(sjt.jobTypeId);
            return {
              jobTypeCode: jobType?.code || "",
              jobTypeName: jobType?.name || "",
              headcount: sjt.headcount || 0,
              weekdayAmHeadcount: sjt.weekdayAmHeadcount,
              weekdayPmHeadcount: sjt.weekdayPmHeadcount,
              weekendAmHeadcount: sjt.weekendAmHeadcount,
              weekendPmHeadcount: sjt.weekendPmHeadcount,
              // Per-job-type shift config (optional overrides)
              dayShiftStart: sjt.dayShiftStart,
              dayShiftEnd: sjt.dayShiftEnd,
              nightShiftStart: sjt.nightShiftStart,
              nightShiftEnd: sjt.nightShiftEnd,
              operatesDays: sjt.operatesDays,
              operatesNights: sjt.operatesNights,
            };
          })
        );

        return {
          // Basic Info
          name: service.name,
          shortCode: service.shortCode,
          hospitalCode: hospital?.shortCode || "",
          hospitalName: hospital?.name || "",
          departmentName: department?.name || "",
          unitName: unit?.name || "",

          // Service Type Classification
          serviceType: service.serviceType || "",
          admitCapacity: service.admitCapacity || "",
          feederSource: service.feederSource || "",
          linkedDownstreamServiceCode: linkedDownstream?.shortCode || "",

          // Patient Capacity
          dayCapacity: service.dayCapacity || "",
          nightCapacity: service.nightCapacity || "",
          weekendCapacity: service.weekendCapacity || "",

          // Shift Times
          dayShiftStart: service.dayShiftStart,
          dayShiftEnd: service.dayShiftEnd,
          nightShiftStart: service.nightShiftStart,
          nightShiftEnd: service.nightShiftEnd,

          // Operating Modes
          operatesDays: service.operatesDays ? "Yes" : "No",
          operatesNights: service.operatesNights ? "Yes" : "No",
          operatesWeekends: service.operatesWeekends ? "Yes" : "No",

          // Status
          isActive: service.isActive ? "Yes" : "No",

          // Job Types (serialized for CSV - pipe-separated for multiple job types)
          jobTypes: jobTypesData
            .map(
              (jt) =>
                `${jt.jobTypeCode}:${jt.headcount}` +
                (jt.weekdayAmHeadcount !== undefined ? `:AM=${jt.weekdayAmHeadcount}` : "") +
                (jt.weekdayPmHeadcount !== undefined ? `:PM=${jt.weekdayPmHeadcount}` : "") +
                (jt.weekendAmHeadcount !== undefined ? `:WE_AM=${jt.weekendAmHeadcount}` : "") +
                (jt.weekendPmHeadcount !== undefined ? `:WE_PM=${jt.weekendPmHeadcount}` : "")
            )
            .join("|"),

          // Raw job types array for more advanced processing
          jobTypesArray: jobTypesData,
        };
      })
    );

    return {
      total: enrichedServices.length,
      active: enrichedServices.filter((s) => s.isActive === "Yes").length,
      services: enrichedServices,
      exportedAt: new Date().toISOString(),
    };
  },
});

/**
 * Get providers export data
 */
export const getProvidersExportData = query({
  args: {
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Get providers based on scope
    let providers;
    if (args.departmentId) {
      const departmentId = args.departmentId;
      providers = await ctx.db
        .query("providers")
        .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
        .collect();
    } else if (args.hospitalId) {
      const hospitalId = args.hospitalId;
      providers = await ctx.db
        .query("providers")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
        .collect();
    } else {
      providers = await ctx.db.query("providers").collect();
    }

    // Enrich with related data
    const enrichedProviders = await Promise.all(
      providers.map(async (provider) => {
        const hospital = await ctx.db.get(provider.hospitalId);
        const department = await ctx.db.get(provider.departmentId);
        const jobType = await ctx.db.get(provider.jobTypeId);

        // Get skills
        const skillLinks = await ctx.db
          .query("provider_skills")
          .withIndex("by_provider", (q) => q.eq("providerId", provider._id))
          .collect();

        const skills = await Promise.all(
          skillLinks.map(async (link) => {
            const skill = await ctx.db.get(link.skillId);
            return skill?.name || "";
          })
        );

        // Get current assignment
        const assignment = await ctx.db
          .query("assignments")
          .withIndex("by_provider_status", (q) =>
            q.eq("providerId", provider._id).eq("status", "Active")
          )
          .first();

        let assignedPosition = null;
        if (assignment) {
          const pos = await ctx.db.get(assignment.jobPositionId);
          assignedPosition = pos?.jobCode || "";
        }

        return {
          firstName: provider.firstName,
          lastName: provider.lastName,
          employeeId: provider.employeeId || "",
          email: provider.email || "",
          phone: provider.cellPhone || "",
          jobType: jobType?.code || "",
          homeHospital: hospital?.shortCode || "",
          homeDepartment: department?.name || "",
          supervisingMD: provider.supervisingPhysician || "",
          certification: provider.specialtyCertification || "",
          experience: provider.previousExperience || "",
          skills: skills.filter(Boolean).join(", "),
          isActive: provider.isActive ? "Yes" : "No",
          currentAssignment: assignedPosition || "Unassigned",
        };
      })
    );

    return {
      total: enrichedProviders.length,
      active: enrichedProviders.filter((p) => p.isActive === "Yes").length,
      assigned: enrichedProviders.filter((p) => p.currentAssignment !== "Unassigned").length,
      providers: enrichedProviders,
    };
  },
});
