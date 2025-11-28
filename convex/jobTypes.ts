import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Default job types from PRD - 6 types per health system
const DEFAULT_JOB_TYPES = [
  { name: "Physician", code: "MD", description: "Medical Doctor" },
  { name: "Nurse Practitioner", code: "NP", description: "Advanced Practice Registered Nurse" },
  { name: "Physician Assistant", code: "PA", description: "Physician Assistant" },
  { name: "Registered Nurse", code: "RN", description: "Registered Nurse" },
  { name: "Fellow", code: "FEL", description: "Medical Fellow" },
  { name: "Resident", code: "RES", description: "Medical Resident" },
];

/**
 * List job types for a health system
 */
export const list = query({
  args: {
    healthSystemId: v.optional(v.id("health_systems")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) return [];

    if (args.healthSystemId) {
      const healthSystemId = args.healthSystemId;
      return await ctx.db
        .query("job_types")
        .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    }

    // Use user's health system
    if (currentUser.healthSystemId) {
      const healthSystemId = currentUser.healthSystemId;
      return await ctx.db
        .query("job_types")
        .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    }

    return [];
  },
});

/**
 * List all job types including inactive (for admin view)
 */
export const listAll = query({
  args: {
    healthSystemId: v.optional(v.id("health_systems")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) return [];

    // Determine which health system to query
    let targetHealthSystemId = args.healthSystemId || currentUser.healthSystemId;

    if (!targetHealthSystemId) {
      // Super admin with no health system specified - return empty
      return [];
    }

    return await ctx.db
      .query("job_types")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", targetHealthSystemId))
      .collect();
  },
});

/**
 * Seed default job types for a health system
 */
export const seedDefaults = mutation({
  args: {
    healthSystemId: v.id("health_systems"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    // Only super_admin or health_system_admin of that system can seed
    if (currentUser.role !== "super_admin" &&
        !(currentUser.role === "health_system_admin" && currentUser.healthSystemId === args.healthSystemId)) {
      throw new Error("Insufficient permissions to seed job types");
    }

    // Check if job types already exist for this health system
    const existing = await ctx.db
      .query("job_types")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", args.healthSystemId))
      .collect();

    if (existing.length > 0) {
      return { seeded: 0, message: "Job types already exist for this health system" };
    }

    let seeded = 0;
    for (const jt of DEFAULT_JOB_TYPES) {
      await ctx.db.insert("job_types", {
        healthSystemId: args.healthSystemId,
        name: jt.name,
        code: jt.code,
        description: jt.description,
        isDefault: true,
        isActive: true,
      });
      seeded++;
    }

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "SEED_DEFAULT_JOB_TYPES",
      resourceType: "JOB_TYPE",
      changes: { healthSystemId: args.healthSystemId, count: seeded },
      timestamp: Date.now(),
    });

    return { seeded, message: `Seeded ${seeded} default job types` };
  },
});

/**
 * Create a custom job type
 */
export const create = mutation({
  args: {
    healthSystemId: v.id("health_systems"),
    name: v.string(),
    code: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    // Permission check
    if (currentUser.role !== "super_admin" &&
        !(currentUser.role === "health_system_admin" && currentUser.healthSystemId === args.healthSystemId)) {
      throw new Error("Insufficient permissions");
    }

    // Check for duplicate code within health system
    const existing = await ctx.db
      .query("job_types")
      .withIndex("by_health_system_code", (q) =>
        q.eq("healthSystemId", args.healthSystemId).eq("code", args.code)
      )
      .first();

    if (existing) {
      throw new Error(`Job type code "${args.code}" already exists in this health system`);
    }

    const jobTypeId = await ctx.db.insert("job_types", {
      healthSystemId: args.healthSystemId,
      name: args.name,
      code: args.code,
      description: args.description,
      isDefault: false,
      isActive: true,
    });

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "CREATE_JOB_TYPE",
      resourceType: "JOB_TYPE",
      resourceId: jobTypeId,
      changes: { name: args.name, code: args.code },
      timestamp: Date.now(),
    });

    return { jobTypeId };
  },
});

/**
 * Update a job type
 */
export const update = mutation({
  args: {
    jobTypeId: v.id("job_types"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const jobType = await ctx.db.get(args.jobTypeId);
    if (!jobType) throw new Error("Job type not found");

    // Permission check
    if (currentUser.role !== "super_admin" &&
        !(currentUser.role === "health_system_admin" && currentUser.healthSystemId === jobType.healthSystemId)) {
      throw new Error("Insufficient permissions");
    }

    // If changing code, check for duplicates
    if (args.code && args.code !== jobType.code) {
      const newCode = args.code;
      const existing = await ctx.db
        .query("job_types")
        .withIndex("by_health_system_code", (q) =>
          q.eq("healthSystemId", jobType.healthSystemId).eq("code", newCode)
        )
        .first();

      if (existing) {
        throw new Error(`Job type code "${newCode}" already exists`);
      }
    }

    const updates: Record<string, string | undefined> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.code !== undefined) updates.code = args.code;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.jobTypeId, updates);

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "UPDATE_JOB_TYPE",
      resourceType: "JOB_TYPE",
      resourceId: args.jobTypeId,
      changes: updates,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Toggle job type active status
 */
export const toggleActive = mutation({
  args: { jobTypeId: v.id("job_types") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const jobType = await ctx.db.get(args.jobTypeId);
    if (!jobType) throw new Error("Job type not found");

    // Permission check
    if (currentUser.role !== "super_admin" &&
        !(currentUser.role === "health_system_admin" && currentUser.healthSystemId === jobType.healthSystemId)) {
      throw new Error("Insufficient permissions");
    }

    await ctx.db.patch(args.jobTypeId, { isActive: !jobType.isActive });

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: jobType.isActive ? "DEACTIVATE_JOB_TYPE" : "ACTIVATE_JOB_TYPE",
      resourceType: "JOB_TYPE",
      resourceId: args.jobTypeId,
      changes: { name: jobType.name },
      timestamp: Date.now(),
    });

    return { isActive: !jobType.isActive };
  },
});
