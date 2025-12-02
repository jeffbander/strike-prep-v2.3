import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { checkDepartmentDependencies } from "./lib/deletion";

/**
 * List departments based on user scope
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

    if (args.hospitalId) {
      const hospitalId = args.hospitalId;
      return await ctx.db
        .query("departments")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
        .collect();
    }

    // Super admin sees all
    if (currentUser.role === "super_admin") {
      return await ctx.db.query("departments").collect();
    }

    // Health system admin sees all in their health system
    if (currentUser.role === "health_system_admin" && currentUser.healthSystemId) {
      const healthSystemId = currentUser.healthSystemId;
      return await ctx.db
        .query("departments")
        .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
        .collect();
    }

    // Hospital admin sees their hospital's departments
    if (currentUser.role === "hospital_admin" && currentUser.hospitalId) {
      const hospitalId = currentUser.hospitalId;
      return await ctx.db
        .query("departments")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
        .collect();
    }

    // Dept admin sees only their department
    if (currentUser.role === "departmental_admin" && currentUser.departmentId) {
      const dept = await ctx.db.get(currentUser.departmentId);
      return dept ? [dept] : [];
    }

    return [];
  },
});

/**
 * Get a single department
 */
export const get = query({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.departmentId);
  },
});

/**
 * Create a custom department
 */
export const create = mutation({
  args: {
    hospitalId: v.id("hospitals"),
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

    const hospital = await ctx.db.get(args.hospitalId);
    if (!hospital) throw new Error("Hospital not found");

    // Check permissions
    if (currentUser.role === "super_admin") {
      // OK
    } else if (currentUser.role === "health_system_admin") {
      if (currentUser.healthSystemId !== hospital.healthSystemId) {
        throw new Error("Cannot create departments outside your health system");
      }
    } else if (currentUser.role === "hospital_admin") {
      if (currentUser.hospitalId !== args.hospitalId) {
        throw new Error("Cannot create departments outside your hospital");
      }
    } else {
      throw new Error("Insufficient permissions");
    }

    const departmentId = await ctx.db.insert("departments", {
      hospitalId: args.hospitalId,
      healthSystemId: hospital.healthSystemId,
      name: args.name,
      isDefault: false,
      isActive: true,
    });

    return { departmentId };
  },
});

/**
 * Toggle department active status with cascade to services and positions
 */
export const toggleActive = mutation({
  args: {
    departmentId: v.id("departments"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const department = await ctx.db.get(args.departmentId);
    if (!department) throw new Error("Department not found");

    // Check permissions
    if (currentUser.role === "super_admin") {
      // OK
    } else if (currentUser.role === "health_system_admin") {
      if (currentUser.healthSystemId !== department.healthSystemId) {
        throw new Error("Cannot modify departments outside your health system");
      }
    } else if (currentUser.role === "hospital_admin") {
      if (currentUser.hospitalId !== department.hospitalId) {
        throw new Error("Cannot modify departments outside your hospital");
      }
    } else {
      throw new Error("Insufficient permissions");
    }

    const newStatus = !department.isActive;
    let cascadeResult: Record<string, number> | undefined;

    // If deactivating, cascade to all child entities
    if (!newStatus) {
      // Use cascade function to deactivate all related entities
      const { cascadeDeactivateDepartment } = await import("./lib/cascade");
      const result = await cascadeDeactivateDepartment(ctx, args.departmentId);
      cascadeResult = result.affected;
    }

    await ctx.db.patch(args.departmentId, { isActive: newStatus });

    // Log the action
    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: newStatus ? "ACTIVATE_DEPARTMENT" : "DEACTIVATE_DEPARTMENT",
      resourceType: "DEPARTMENT",
      resourceId: args.departmentId,
      changes: {
        name: department.name,
        cascaded: !newStatus,
        ...(cascadeResult && { affected: cascadeResult }),
      },
      timestamp: Date.now(),
    });

    return { isActive: newStatus, cascadeResult };
  },
});

/**
 * Check if a department can be safely deleted
 */
export const canDelete = query({
  args: { departmentId: v.id("departments") },
  handler: async (ctx, args) => {
    return await checkDepartmentDependencies(ctx, args.departmentId);
  },
});
