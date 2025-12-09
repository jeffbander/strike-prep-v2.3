import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { checkHospitalDependencies } from "./lib/deletion";

// Default departments to create for each hospital
const DEFAULT_DEPARTMENTS = [
  "Cardiology",
  "Neurosurgery",
  "Orthopedics",
  "General Surgery",
  "Emergency Medicine",
  "Internal Medicine",
  "ICU / Critical Care",
  "Pediatrics",
  "OB/GYN",
  "Psychiatry",
  "Radiology",
  "Anesthesiology",
  "Oncology",
  "Urology",
  "Dermatology",
  "Pulmonology",
  "Gastroenterology",
  "Nephrology",
  "Endocrinology",
  "Rheumatology",
];

/**
 * Create a new hospital with 20 default departments
 */
export const create = mutation({
  args: {
    healthSystemId: v.id("health_systems"),
    name: v.string(),
    shortCode: v.string(),
    timezone: v.string(),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    // Check permissions
    if (currentUser.role === "super_admin") {
      // OK
    } else if (currentUser.role === "health_system_admin") {
      if (currentUser.healthSystemId !== args.healthSystemId) {
        throw new Error("Cannot create hospitals outside your health system");
      }
    } else {
      throw new Error("Only Super Admins and Health System Admins can create hospitals");
    }

    // Check shortCode is unique within health system
    const existing = await ctx.db
      .query("hospitals")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", args.healthSystemId))
      .filter((q) => q.eq(q.field("shortCode"), args.shortCode.toUpperCase()))
      .first();

    if (existing) {
      throw new Error("A hospital with this short code already exists in this health system");
    }

    // Create hospital
    const hospitalId = await ctx.db.insert("hospitals", {
      healthSystemId: args.healthSystemId,
      name: args.name,
      shortCode: args.shortCode.toUpperCase(),
      timezone: args.timezone,
      address: args.address,
      city: args.city,
      state: args.state,
      zipCode: args.zipCode,
      createdBy: currentUser._id,
      isActive: true,
      createdAt: Date.now(),
    });

    // Create 20 default departments
    for (const deptName of DEFAULT_DEPARTMENTS) {
      await ctx.db.insert("departments", {
        hospitalId,
        healthSystemId: args.healthSystemId,
        name: deptName,
        isDefault: true,
        isActive: true,
      });
    }

    // Log the action
    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "CREATE_HOSPITAL",
      resourceType: "HOSPITAL",
      resourceId: hospitalId,
      changes: { name: args.name, shortCode: args.shortCode, departmentsCreated: 20 },
      timestamp: Date.now(),
    });

    return { hospitalId, departmentsCreated: DEFAULT_DEPARTMENTS.length };
  },
});

/**
 * List hospitals based on user scope
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

    // Super admin can see all or filter by health system
    if (currentUser.role === "super_admin") {
      if (args.healthSystemId) {
        const healthSystemId = args.healthSystemId;
        return await ctx.db
          .query("hospitals")
          .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
          .collect();
      }
      return await ctx.db.query("hospitals").collect();
    }

    // Health system admin sees hospitals in their health system
    if (currentUser.role === "health_system_admin" && currentUser.healthSystemId) {
      const healthSystemId = currentUser.healthSystemId;
      return await ctx.db
        .query("hospitals")
        .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
        .collect();
    }

    // Hospital admin sees only their hospital
    if (currentUser.role === "hospital_admin" && currentUser.hospitalId) {
      const hospital = await ctx.db.get(currentUser.hospitalId);
      return hospital ? [hospital] : [];
    }

    // Dept admin sees their hospital
    if (currentUser.role === "departmental_admin" && currentUser.hospitalId) {
      const hospital = await ctx.db.get(currentUser.hospitalId);
      return hospital ? [hospital] : [];
    }

    return [];
  },
});

/**
 * Get a single hospital by ID
 */
export const get = query({
  args: { hospitalId: v.id("hospitals") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.hospitalId);
  },
});

/**
 * Get a single hospital with its departments
 */
export const getWithDepartments = query({
  args: { hospitalId: v.id("hospitals") },
  handler: async (ctx, args) => {
    const hospital = await ctx.db.get(args.hospitalId);
    if (!hospital) return null;

    const departments = await ctx.db
      .query("departments")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
      .collect();

    return { ...hospital, departments };
  },
});

/**
 * Update a hospital
 */
export const update = mutation({
  args: {
    hospitalId: v.id("hospitals"),
    name: v.string(),
    shortCode: v.string(),
    timezone: v.string(),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const hospital = await ctx.db.get(args.hospitalId);
    if (!hospital) throw new Error("Hospital not found");

    // Check permissions
    if (currentUser.role === "super_admin") {
      // OK
    } else if (currentUser.role === "health_system_admin") {
      if (currentUser.healthSystemId !== hospital.healthSystemId) {
        throw new Error("Cannot update hospitals outside your health system");
      }
    } else {
      throw new Error("Insufficient permissions");
    }

    await ctx.db.patch(args.hospitalId, {
      name: args.name,
      shortCode: args.shortCode.toUpperCase(),
      timezone: args.timezone,
      address: args.address,
      city: args.city,
      state: args.state,
      zipCode: args.zipCode,
    });

    return { success: true };
  },
});

/**
 * Toggle hospital active status with cascade to departments, services, and positions
 */
export const toggleActive = mutation({
  args: { hospitalId: v.id("hospitals") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const hospital = await ctx.db.get(args.hospitalId);
    if (!hospital) throw new Error("Hospital not found");

    // Check permissions
    if (currentUser.role === "super_admin") {
      // OK
    } else if (currentUser.role === "health_system_admin") {
      if (currentUser.healthSystemId !== hospital.healthSystemId) {
        throw new Error("Cannot modify hospitals outside your health system");
      }
    } else {
      throw new Error("Insufficient permissions");
    }

    const newStatus = !hospital.isActive;
    let cascadeResult: Record<string, number> | undefined;

    // If deactivating, cascade to all child entities
    if (!newStatus) {
      // Use cascade function to deactivate all related entities
      const { cascadeDeactivateHospital } = await import("./lib/cascade");
      const result = await cascadeDeactivateHospital(ctx, args.hospitalId);
      cascadeResult = result.affected;

      // Also deactivate units (not handled by cascade function)
      const units = await ctx.db
        .query("units")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
        .collect();

      for (const unit of units) {
        await ctx.db.patch(unit._id, { isActive: false });
      }
    }

    await ctx.db.patch(args.hospitalId, { isActive: newStatus });

    // Log the action
    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: newStatus ? "ACTIVATE_HOSPITAL" : "DEACTIVATE_HOSPITAL",
      resourceType: "HOSPITAL",
      resourceId: args.hospitalId,
      changes: {
        name: hospital.name,
        cascaded: !newStatus,
        ...(cascadeResult && { affected: cascadeResult }),
      },
      timestamp: Date.now(),
    });

    return { isActive: newStatus, cascadeResult };
  },
});

/**
 * Check if a hospital can be safely deleted
 */
export const canDelete = query({
  args: { hospitalId: v.id("hospitals") },
  handler: async (ctx, args) => {
    return await checkHospitalDependencies(ctx, args.hospitalId);
  },
});
