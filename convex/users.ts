import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { emailSchema, optionalSafeTextSchema, validateField } from "./lib/validation";

// Super admin emails - hardcoded for bootstrap
const SUPER_ADMIN_EMAILS = [
  "notifications@providerloop.com",
  "jeffrey.bander@gmail.com",
  "jeffrey.bander@mountsinai.org",
  "glajchenemma@gmail.com",
];

/**
 * Called when a user signs in or signs up via Clerk
 * This is the ONLY way users get into the system
 */
export const syncUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user already exists by clerkId
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingUser) {
      // Only update if something actually changed (avoid OCC conflicts)
      const needsUpdate =
        existingUser.email !== args.email ||
        existingUser.firstName !== args.firstName ||
        existingUser.lastName !== args.lastName ||
        existingUser.imageUrl !== args.imageUrl;

      if (needsUpdate) {
        await ctx.db.patch(existingUser._id, {
          email: args.email,
          firstName: args.firstName,
          lastName: args.lastName,
          imageUrl: args.imageUrl,
          updatedAt: Date.now(),
        });
      }
      return { userId: existingUser._id, isNew: false, role: existingUser.role };
    }

    // New user - check if they should be super admin
    const isSuperAdmin = SUPER_ADMIN_EMAILS.some(
      (email) => email.toLowerCase() === args.email.toLowerCase()
    );

    // Check if this user was pre-invited by an admin
    if (!isSuperAdmin) {
      // Check if there's a pending user record (created when admin invited them)
      const pendingUser = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
        .first();

      if (pendingUser && !pendingUser.clerkId) {
        // This user was invited - update their record with Clerk ID
        await ctx.db.patch(pendingUser._id, {
          clerkId: args.clerkId,
          firstName: args.firstName,
          lastName: args.lastName,
          imageUrl: args.imageUrl,
          updatedAt: Date.now(),
        });
        return { userId: pendingUser._id, isNew: false, role: pendingUser.role };
      }

      // Not super admin and not invited - deny access
      throw new Error(
        "Access denied. You must be invited by an administrator to use this application."
      );
    }

    // Create new super admin user
    const userId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email.toLowerCase(),
      firstName: args.firstName,
      lastName: args.lastName,
      imageUrl: args.imageUrl,
      role: "super_admin",
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { userId, isNew: true, role: "super_admin" };
  },
});

/**
 * Get current user from Clerk ID
 */
export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    return user;
  },
});

/**
 * Get user by ID
 */
export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

/**
 * Create a new admin user (invited by existing admin)
 */
export const createAdminUser = mutation({
  args: {
    email: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    role: v.union(
      v.literal("health_system_admin"),
      v.literal("hospital_admin"),
      v.literal("departmental_admin")
    ),
    healthSystemId: v.optional(v.id("health_systems")),
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
    // Get current user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    // Validate permissions based on role hierarchy
    const canCreate = validateCanCreateUser(currentUser, args.role, args);
    if (!canCreate.allowed) {
      throw new Error(canCreate.reason);
    }

    // Check if email already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    if (existingUser) {
      throw new Error("A user with this email already exists");
    }

    // Create the user record (without clerkId - will be filled when they sign up)
    const userId = await ctx.db.insert("users", {
      clerkId: "", // Will be populated when user signs up via Clerk
      email: args.email.toLowerCase(),
      firstName: args.firstName,
      lastName: args.lastName,
      role: args.role,
      healthSystemId: args.healthSystemId,
      hospitalId: args.hospitalId,
      departmentId: args.departmentId,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Log the action
    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "CREATE_USER",
      resourceType: "USER",
      resourceId: userId,
      changes: {
        email: args.email,
        role: args.role,
      },
      timestamp: Date.now(),
    });

    return { userId, email: args.email };
  },
});

/**
 * Validate if current user can create a user with the specified role
 */
function validateCanCreateUser(
  currentUser: { role: string; healthSystemId?: string; hospitalId?: string; departmentId?: string },
  targetRole: string,
  targetScope: { healthSystemId?: string; hospitalId?: string; departmentId?: string }
): { allowed: boolean; reason: string } {
  const { role } = currentUser;

  // Super admin can create anything
  if (role === "super_admin") {
    return { allowed: true, reason: "" };
  }

  // Health system admin can create hospital admins and dept admins within their health system
  if (role === "health_system_admin") {
    if (targetRole === "health_system_admin") {
      return { allowed: false, reason: "Health system admins cannot create other health system admins" };
    }
    if (targetRole === "hospital_admin" || targetRole === "departmental_admin") {
      if (targetScope.healthSystemId !== currentUser.healthSystemId) {
        return { allowed: false, reason: "Cannot create users outside your health system" };
      }
      return { allowed: true, reason: "" };
    }
  }

  // Hospital admin can create dept admins within their hospital
  if (role === "hospital_admin") {
    if (targetRole !== "departmental_admin") {
      return { allowed: false, reason: "Hospital admins can only create departmental admins" };
    }
    if (targetScope.hospitalId !== currentUser.hospitalId) {
      return { allowed: false, reason: "Cannot create users outside your hospital" };
    }
    return { allowed: true, reason: "" };
  }

  // Departmental admin can create other dept admins in their department
  if (role === "departmental_admin") {
    if (targetRole !== "departmental_admin") {
      return { allowed: false, reason: "Departmental admins can only create other departmental admins" };
    }
    if (targetScope.departmentId !== currentUser.departmentId) {
      return { allowed: false, reason: "Cannot create users outside your department" };
    }
    return { allowed: true, reason: "" };
  }

  return { allowed: false, reason: "Unknown role" };
}

/**
 * List users based on current user's scope
 */
export const listUsers = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) return [];

    // Super admin sees all users
    if (currentUser.role === "super_admin") {
      return await ctx.db.query("users").collect();
    }

    // Health system admin sees users in their health system
    if (currentUser.role === "health_system_admin" && currentUser.healthSystemId) {
      return await ctx.db
        .query("users")
        .withIndex("by_health_system", (q) => q.eq("healthSystemId", currentUser.healthSystemId))
        .collect();
    }

    // Hospital admin sees users in their hospital
    if (currentUser.role === "hospital_admin" && currentUser.hospitalId) {
      return await ctx.db
        .query("users")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", currentUser.hospitalId))
        .collect();
    }

    // Dept admin sees users in their department
    if (currentUser.role === "departmental_admin" && currentUser.departmentId) {
      return await ctx.db
        .query("users")
        .withIndex("by_department", (q) => q.eq("departmentId", currentUser.departmentId))
        .collect();
    }

    return [];
  },
});

/**
 * Update a user's role and scope (for admin users)
 */
export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: v.optional(
      v.union(
        v.literal("health_system_admin"),
        v.literal("hospital_admin"),
        v.literal("departmental_admin")
      )
    ),
    healthSystemId: v.optional(v.id("health_systems")),
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("Target user not found");

    // Can't edit super admins
    if (targetUser.role === "super_admin") {
      throw new Error("Cannot edit super admin users");
    }

    // Validate permissions based on current user's role
    if (currentUser.role === "super_admin") {
      // Super admin can edit anyone except other super admins
    } else if (currentUser.role === "health_system_admin") {
      // Can only edit users in their health system
      if (targetUser.healthSystemId !== currentUser.healthSystemId) {
        throw new Error("Cannot edit users outside your health system");
      }
      // Can't promote to health_system_admin
      if (args.role === "health_system_admin") {
        throw new Error("Cannot promote users to health system admin");
      }
    } else if (currentUser.role === "hospital_admin") {
      // Can only edit users in their hospital
      if (targetUser.hospitalId !== currentUser.hospitalId) {
        throw new Error("Cannot edit users outside your hospital");
      }
      // Can only assign departmental_admin role
      if (args.role && args.role !== "departmental_admin") {
        throw new Error("Can only assign departmental admin role");
      }
    } else {
      throw new Error("Insufficient permissions to edit users");
    }

    // Build update object
    const updates: Record<string, any> = {
      updatedAt: Date.now(),
    };

    if (args.firstName !== undefined) updates.firstName = args.firstName;
    if (args.lastName !== undefined) updates.lastName = args.lastName;
    if (args.role !== undefined) updates.role = args.role;

    // Handle scope updates based on role
    if (args.role === "health_system_admin") {
      updates.healthSystemId = args.healthSystemId;
      updates.hospitalId = undefined;
      updates.departmentId = undefined;
    } else if (args.role === "hospital_admin") {
      // Hospital admin needs hospital and inherits health system
      if (args.hospitalId) {
        const hospital = await ctx.db.get(args.hospitalId);
        if (hospital) {
          updates.healthSystemId = hospital.healthSystemId;
          updates.hospitalId = args.hospitalId;
        }
      }
      updates.departmentId = undefined;
    } else if (args.role === "departmental_admin") {
      // Department admin needs department, inherits hospital and health system
      if (args.departmentId) {
        const department = await ctx.db.get(args.departmentId);
        if (department) {
          updates.healthSystemId = department.healthSystemId;
          updates.hospitalId = department.hospitalId;
          updates.departmentId = args.departmentId;
        }
      }
    } else {
      // If no role change but scope changes, update accordingly
      if (args.healthSystemId !== undefined) updates.healthSystemId = args.healthSystemId;
      if (args.hospitalId !== undefined) updates.hospitalId = args.hospitalId;
      if (args.departmentId !== undefined) updates.departmentId = args.departmentId;
    }

    await ctx.db.patch(args.userId, updates);

    // Log the action
    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "UPDATE_USER",
      resourceType: "USER",
      resourceId: args.userId,
      changes: updates,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Reactivate a user
 */
export const reactivateUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("Target user not found");

    // Validate scope
    if (currentUser.role === "health_system_admin") {
      if (targetUser.healthSystemId !== currentUser.healthSystemId) {
        throw new Error("Cannot reactivate users outside your health system");
      }
    } else if (currentUser.role === "hospital_admin") {
      if (targetUser.hospitalId !== currentUser.hospitalId) {
        throw new Error("Cannot reactivate users outside your hospital");
      }
    } else if (currentUser.role !== "super_admin") {
      throw new Error("Insufficient permissions");
    }

    await ctx.db.patch(args.userId, {
      isActive: true,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "REACTIVATE_USER",
      resourceType: "USER",
      resourceId: args.userId,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Deactivate a user
 */
export const deactivateUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("Target user not found");

    // Can't deactivate yourself
    if (targetUser._id === currentUser._id) {
      throw new Error("Cannot deactivate yourself");
    }

    // Can't deactivate super admin
    if (targetUser.role === "super_admin") {
      throw new Error("Cannot deactivate super admin");
    }

    // Validate scope
    if (currentUser.role === "health_system_admin") {
      if (targetUser.healthSystemId !== currentUser.healthSystemId) {
        throw new Error("Cannot deactivate users outside your health system");
      }
    } else if (currentUser.role === "hospital_admin") {
      if (targetUser.hospitalId !== currentUser.hospitalId) {
        throw new Error("Cannot deactivate users outside your hospital");
      }
    } else if (currentUser.role === "departmental_admin") {
      if (targetUser.departmentId !== currentUser.departmentId) {
        throw new Error("Cannot deactivate users outside your department");
      }
    }

    await ctx.db.patch(args.userId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("audit_logs", {
      userId: currentUser._id,
      action: "DEACTIVATE_USER",
      resourceType: "USER",
      resourceId: args.userId,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});
