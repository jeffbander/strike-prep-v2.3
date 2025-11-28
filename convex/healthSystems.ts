import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { checkHealthSystemDependencies } from "./lib/deletion";

// Default job types to create for each health system
const DEFAULT_JOB_TYPES = [
  { code: "MD", name: "Medical Doctor / Physician" },
  { code: "NP", name: "Nurse Practitioner" },
  { code: "PA", name: "Physician Assistant" },
  { code: "RN", name: "Registered Nurse" },
  { code: "Fellow", name: "Fellow (Specialty Training)" },
  { code: "Resident", name: "Resident (Training Physician)" },
];

/**
 * Create a new health system (Super Admin only)
 */
export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Get current user
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");
    if (currentUser.role !== "super_admin") {
      throw new Error("Only Super Admins can create health systems");
    }

    // Generate slug from name
    const slug = args.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Check if slug already exists
    const existing = await ctx.db
      .query("health_systems")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (existing) {
      throw new Error("A health system with this name already exists");
    }

    // Create health system
    const healthSystemId = await ctx.db.insert("health_systems", {
      name: args.name,
      slug,
      createdBy: currentUser._id,
      isActive: true,
      createdAt: Date.now(),
    });

    // Create default job types for this health system
    for (const jt of DEFAULT_JOB_TYPES) {
      await ctx.db.insert("job_types", {
        healthSystemId,
        code: jt.code,
        name: jt.name,
        isDefault: true,
        isActive: true,
      });
    }

    // Log the action
    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "CREATE_HEALTH_SYSTEM",
      resourceType: "HEALTH_SYSTEM",
      resourceId: healthSystemId,
      changes: { name: args.name, slug },
      timestamp: Date.now(),
    });

    return { healthSystemId, jobTypesCreated: DEFAULT_JOB_TYPES.length };
  },
});

/**
 * List all health systems (Super Admin only)
 */
export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) return [];

    // Super admin sees all
    if (currentUser.role === "super_admin") {
      return await ctx.db.query("health_systems").collect();
    }

    // Health system admin sees only their health system
    if (currentUser.role === "health_system_admin" && currentUser.healthSystemId) {
      const hs = await ctx.db.get(currentUser.healthSystemId);
      return hs ? [hs] : [];
    }

    return [];
  },
});

/**
 * Get a single health system
 */
export const get = query({
  args: { healthSystemId: v.id("health_systems") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.healthSystemId);
  },
});

/**
 * Update a health system
 */
export const update = mutation({
  args: {
    healthSystemId: v.id("health_systems"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");
    if (currentUser.role !== "super_admin") {
      throw new Error("Only Super Admins can update health systems");
    }

    await ctx.db.patch(args.healthSystemId, {
      name: args.name,
    });

    return { success: true };
  },
});

/**
 * Deactivate a health system
 */
export const deactivate = mutation({
  args: { healthSystemId: v.id("health_systems") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");
    if (currentUser.role !== "super_admin") {
      throw new Error("Only Super Admins can deactivate health systems");
    }

    await ctx.db.patch(args.healthSystemId, {
      isActive: false,
    });

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "DEACTIVATE_HEALTH_SYSTEM",
      resourceType: "HEALTH_SYSTEM",
      resourceId: args.healthSystemId,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Check if a health system can be safely deleted
 */
export const canDelete = query({
  args: { healthSystemId: v.id("health_systems") },
  handler: async (ctx, args) => {
    return await checkHealthSystemDependencies(ctx, args.healthSystemId);
  },
});
