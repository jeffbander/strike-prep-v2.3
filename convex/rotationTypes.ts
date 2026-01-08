import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Default rotation types with common AMion rotation names
const DEFAULT_ROTATION_TYPES = [
  // Unavailable types (not curtailable)
  { name: "Vac", shortCode: "VAC", category: "vacation", isCurtailable: false, color: "#EF4444" },
  { name: "Vacation", shortCode: "VAC", category: "vacation", isCurtailable: false, color: "#EF4444" },
  { name: "Sick", shortCode: "SICK", category: "sick", isCurtailable: false, color: "#EF4444" },
  { name: "PTO", shortCode: "PTO", category: "vacation", isCurtailable: false, color: "#EF4444" },
  { name: "LOA", shortCode: "LOA", category: "unavailable", isCurtailable: false, color: "#EF4444" },
  { name: "Maternity", shortCode: "MAT", category: "unavailable", isCurtailable: false, color: "#EF4444" },
  { name: "FMLA", shortCode: "FMLA", category: "unavailable", isCurtailable: false, color: "#EF4444" },

  // Curtailable types (can be pulled for strike)
  { name: "Research", shortCode: "RES", category: "curtailable", isCurtailable: true, color: "#F59E0B" },
  { name: "Elective", shortCode: "ELEC", category: "curtailable", isCurtailable: true, color: "#F59E0B" },
  { name: "Admin", shortCode: "ADM", category: "curtailable", isCurtailable: true, color: "#F59E0B" },
  { name: "Conference", shortCode: "CONF", category: "curtailable", isCurtailable: true, color: "#F59E0B" },
  { name: "Education", shortCode: "EDU", category: "curtailable", isCurtailable: true, color: "#F59E0B" },
  { name: "CME", shortCode: "CME", category: "curtailable", isCurtailable: true, color: "#F59E0B" },

  // On-service types (working, not available for other things)
  { name: "On Call", shortCode: "CALL", category: "on_service", isCurtailable: false, color: "#3B82F6" },
  { name: "Attending", shortCode: "ATT", category: "on_service", isCurtailable: false, color: "#3B82F6" },
  { name: "Consult", shortCode: "CON", category: "on_service", isCurtailable: false, color: "#3B82F6" },
  { name: "Inpatient", shortCode: "INP", category: "on_service", isCurtailable: false, color: "#3B82F6" },
  { name: "Night", shortCode: "NGT", category: "on_service", isCurtailable: false, color: "#3B82F6" },
  { name: "Weekend", shortCode: "WKD", category: "on_service", isCurtailable: false, color: "#3B82F6" },
];

/**
 * List all active rotation types for a health system
 */
export const list = query({
  args: {
    healthSystemId: v.id("health_systems"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rotation_types")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", args.healthSystemId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

/**
 * List rotation types grouped by category
 */
export const listByCategory = query({
  args: {
    healthSystemId: v.id("health_systems"),
  },
  handler: async (ctx, args) => {
    const rotationTypes = await ctx.db
      .query("rotation_types")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", args.healthSystemId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const byCategory: Record<string, typeof rotationTypes> = {};

    for (const rt of rotationTypes) {
      if (!byCategory[rt.category]) {
        byCategory[rt.category] = [];
      }
      byCategory[rt.category].push(rt);
    }

    return byCategory;
  },
});

/**
 * Get a rotation type by name (for matching during import)
 */
export const getByName = query({
  args: {
    healthSystemId: v.id("health_systems"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // First try exact match
    const exact = await ctx.db
      .query("rotation_types")
      .withIndex("by_name", (q) =>
        q.eq("healthSystemId", args.healthSystemId).eq("name", args.name)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (exact) return exact;

    // Try case-insensitive match
    const all = await ctx.db
      .query("rotation_types")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", args.healthSystemId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    return all.find(rt => rt.name.toLowerCase() === args.name.toLowerCase()) || null;
  },
});

/**
 * Seed default rotation types for a health system
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

    // Check if rotation types already exist for this health system
    const existing = await ctx.db
      .query("rotation_types")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", args.healthSystemId))
      .first();

    if (existing) {
      return { seeded: 0, message: "Rotation types already exist for this health system" };
    }

    let seeded = 0;
    for (const rt of DEFAULT_ROTATION_TYPES) {
      await ctx.db.insert("rotation_types", {
        healthSystemId: args.healthSystemId,
        name: rt.name,
        shortCode: rt.shortCode,
        category: rt.category,
        isCurtailable: rt.isCurtailable,
        color: rt.color,
        isActive: true,
        createdBy: currentUser._id,
        createdAt: Date.now(),
      });
      seeded++;
    }

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "SEED_ROTATION_TYPES",
      resourceType: "ROTATION_TYPE",
      changes: { healthSystemId: args.healthSystemId, count: seeded },
      timestamp: Date.now(),
    });

    return { seeded, message: `Seeded ${seeded} default rotation types` };
  },
});

/**
 * Create a new rotation type
 */
export const create = mutation({
  args: {
    healthSystemId: v.id("health_systems"),
    name: v.string(),
    shortCode: v.string(),
    category: v.string(),
    isCurtailable: v.boolean(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    // Check for duplicate name
    const existing = await ctx.db
      .query("rotation_types")
      .withIndex("by_name", (q) =>
        q.eq("healthSystemId", args.healthSystemId).eq("name", args.name)
      )
      .first();

    if (existing) {
      throw new Error(`Rotation type "${args.name}" already exists`);
    }

    const rotationTypeId = await ctx.db.insert("rotation_types", {
      healthSystemId: args.healthSystemId,
      name: args.name,
      shortCode: args.shortCode,
      category: args.category,
      isCurtailable: args.isCurtailable,
      color: args.color,
      isActive: true,
      createdBy: currentUser._id,
      createdAt: Date.now(),
    });

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "CREATE_ROTATION_TYPE",
      resourceType: "ROTATION_TYPE",
      resourceId: rotationTypeId,
      changes: { name: args.name, category: args.category },
      timestamp: Date.now(),
    });

    return { rotationTypeId };
  },
});

/**
 * Update a rotation type
 */
export const update = mutation({
  args: {
    rotationTypeId: v.id("rotation_types"),
    name: v.optional(v.string()),
    shortCode: v.optional(v.string()),
    category: v.optional(v.string()),
    isCurtailable: v.optional(v.boolean()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const rotationType = await ctx.db.get(args.rotationTypeId);
    if (!rotationType) throw new Error("Rotation type not found");

    // If changing name, check for duplicates
    if (args.name && args.name !== rotationType.name) {
      const newName = args.name;
      const existing = await ctx.db
        .query("rotation_types")
        .withIndex("by_name", (q) =>
          q.eq("healthSystemId", rotationType.healthSystemId).eq("name", newName)
        )
        .first();

      if (existing) {
        throw new Error(`Rotation type "${newName}" already exists`);
      }
    }

    const updates: Record<string, string | boolean | undefined> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.shortCode !== undefined) updates.shortCode = args.shortCode;
    if (args.category !== undefined) updates.category = args.category;
    if (args.isCurtailable !== undefined) updates.isCurtailable = args.isCurtailable;
    if (args.color !== undefined) updates.color = args.color;

    await ctx.db.patch(args.rotationTypeId, updates);

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "UPDATE_ROTATION_TYPE",
      resourceType: "ROTATION_TYPE",
      resourceId: args.rotationTypeId,
      changes: updates,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Toggle rotation type active status
 */
export const toggleActive = mutation({
  args: { rotationTypeId: v.id("rotation_types") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const rotationType = await ctx.db.get(args.rotationTypeId);
    if (!rotationType) throw new Error("Rotation type not found");

    await ctx.db.patch(args.rotationTypeId, { isActive: !rotationType.isActive });

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: rotationType.isActive ? "DEACTIVATE_ROTATION_TYPE" : "ACTIVATE_ROTATION_TYPE",
      resourceType: "ROTATION_TYPE",
      resourceId: args.rotationTypeId,
      changes: { name: rotationType.name },
      timestamp: Date.now(),
    });

    return { isActive: !rotationType.isActive };
  },
});

/**
 * Toggle isCurtailable flag
 */
export const toggleCurtailable = mutation({
  args: { rotationTypeId: v.id("rotation_types") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const rotationType = await ctx.db.get(args.rotationTypeId);
    if (!rotationType) throw new Error("Rotation type not found");

    await ctx.db.patch(args.rotationTypeId, { isCurtailable: !rotationType.isCurtailable });

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "UPDATE_ROTATION_TYPE_CURTAILABLE",
      resourceType: "ROTATION_TYPE",
      resourceId: args.rotationTypeId,
      changes: {
        name: rotationType.name,
        isCurtailable: !rotationType.isCurtailable
      },
      timestamp: Date.now(),
    });

    return { isCurtailable: !rotationType.isCurtailable };
  },
});
