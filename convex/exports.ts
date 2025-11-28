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
