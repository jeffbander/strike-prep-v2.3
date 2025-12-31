import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Amion Schedule Backend
 *
 * Handles importing, querying, and managing Amion schedule data:
 * - Import parsed schedule with services and assignments
 * - Query schedule grid by date range
 * - Update service redeployment status
 * - Link Amion staff to system providers
 */

// ═══════════════════════════════════════════════════════════════════
// IMPORT OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Import a parsed Amion schedule file
 * Creates import record, services, and assignments
 */
export const importAmionSchedule = mutation({
  args: {
    healthSystemId: v.id("health_systems"),
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),
    department: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    sourceFileName: v.optional(v.string()),
    services: v.array(
      v.object({
        name: v.string(),
        amionId: v.number(),
        shiftDisplay: v.optional(v.string()),
      })
    ),
    assignments: v.array(
      v.object({
        serviceName: v.string(),
        serviceAmionId: v.number(),
        providerName: v.string(),
        providerAmionId: v.number(),
        date: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get user from Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // Create import record
    const importId = await ctx.db.insert("amion_imports", {
      healthSystemId: args.healthSystemId,
      hospitalId: args.hospitalId,
      departmentId: args.departmentId,
      department: args.department,
      startDate: args.startDate,
      endDate: args.endDate,
      importedAt: Date.now(),
      importedBy: user._id,
      sourceFileName: args.sourceFileName,
      isActive: true,
    });

    // Create service records with amionId -> serviceId mapping
    const serviceIdMap = new Map<number, Id<"amion_services">>();

    for (const service of args.services) {
      const serviceId = await ctx.db.insert("amion_services", {
        amionImportId: importId,
        name: service.name,
        amionId: service.amionId,
        shiftDisplay: service.shiftDisplay,
        redeploymentStatus: "unclassified",
        isActive: true,
      });
      serviceIdMap.set(service.amionId, serviceId);
    }

    // Create assignment records
    for (const assignment of args.assignments) {
      const serviceId = serviceIdMap.get(assignment.serviceAmionId);
      if (!serviceId) continue; // Skip if service not found

      await ctx.db.insert("amion_assignments", {
        amionImportId: importId,
        amionServiceId: serviceId,
        providerName: assignment.providerName,
        providerAmionId: assignment.providerAmionId,
        date: assignment.date,
        isActive: true,
      });
    }

    return {
      importId,
      servicesCreated: args.services.length,
      assignmentsCreated: args.assignments.length,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// QUERY OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * List all Amion imports for a health system
 */
export const listImports = query({
  args: {
    healthSystemId: v.id("health_systems"),
  },
  handler: async (ctx, args) => {
    const imports = await ctx.db
      .query("amion_imports")
      .withIndex("by_health_system", (q) =>
        q.eq("healthSystemId", args.healthSystemId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .order("desc")
      .collect();

    // Get importer names
    const importerIds = [...new Set(imports.map((i) => i.importedBy))];
    const importers = await Promise.all(
      importerIds.map((id) => ctx.db.get(id))
    );
    const importerMap = new Map(
      importers.filter(Boolean).map((u) => [u!._id, u])
    );

    return imports.map((imp) => {
      const importer = importerMap.get(imp.importedBy);
      return {
        ...imp,
        importerName: importer
          ? `${importer.firstName || ""} ${importer.lastName || ""}`.trim()
          : "Unknown",
      };
    });
  },
});

/**
 * Get a specific import with its services
 */
export const getImportWithServices = query({
  args: {
    importId: v.id("amion_imports"),
  },
  handler: async (ctx, args) => {
    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) return null;

    const services = await ctx.db
      .query("amion_services")
      .withIndex("by_import", (q) => q.eq("amionImportId", args.importId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    return {
      import: importRecord,
      services,
    };
  },
});

/**
 * Get schedule grid for an import
 * Returns services as rows, dates as columns, with provider assignments
 */
export const getScheduleGrid = query({
  args: {
    importId: v.id("amion_imports"),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) return null;

    // Get all services for this import
    const services = await ctx.db
      .query("amion_services")
      .withIndex("by_import", (q) => q.eq("amionImportId", args.importId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Get all assignments for this import
    let assignments = await ctx.db
      .query("amion_assignments")
      .withIndex("by_import", (q) => q.eq("amionImportId", args.importId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Filter by date range if specified
    if (args.startDate) {
      assignments = assignments.filter((a) => a.date >= args.startDate!);
    }
    if (args.endDate) {
      assignments = assignments.filter((a) => a.date <= args.endDate!);
    }

    // Get unique dates
    const dates = [...new Set(assignments.map((a) => a.date))].sort();

    // Build grid: service -> date -> assignment
    const grid: Record<
      string,
      {
        service: typeof services[0];
        assignments: Record<string, typeof assignments[0] | null>;
      }
    > = {};

    for (const service of services) {
      grid[service._id] = {
        service,
        assignments: {},
      };
      // Initialize all dates to null
      for (const date of dates) {
        grid[service._id].assignments[date] = null;
      }
    }

    // Fill in assignments
    for (const assignment of assignments) {
      const serviceId = assignment.amionServiceId;
      if (grid[serviceId]) {
        grid[serviceId].assignments[assignment.date] = assignment;
      }
    }

    return {
      import: importRecord,
      dates,
      services: Object.values(grid),
    };
  },
});

/**
 * Get all assignments for a specific provider (by Amion ID)
 */
export const getProviderSchedule = query({
  args: {
    importId: v.id("amion_imports"),
    providerAmionId: v.number(),
  },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("amion_assignments")
      .withIndex("by_import", (q) => q.eq("amionImportId", args.importId))
      .filter((q) =>
        q.and(
          q.eq(q.field("providerAmionId"), args.providerAmionId),
          q.eq(q.field("isActive"), true)
        )
      )
      .collect();

    // Get service details
    const serviceIds = [...new Set(assignments.map((a) => a.amionServiceId))];
    const services = await Promise.all(
      serviceIds.map((id) => ctx.db.get(id))
    );
    const serviceMap = new Map(
      services.filter(Boolean).map((s) => [s!._id, s])
    );

    return assignments.map((a) => ({
      ...a,
      service: serviceMap.get(a.amionServiceId),
    }));
  },
});

/**
 * Get assignments for a date range across all services
 */
export const getAssignmentsByDateRange = query({
  args: {
    importId: v.id("amion_imports"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("amion_assignments")
      .withIndex("by_import", (q) => q.eq("amionImportId", args.importId))
      .filter((q) =>
        q.and(
          q.gte(q.field("date"), args.startDate),
          q.lte(q.field("date"), args.endDate),
          q.eq(q.field("isActive"), true)
        )
      )
      .collect();

    return assignments;
  },
});

// ═══════════════════════════════════════════════════════════════════
// UPDATE OPERATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Update service redeployment status
 */
export const updateServiceStatus = mutation({
  args: {
    serviceId: v.id("amion_services"),
    redeploymentStatus: v.string(), // "redeployable" | "essential" | "unclassified"
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(args.serviceId, {
      redeploymentStatus: args.redeploymentStatus,
    });

    return { success: true };
  },
});

/**
 * Bulk update service statuses
 */
export const bulkUpdateServiceStatus = mutation({
  args: {
    serviceIds: v.array(v.id("amion_services")),
    redeploymentStatus: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    for (const serviceId of args.serviceIds) {
      await ctx.db.patch(serviceId, {
        redeploymentStatus: args.redeploymentStatus,
      });
    }

    return { updated: args.serviceIds.length };
  },
});

/**
 * Link an Amion assignment to a system provider
 */
export const linkAssignmentToProvider = mutation({
  args: {
    assignmentId: v.id("amion_assignments"),
    providerId: v.id("providers"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(args.assignmentId, {
      providerId: args.providerId,
    });

    return { success: true };
  },
});

/**
 * Delete an import and all related data
 */
export const deleteImport = mutation({
  args: {
    importId: v.id("amion_imports"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Soft delete: mark as inactive
    await ctx.db.patch(args.importId, { isActive: false });

    // Also deactivate all related services and assignments
    const services = await ctx.db
      .query("amion_services")
      .withIndex("by_import", (q) => q.eq("amionImportId", args.importId))
      .collect();

    for (const service of services) {
      await ctx.db.patch(service._id, { isActive: false });
    }

    const assignments = await ctx.db
      .query("amion_assignments")
      .withIndex("by_import", (q) => q.eq("amionImportId", args.importId))
      .collect();

    for (const assignment of assignments) {
      await ctx.db.patch(assignment._id, { isActive: false });
    }

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get import statistics
 */
export const getImportStats = query({
  args: {
    importId: v.id("amion_imports"),
  },
  handler: async (ctx, args) => {
    const services = await ctx.db
      .query("amion_services")
      .withIndex("by_import", (q) => q.eq("amionImportId", args.importId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const assignments = await ctx.db
      .query("amion_assignments")
      .withIndex("by_import", (q) => q.eq("amionImportId", args.importId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Count by redeployment status
    const byStatus = {
      redeployable: services.filter((s) => s.redeploymentStatus === "redeployable").length,
      essential: services.filter((s) => s.redeploymentStatus === "essential").length,
      unclassified: services.filter((s) => s.redeploymentStatus === "unclassified").length,
    };

    // Unique providers
    const uniqueProviders = new Set(assignments.map((a) => a.providerAmionId)).size;

    // Date range
    const dates = assignments.map((a) => a.date).sort();
    const dateRange = dates.length > 0 ? { start: dates[0], end: dates[dates.length - 1] } : null;

    return {
      totalServices: services.length,
      totalAssignments: assignments.length,
      uniqueProviders,
      byStatus,
      dateRange,
    };
  },
});
