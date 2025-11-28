import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Check if a health system can be deleted
 * Returns dependencies that would prevent deletion
 */
export async function checkHealthSystemDependencies(
  ctx: QueryCtx,
  healthSystemId: Id<"health_systems">
): Promise<{
  canDelete: boolean;
  dependencies: {
    hospitals: number;
    departments: number;
    services: number;
    providers: number;
    activeAssignments: number;
  };
}> {
  const hospitals = await ctx.db
    .query("hospitals")
    .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
    .collect();

  const departments = await ctx.db
    .query("departments")
    .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
    .collect();

  const services = await ctx.db
    .query("services")
    .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
    .collect();

  const providers = await ctx.db
    .query("providers")
    .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
    .collect();

  // Check for active assignments by getting all positions in this health system
  let activeAssignments = 0;
  for (const service of services) {
    const positions = await ctx.db
      .query("job_positions")
      .withIndex("by_service", (q) => q.eq("serviceId", service._id))
      .collect();

    for (const pos of positions) {
      const assignments = await ctx.db
        .query("assignments")
        .withIndex("by_job_position", (q) => q.eq("jobPositionId", pos._id))
        .filter((q) =>
          q.or(q.eq(q.field("status"), "Active"), q.eq(q.field("status"), "Confirmed"))
        )
        .collect();
      activeAssignments += assignments.length;
    }
  }

  const dependencies = {
    hospitals: hospitals.length,
    departments: departments.length,
    services: services.length,
    providers: providers.length,
    activeAssignments,
  };

  const canDelete =
    hospitals.length === 0 &&
    departments.length === 0 &&
    services.length === 0 &&
    providers.length === 0 &&
    activeAssignments === 0;

  return { canDelete, dependencies };
}

/**
 * Check if a hospital can be deleted
 */
export async function checkHospitalDependencies(
  ctx: QueryCtx,
  hospitalId: Id<"hospitals">
): Promise<{
  canDelete: boolean;
  dependencies: {
    departments: number;
    services: number;
    providers: number;
    openPositions: number;
    activeAssignments: number;
  };
}> {
  const departments = await ctx.db
    .query("departments")
    .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
    .collect();

  const services = await ctx.db
    .query("services")
    .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
    .collect();

  const providers = await ctx.db
    .query("providers")
    .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
    .collect();

  const positions = await ctx.db
    .query("job_positions")
    .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
    .collect();

  const openPositions = positions.filter((p) => p.status === "Open").length;

  let activeAssignments = 0;
  for (const pos of positions) {
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_job_position", (q) => q.eq("jobPositionId", pos._id))
      .filter((q) =>
        q.or(q.eq(q.field("status"), "Active"), q.eq(q.field("status"), "Confirmed"))
      )
      .collect();
    activeAssignments += assignments.length;
  }

  const dependencies = {
    departments: departments.length,
    services: services.length,
    providers: providers.length,
    openPositions,
    activeAssignments,
  };

  // Can only delete if no active assignments (departments/services/positions can be cascaded)
  const canDelete = activeAssignments === 0;

  return { canDelete, dependencies };
}

/**
 * Check if a department can be deleted
 */
export async function checkDepartmentDependencies(
  ctx: QueryCtx,
  departmentId: Id<"departments">
): Promise<{
  canDelete: boolean;
  dependencies: {
    services: number;
    providers: number;
    openPositions: number;
    activeAssignments: number;
  };
}> {
  const services = await ctx.db
    .query("services")
    .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
    .collect();

  const providers = await ctx.db
    .query("providers")
    .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
    .collect();

  const positions = await ctx.db
    .query("job_positions")
    .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
    .collect();

  const openPositions = positions.filter((p) => p.status === "Open").length;

  let activeAssignments = 0;
  for (const pos of positions) {
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_job_position", (q) => q.eq("jobPositionId", pos._id))
      .filter((q) =>
        q.or(q.eq(q.field("status"), "Active"), q.eq(q.field("status"), "Confirmed"))
      )
      .collect();
    activeAssignments += assignments.length;
  }

  const dependencies = {
    services: services.length,
    providers: providers.length,
    openPositions,
    activeAssignments,
  };

  const canDelete = activeAssignments === 0;

  return { canDelete, dependencies };
}

/**
 * Check if a service can be deleted
 */
export async function checkServiceDependencies(
  ctx: QueryCtx,
  serviceId: Id<"services">
): Promise<{
  canDelete: boolean;
  dependencies: {
    positions: number;
    openPositions: number;
    activeAssignments: number;
  };
}> {
  const positions = await ctx.db
    .query("job_positions")
    .withIndex("by_service", (q) => q.eq("serviceId", serviceId))
    .collect();

  const openPositions = positions.filter((p) => p.status === "Open").length;

  let activeAssignments = 0;
  for (const pos of positions) {
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_job_position", (q) => q.eq("jobPositionId", pos._id))
      .filter((q) =>
        q.or(q.eq(q.field("status"), "Active"), q.eq(q.field("status"), "Confirmed"))
      )
      .collect();
    activeAssignments += assignments.length;
  }

  const dependencies = {
    positions: positions.length,
    openPositions,
    activeAssignments,
  };

  const canDelete = activeAssignments === 0;

  return { canDelete, dependencies };
}

/**
 * Check if a provider can be deleted
 */
export async function checkProviderDependencies(
  ctx: QueryCtx,
  providerId: Id<"providers">
): Promise<{
  canDelete: boolean;
  dependencies: {
    activeAssignments: number;
    totalAssignments: number;
  };
}> {
  const assignments = await ctx.db
    .query("assignments")
    .withIndex("by_provider", (q) => q.eq("providerId", providerId))
    .collect();

  const activeAssignments = assignments.filter(
    (a) => a.status === "Active" || a.status === "Confirmed"
  ).length;

  const dependencies = {
    activeAssignments,
    totalAssignments: assignments.length,
  };

  const canDelete = activeAssignments === 0;

  return { canDelete, dependencies };
}
