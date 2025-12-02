import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Cascade deactivation functions
 * When deactivating a parent entity, all child entities should also be deactivated
 *
 * Note: Admin users are stored in the `users` table with role-based access.
 * We deactivate users who are scoped to the deactivated entity.
 */

// When deactivating a health system
export async function cascadeDeactivateHealthSystem(
  ctx: MutationCtx,
  healthSystemId: Id<"health_systems">
): Promise<{ affected: Record<string, number> }> {
  const affected = {
    hospitals: 0,
    departments: 0,
    services: 0,
    jobPositions: 0,
    users: 0,
  };

  // Deactivate users scoped to this health system
  const hsUsers = await ctx.db
    .query("users")
    .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
    .collect();

  for (const user of hsUsers) {
    await ctx.db.patch(user._id, { isActive: false });
    affected.users++;
  }

  // Deactivate hospitals and cascade
  const hospitals = await ctx.db
    .query("hospitals")
    .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
    .collect();

  for (const hospital of hospitals) {
    await ctx.db.patch(hospital._id, { isActive: false });
    affected.hospitals++;

    // Use hospital cascade function
    const hospitalAffected = await cascadeDeactivateHospital(ctx, hospital._id);
    affected.departments += hospitalAffected.affected.departments;
    affected.services += hospitalAffected.affected.services;
    affected.jobPositions += hospitalAffected.affected.jobPositions;
    affected.users += hospitalAffected.affected.users;
  }

  return { affected };
}

// When deactivating a hospital
export async function cascadeDeactivateHospital(
  ctx: MutationCtx,
  hospitalId: Id<"hospitals">
): Promise<{ affected: Record<string, number> }> {
  const affected = {
    departments: 0,
    services: 0,
    jobPositions: 0,
    users: 0,
  };

  // Deactivate departments
  const departments = await ctx.db
    .query("departments")
    .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
    .collect();

  for (const dept of departments) {
    await ctx.db.patch(dept._id, { isActive: false });
    affected.departments++;

    // Cascade to department
    const deptAffected = await cascadeDeactivateDepartment(ctx, dept._id);
    affected.services += deptAffected.affected.services;
    affected.jobPositions += deptAffected.affected.jobPositions;
    affected.users += deptAffected.affected.users;
  }

  // Deactivate users scoped to this hospital
  const hospitalUsers = await ctx.db
    .query("users")
    .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
    .collect();

  for (const user of hospitalUsers) {
    await ctx.db.patch(user._id, { isActive: false });
    affected.users++;
  }

  return { affected };
}

// When deactivating a department
export async function cascadeDeactivateDepartment(
  ctx: MutationCtx,
  departmentId: Id<"departments">
): Promise<{ affected: Record<string, number> }> {
  const affected = {
    services: 0,
    jobPositions: 0,
    users: 0,
  };

  // Deactivate services
  const services = await ctx.db
    .query("services")
    .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
    .collect();

  for (const service of services) {
    await ctx.db.patch(service._id, { isActive: false });
    affected.services++;

    // Cancel open job positions
    const positions = await ctx.db
      .query("job_positions")
      .withIndex("by_service", (q) => q.eq("serviceId", service._id))
      .filter((q) => q.eq(q.field("status"), "Open"))
      .collect();

    for (const pos of positions) {
      await ctx.db.patch(pos._id, { status: "Cancelled", isActive: false });
      affected.jobPositions++;
    }
  }

  // Deactivate users scoped to this department
  const deptUsers = await ctx.db
    .query("users")
    .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
    .collect();

  for (const user of deptUsers) {
    await ctx.db.patch(user._id, { isActive: false });
    affected.users++;
  }

  return { affected };
}

// When deactivating a service
export async function cascadeDeactivateService(
  ctx: MutationCtx,
  serviceId: Id<"services">
): Promise<{ affected: Record<string, number> }> {
  const affected = {
    jobPositions: 0,
    shifts: 0,
  };

  // Cancel open job positions
  const positions = await ctx.db
    .query("job_positions")
    .withIndex("by_service", (q) => q.eq("serviceId", serviceId))
    .filter((q) => q.eq(q.field("status"), "Open"))
    .collect();

  for (const pos of positions) {
    await ctx.db.patch(pos._id, { status: "Cancelled", isActive: false });
    affected.jobPositions++;
  }

  // Deactivate shifts
  const shifts = await ctx.db
    .query("shifts")
    .withIndex("by_service", (q) => q.eq("serviceId", serviceId))
    .collect();

  for (const shift of shifts) {
    await ctx.db.patch(shift._id, { isActive: false });
    affected.shifts++;
  }

  return { affected };
}
