import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

/**
 * Get open job positions for matching
 */
export const getOpenPositions = query({
  args: {
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) return [];

    let positions;

    if (args.departmentId) {
      const departmentId = args.departmentId;
      positions = await ctx.db
        .query("job_positions")
        .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
        .filter((q) => q.eq(q.field("status"), "Open"))
        .collect();
    } else if (args.hospitalId) {
      const hospitalId = args.hospitalId;
      positions = await ctx.db
        .query("job_positions")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
        .filter((q) => q.eq(q.field("status"), "Open"))
        .collect();
    } else if (currentUser.departmentId) {
      const departmentId = currentUser.departmentId;
      positions = await ctx.db
        .query("job_positions")
        .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
        .filter((q) => q.eq(q.field("status"), "Open"))
        .collect();
    } else {
      return [];
    }

    // Enrich with service and shift data
    const enriched = await Promise.all(
      positions.map(async (pos) => {
        const shift = await ctx.db.get(pos.shiftId);
        const service = await ctx.db.get(pos.serviceId);
        const department = await ctx.db.get(pos.departmentId);
        const hospital = await ctx.db.get(pos.hospitalId);

        return {
          ...pos,
          shift,
          service,
          department,
          hospital,
        };
      })
    );

    return enriched;
  },
});

/**
 * Find matching providers for a job position
 */
export const findMatchesForPosition = query({
  args: { jobPositionId: v.id("job_positions") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobPositionId);
    if (!job || job.status !== "Open") return [];

    // Get required skills for this position
    const serviceJobType = await ctx.db.get(job.serviceJobTypeId);
    if (!serviceJobType) return [];

    const requiredSkillLinks = await ctx.db
      .query("service_job_type_skills")
      .withIndex("by_service_job_type", (q) => q.eq("serviceJobTypeId", job.serviceJobTypeId))
      .filter((q) => q.eq(q.field("isRequired"), true))
      .collect();

    const requiredSkillIds = new Set(requiredSkillLinks.map((s) => s.skillId.toString()));
    const requiredSkills = await Promise.all(requiredSkillLinks.map((s) => ctx.db.get(s.skillId)));

    // Get all active providers with matching job type
    const providers = await ctx.db
      .query("providers")
      .withIndex("by_job_type", (q) => q.eq("jobTypeId", serviceJobType.jobTypeId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const results = [];

    for (const provider of providers) {
      // Check if already assigned
      const existingAssignment = await ctx.db
        .query("assignments")
        .withIndex("by_provider_status", (q) => q.eq("providerId", provider._id).eq("status", "Active"))
        .first();

      if (existingAssignment) continue;

      // Check hospital access
      const canWork = await canProviderWorkAtHospital(ctx, provider._id, job.hospitalId, provider.hospitalId);
      if (!canWork) continue;

      // Get provider's skills
      const providerSkillLinks = await ctx.db
        .query("provider_skills")
        .withIndex("by_provider", (q) => q.eq("providerId", provider._id))
        .collect();

      const providerSkillIds = new Set(providerSkillLinks.map((s) => s.skillId.toString()));

      // Calculate matches
      const matchedSkills: string[] = [];
      const missingSkills: string[] = [];

      for (const skill of requiredSkills) {
        if (!skill) continue;
        if (providerSkillIds.has(skill._id.toString())) {
          matchedSkills.push(skill.name);
        } else {
          missingSkills.push(skill.name);
        }
      }

      // Find extra skills
      const extraSkills: string[] = [];
      for (const link of providerSkillLinks) {
        if (!requiredSkillIds.has(link.skillId.toString())) {
          const skill = await ctx.db.get(link.skillId);
          if (skill) extraSkills.push(skill.name);
        }
      }

      // Determine match quality
      let matchQuality: "Perfect" | "Good" | "Partial";
      if (missingSkills.length > 0) {
        matchQuality = "Partial";
      } else if (extraSkills.length === 0) {
        matchQuality = "Perfect";
      } else {
        matchQuality = "Good";
      }

      // Calculate score
      let score = matchedSkills.length * 10;
      if (provider.departmentId === job.departmentId) score += 5;
      if (provider.hospitalId === job.hospitalId) score += 3;
      score -= extraSkills.length * 2;

      // Get current assignment count
      const allAssignments = await ctx.db
        .query("assignments")
        .withIndex("by_provider", (q) => q.eq("providerId", provider._id))
        .filter((q) => q.eq(q.field("status"), "Active"))
        .collect();

      const jobType = await ctx.db.get(provider.jobTypeId);
      const homeHospital = await ctx.db.get(provider.hospitalId);
      const homeDept = await ctx.db.get(provider.departmentId);

      results.push({
        providerId: provider._id,
        provider: {
          firstName: provider.firstName,
          lastName: provider.lastName,
          jobType: jobType?.code || "",
          homeHospital: homeHospital?.shortCode || "",
          homeDepartment: homeDept?.name || "",
        },
        matchQuality,
        score,
        matchedSkills,
        missingSkills,
        extraSkills,
        currentAssignments: allAssignments.length,
      });
    }

    // Sort by score descending
    return results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.currentAssignments !== b.currentAssignments) {
        return a.currentAssignments - b.currentAssignments;
      }
      return a.provider.lastName.localeCompare(b.provider.lastName);
    });
  },
});

async function canProviderWorkAtHospital(
  ctx: any,
  providerId: Id<"providers">,
  hospitalId: Id<"hospitals">,
  providerHomeHospitalId: Id<"hospitals">
): Promise<boolean> {
  // Home hospital always allowed
  if (providerHomeHospitalId === hospitalId) return true;

  // Check explicit access
  const access = await ctx.db
    .query("provider_hospital_access")
    .withIndex("by_provider", (q: any) => q.eq("providerId", providerId))
    .filter((q: any) => q.eq(q.field("hospitalId"), hospitalId))
    .first();

  return !!access;
}

/**
 * Create an assignment
 */
export const createAssignment = mutation({
  args: {
    jobPositionId: v.id("job_positions"),
    providerId: v.id("providers"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    // Get job position
    const job = await ctx.db.get(args.jobPositionId);
    if (!job) throw new Error("Job position not found");
    if (job.status !== "Open") {
      throw new Error("Position is not open");
    }

    // Check provider not already assigned
    const existingProviderAssignment = await ctx.db
      .query("assignments")
      .withIndex("by_provider_status", (q) => q.eq("providerId", args.providerId).eq("status", "Active"))
      .first();

    if (existingProviderAssignment) {
      const existingJob = await ctx.db.get(existingProviderAssignment.jobPositionId);
      throw new Error(`Provider already assigned to ${existingJob?.jobCode || "another position"}`);
    }

    // Check job not already filled
    const existingJobAssignment = await ctx.db
      .query("assignments")
      .withIndex("by_job_position", (q) => q.eq("jobPositionId", args.jobPositionId))
      .filter((q) => q.eq(q.field("status"), "Active"))
      .first();

    if (existingJobAssignment) {
      throw new Error("Position was just filled by another user");
    }

    // Create assignment
    const assignmentId = await ctx.db.insert("assignments", {
      jobPositionId: args.jobPositionId,
      providerId: args.providerId,
      hospitalId: job.hospitalId,
      departmentId: job.departmentId,
      shiftId: job.shiftId,
      status: "Active",
      assignedAt: Date.now(),
      assignedBy: currentUser._id,
      notes: args.notes,
    });

    // Update job position status
    await ctx.db.patch(args.jobPositionId, { status: "Assigned" });

    // Audit log
    const provider = await ctx.db.get(args.providerId);
    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "ASSIGN",
      resourceType: "ASSIGNMENT",
      resourceId: assignmentId,
      changes: {
        jobCode: job.jobCode,
        provider: `${provider?.firstName} ${provider?.lastName}`,
      },
      timestamp: Date.now(),
    });

    return { assignmentId };
  },
});

/**
 * Confirm an assignment (provider has been verified/confirmed)
 */
export const confirmAssignment = mutation({
  args: {
    assignmentId: v.id("assignments"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error("Assignment not found");

    if (assignment.status !== "Active") {
      throw new Error(`Cannot confirm assignment with status: ${assignment.status}`);
    }

    // Update assignment to confirmed
    await ctx.db.patch(args.assignmentId, {
      status: "Confirmed",
      notes: args.notes || assignment.notes,
    });

    // Update job position
    await ctx.db.patch(assignment.jobPositionId, { status: "Confirmed" });

    // Get provider for audit log
    const provider = await ctx.db.get(assignment.providerId);
    const job = await ctx.db.get(assignment.jobPositionId);

    // Audit log
    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "CONFIRM_ASSIGNMENT",
      resourceType: "ASSIGNMENT",
      resourceId: args.assignmentId,
      changes: {
        jobCode: job?.jobCode,
        provider: `${provider?.firstName} ${provider?.lastName}`,
      },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Cancel an assignment
 */
export const cancelAssignment = mutation({
  args: {
    assignmentId: v.id("assignments"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error("Assignment not found");

    // Update assignment
    await ctx.db.patch(args.assignmentId, {
      status: "Cancelled",
      cancelledAt: Date.now(),
      cancelledBy: currentUser._id,
      cancelReason: args.reason,
    });

    // Update job position back to Open
    await ctx.db.patch(assignment.jobPositionId, { status: "Open" });

    // Audit log
    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "UNASSIGN",
      resourceType: "ASSIGNMENT",
      resourceId: args.assignmentId,
      changes: { reason: args.reason },
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Reassign a position to a different provider
 */
export const reassignPosition = mutation({
  args: {
    assignmentId: v.id("assignments"),
    newProviderId: v.id("providers"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error("Assignment not found");

    if (assignment.status === "Cancelled") {
      throw new Error("Cannot reassign a cancelled assignment");
    }

    // Check new provider is not already assigned
    const existingAssignment = await ctx.db
      .query("assignments")
      .withIndex("by_provider_status", (q) =>
        q.eq("providerId", args.newProviderId).eq("status", "Active")
      )
      .first();

    if (existingAssignment) {
      throw new Error("New provider already has an active assignment");
    }

    const oldProvider = await ctx.db.get(assignment.providerId);
    const newProvider = await ctx.db.get(args.newProviderId);
    const job = await ctx.db.get(assignment.jobPositionId);

    // Cancel old assignment
    await ctx.db.patch(args.assignmentId, {
      status: "Cancelled",
      cancelledAt: Date.now(),
      cancelledBy: currentUser._id,
      cancelReason: args.reason || "Reassigned to different provider",
    });

    // Create new assignment
    const newAssignmentId = await ctx.db.insert("assignments", {
      jobPositionId: assignment.jobPositionId,
      providerId: args.newProviderId,
      hospitalId: assignment.hospitalId,
      departmentId: assignment.departmentId,
      shiftId: assignment.shiftId,
      status: "Active",
      assignedAt: Date.now(),
      assignedBy: currentUser._id,
      notes: `Reassigned from ${oldProvider?.firstName} ${oldProvider?.lastName}`,
    });

    // Update job position
    await ctx.db.patch(assignment.jobPositionId, { status: "Assigned" });

    // Audit log
    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "REASSIGN",
      resourceType: "ASSIGNMENT",
      resourceId: newAssignmentId,
      changes: {
        jobCode: job?.jobCode,
        oldProvider: `${oldProvider?.firstName} ${oldProvider?.lastName}`,
        newProvider: `${newProvider?.firstName} ${newProvider?.lastName}`,
        reason: args.reason,
      },
      timestamp: Date.now(),
    });

    return { newAssignmentId };
  },
});

/**
 * Get coverage stats
 */
export const getCoverageStats = query({
  args: {
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
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

    const total = positions.length;
    const open = positions.filter((p) => p.status === "Open").length;
    const assigned = positions.filter((p) => p.status === "Assigned").length;
    const confirmed = positions.filter((p) => p.status === "Confirmed").length;

    return {
      totalPositions: total,
      total,
      open,
      assigned,
      confirmed,
      filled: assigned + confirmed,
      coveragePercent: total > 0 ? Math.round(((assigned + confirmed) / total) * 100) : 0,
    };
  },
});

/**
 * Get current assignments
 */
export const getAssignments = query({
  args: {
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
    let assignments;

    if (args.departmentId) {
      const departmentId = args.departmentId;
      assignments = await ctx.db
        .query("assignments")
        .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
        .filter((q) => q.eq(q.field("status"), "Active"))
        .collect();
    } else if (args.hospitalId) {
      const hospitalId = args.hospitalId;
      assignments = await ctx.db
        .query("assignments")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
        .filter((q) => q.eq(q.field("status"), "Active"))
        .collect();
    } else {
      assignments = await ctx.db
        .query("assignments")
        .withIndex("by_status", (q) => q.eq("status", "Active"))
        .collect();
    }

    // Enrich with provider and position data
    const enriched = await Promise.all(
      assignments.map(async (a) => {
        const provider = await ctx.db.get(a.providerId);
        const jobPosition = await ctx.db.get(a.jobPositionId);
        const shift = await ctx.db.get(a.shiftId);

        return {
          ...a,
          provider,
          jobPosition,
          shift,
        };
      })
    );

    return enriched;
  },
});
