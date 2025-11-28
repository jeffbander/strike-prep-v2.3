import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireHospitalAccess, auditLog } from "./lib/auth";

/**
 * List units for a hospital
 */
export const list = query({
  args: {
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

    // Determine which hospital(s) to query
    let hospitalId = args.hospitalId;

    if (!hospitalId) {
      // Use user's hospital if they have one
      if (currentUser.hospitalId) {
        hospitalId = currentUser.hospitalId;
      } else if (currentUser.role === "super_admin" || currentUser.role === "health_system_admin") {
        // Return all units for the health system
        if (currentUser.healthSystemId) {
          const hospitals = await ctx.db
            .query("hospitals")
            .withIndex("by_health_system", (q) => q.eq("healthSystemId", currentUser.healthSystemId!))
            .collect();

          const allUnits = [];
          for (const hospital of hospitals) {
            const units = await ctx.db
              .query("units")
              .withIndex("by_hospital", (q) => q.eq("hospitalId", hospital._id))
              .collect();
            allUnits.push(...units.map((u) => ({ ...u, hospitalName: hospital.name })));
          }
          return allUnits;
        }
        return [];
      } else {
        return [];
      }
    }

    const units = await ctx.db
      .query("units")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId!))
      .collect();

    const hospital = await ctx.db.get(hospitalId);

    return units.map((u) => ({ ...u, hospitalName: hospital?.name }));
  },
});

/**
 * Get a single unit
 */
export const get = query({
  args: { unitId: v.id("units") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.unitId);
  },
});

/**
 * Create a new unit
 */
export const create = mutation({
  args: {
    hospitalId: v.id("hospitals"),
    name: v.string(),
    description: v.optional(v.string()),
    floorNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireHospitalAccess(ctx, args.hospitalId);

    // Check for duplicate name within hospital
    const existing = await ctx.db
      .query("units")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();

    if (existing) {
      throw new Error("A unit with this name already exists in this hospital");
    }

    const unitId = await ctx.db.insert("units", {
      hospitalId: args.hospitalId,
      name: args.name,
      description: args.description,
      floorNumber: args.floorNumber,
      createdBy: user._id,
      isActive: true,
      createdAt: Date.now(),
    });

    await auditLog(ctx, user, "CREATE", "UNIT", unitId, {
      name: args.name,
      hospitalId: args.hospitalId,
    });

    return { unitId };
  },
});

/**
 * Update a unit
 */
export const update = mutation({
  args: {
    unitId: v.id("units"),
    name: v.string(),
    description: v.optional(v.string()),
    floorNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const unit = await ctx.db.get(args.unitId);
    if (!unit) throw new Error("Unit not found");

    const user = await requireHospitalAccess(ctx, unit.hospitalId);

    await ctx.db.patch(args.unitId, {
      name: args.name,
      description: args.description,
      floorNumber: args.floorNumber,
    });

    await auditLog(ctx, user, "UPDATE", "UNIT", args.unitId, {
      name: args.name,
    });

    return { success: true };
  },
});

/**
 * Toggle unit active status
 */
export const toggleActive = mutation({
  args: { unitId: v.id("units") },
  handler: async (ctx, args) => {
    const unit = await ctx.db.get(args.unitId);
    if (!unit) throw new Error("Unit not found");

    const user = await requireHospitalAccess(ctx, unit.hospitalId);

    const newStatus = !unit.isActive;
    await ctx.db.patch(args.unitId, { isActive: newStatus });

    await auditLog(
      ctx,
      user,
      newStatus ? "ACTIVATE" : "DEACTIVATE",
      "UNIT",
      args.unitId,
      { name: unit.name }
    );

    return { isActive: newStatus };
  },
});
