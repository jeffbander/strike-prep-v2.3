import { MutationCtx, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

export type UserRole =
  | "super_admin"
  | "health_system_admin"
  | "hospital_admin"
  | "departmental_admin";

export interface AuthenticatedUser {
  _id: Id<"users">;
  clerkId: string;
  email: string;
  role: UserRole;
  healthSystemId?: Id<"health_systems">;
  hospitalId?: Id<"hospitals">;
  departmentId?: Id<"departments">;
}

/**
 * Require authentication and return the current user
 */
export async function requireAuth(
  ctx: MutationCtx | QueryCtx
): Promise<AuthenticatedUser> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: Please sign in");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();

  if (!user) {
    throw new Error("User not found in database");
  }

  if (!user.isActive) {
    throw new Error("Your account has been deactivated");
  }

  return {
    _id: user._id,
    clerkId: user.clerkId,
    email: user.email,
    role: user.role as UserRole,
    healthSystemId: user.healthSystemId,
    hospitalId: user.hospitalId,
    departmentId: user.departmentId,
  };
}

/**
 * Require a specific role or higher
 */
export async function requireRole(
  ctx: MutationCtx | QueryCtx,
  allowedRoles: UserRole[]
): Promise<AuthenticatedUser> {
  const user = await requireAuth(ctx);

  if (!allowedRoles.includes(user.role)) {
    throw new Error(
      `Unauthorized: Requires ${allowedRoles.join(" or ")} role`
    );
  }

  return user;
}

/**
 * Require access to a specific health system
 */
export async function requireHealthSystemAccess(
  ctx: MutationCtx | QueryCtx,
  healthSystemId: Id<"health_systems">
): Promise<AuthenticatedUser> {
  const user = await requireAuth(ctx);

  // Super admin can access all
  if (user.role === "super_admin") return user;

  // Others must match health system
  if (user.healthSystemId !== healthSystemId) {
    throw new Error("Unauthorized: Access denied to this health system");
  }

  return user;
}

/**
 * Require access to a specific hospital
 */
export async function requireHospitalAccess(
  ctx: MutationCtx | QueryCtx,
  hospitalId: Id<"hospitals">
): Promise<AuthenticatedUser> {
  const user = await requireAuth(ctx);

  if (user.role === "super_admin") return user;

  // Get hospital to check health system
  const hospital = await ctx.db.get(hospitalId);
  if (!hospital) throw new Error("Hospital not found");

  if (user.role === "health_system_admin") {
    if (user.healthSystemId !== hospital.healthSystemId) {
      throw new Error("Unauthorized: Hospital outside your health system");
    }
    return user;
  }

  // Hospital admin or dept admin must match hospital
  if (user.hospitalId !== hospitalId) {
    throw new Error("Unauthorized: Access denied to this hospital");
  }

  return user;
}

/**
 * Require access to a specific department
 */
export async function requireDepartmentAccess(
  ctx: MutationCtx | QueryCtx,
  departmentId: Id<"departments">
): Promise<AuthenticatedUser> {
  const user = await requireAuth(ctx);

  if (user.role === "super_admin") return user;

  const dept = await ctx.db.get(departmentId);
  if (!dept) throw new Error("Department not found");

  if (user.role === "health_system_admin") {
    if (user.healthSystemId !== dept.healthSystemId) {
      throw new Error("Unauthorized: Department outside your health system");
    }
    return user;
  }

  if (user.role === "hospital_admin") {
    if (user.hospitalId !== dept.hospitalId) {
      throw new Error("Unauthorized: Department outside your hospital");
    }
    return user;
  }

  // Dept admin must match department
  if (user.departmentId !== departmentId) {
    throw new Error("Unauthorized: Access denied to this department");
  }

  return user;
}

/**
 * Audit log helper
 */
export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "ASSIGN"
  | "UNASSIGN"
  | "EXPORT"
  | "BULK_UPLOAD"
  | "BULK_UPDATE"
  | "BULK_IMPORT"
  | "DEACTIVATE"
  | "ACTIVATE"
  | "COMPLETE"
  | "CANCEL"
  | "REGENERATE"
  | "CLEAR";

export type ResourceType =
  | "HEALTH_SYSTEM"
  | "HOSPITAL"
  | "DEPARTMENT"
  | "UNIT"
  | "SERVICE"
  | "SHIFT"
  | "JOB_POSITION"
  | "PROVIDER"
  | "ASSIGNMENT"
  | "USER"
  | "JOB_TYPE"
  | "SKILL"
  | "STRIKE_SCENARIO"
  | "SCENARIO_POSITION"
  | "SCENARIO_ASSIGNMENT"
  | "PROVIDER_AVAILABILITY"
  | "LABOR_POOL"
  | "CLAIM_TOKEN"
  | "PROCEDURE_IMPORT";

export async function auditLog(
  ctx: MutationCtx,
  user: AuthenticatedUser,
  action: AuditAction,
  resourceType: ResourceType,
  resourceId: string | null,
  changes?: Record<string, unknown>
): Promise<void> {
  await ctx.db.insert("audit_logs", {
    userId: user._id,
    action,
    resourceType,
    resourceId: resourceId || undefined,
    changes: changes || undefined,
    timestamp: Date.now(),
  });
}
