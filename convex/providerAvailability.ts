import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireDepartmentAccess, auditLog } from "./lib/auth";

// ═══════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Get availability for a specific provider
 */
export const getByProvider = query({
  args: {
    providerId: v.id("providers"),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    scenarioId: v.optional(v.id("strike_scenarios")),
  },
  handler: async (ctx, args) => {
    let availability = await ctx.db
      .query("provider_availability")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .collect();

    // Filter by date range if provided
    if (args.startDate) {
      availability = availability.filter((a) => a.date >= args.startDate!);
    }
    if (args.endDate) {
      availability = availability.filter((a) => a.date <= args.endDate!);
    }

    // Filter by scenario if provided
    if (args.scenarioId) {
      availability = availability.filter(
        (a) => a.scenarioId === args.scenarioId || !a.scenarioId
      );
    }

    return availability.sort((a, b) => a.date.localeCompare(b.date));
  },
});

/**
 * Get all availability within a date range (for calendar view)
 */
export const getByDateRange = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),
    scenarioId: v.optional(v.id("strike_scenarios")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    // Get providers in scope
    let providers;
    if (args.departmentId) {
      providers = await ctx.db
        .query("providers")
        .withIndex("by_department_active", (q) =>
          q.eq("departmentId", args.departmentId!).eq("isActive", true)
        )
        .collect();
    } else if (args.hospitalId) {
      providers = await ctx.db
        .query("providers")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId!))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    } else {
      return []; // Need at least hospital scope
    }

    // Get availability for all providers in date range
    const providerIds = providers.map((p) => p._id);

    const allAvailability = await Promise.all(
      providerIds.map(async (providerId) => {
        const availability = await ctx.db
          .query("provider_availability")
          .withIndex("by_provider", (q) => q.eq("providerId", providerId))
          .collect();

        // Filter by date range
        return availability.filter(
          (a) => a.date >= args.startDate && a.date <= args.endDate
        );
      })
    );

    // Flatten and enrich with provider details
    const flatAvailability = allAvailability.flat();

    const enriched = await Promise.all(
      flatAvailability.map(async (avail) => {
        const provider = providers.find((p) => p._id === avail.providerId);
        return {
          ...avail,
          providerName: provider
            ? `${provider.firstName} ${provider.lastName}`
            : "Unknown",
          providerEmail: provider?.email,
        };
      })
    );

    return enriched;
  },
});

/**
 * Get available providers for a specific date and shift
 */
export const getAvailableProviders = query({
  args: {
    date: v.string(),
    shiftType: v.string(), // "AM" | "PM"
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),
    jobTypeId: v.optional(v.id("job_types")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    // Get providers in scope
    let providersQuery;
    if (args.departmentId) {
      providersQuery = ctx.db
        .query("providers")
        .withIndex("by_department_active", (q) =>
          q.eq("departmentId", args.departmentId!).eq("isActive", true)
        );
    } else if (args.hospitalId) {
      providersQuery = ctx.db
        .query("providers")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId!));
    } else {
      return [];
    }

    let providers = await providersQuery.collect();

    // Filter by job type if provided
    if (args.jobTypeId) {
      providers = providers.filter((p) => p.jobTypeId === args.jobTypeId);
    }

    // Filter to active only
    providers = providers.filter((p) => p.isActive);

    // Get availability for each provider on this date
    const availableProviders = await Promise.all(
      providers.map(async (provider) => {
        const availability = await ctx.db
          .query("provider_availability")
          .withIndex("by_provider_date", (q) =>
            q.eq("providerId", provider._id).eq("date", args.date)
          )
          .first();

        // Determine availability status
        let isAvailable = false;
        let isPreferred = false;

        if (availability) {
          if (availability.availabilityType === "unavailable") {
            isAvailable = false;
          } else {
            isAvailable =
              args.shiftType === "AM"
                ? availability.amAvailable
                : availability.pmAvailable;
            isPreferred =
              args.shiftType === "AM"
                ? availability.amPreferred ?? false
                : availability.pmPreferred ?? false;
          }
        } else {
          // No availability record means we assume available (can change this logic)
          isAvailable = true;
        }

        const jobType = await ctx.db.get(provider.jobTypeId);

        return {
          ...provider,
          jobTypeName: jobType?.name,
          jobTypeCode: jobType?.code,
          availabilityStatus: isAvailable
            ? isPreferred
              ? "preferred"
              : "available"
            : "unavailable",
          isAvailable,
          isPreferred,
          availabilityNotes: availability?.notes,
        };
      })
    );

    // Filter to only available providers and sort by preference
    return availableProviders
      .filter((p) => p.isAvailable)
      .sort((a, b) => {
        // Preferred first, then by name
        if (a.isPreferred && !b.isPreferred) return -1;
        if (!a.isPreferred && b.isPreferred) return 1;
        return a.lastName.localeCompare(b.lastName);
      });
  },
});

/**
 * Get availability summary for providers (for dashboard)
 */
export const getAvailabilitySummary = query({
  args: {
    scenarioId: v.id("strike_scenarios"),
    hospitalId: v.optional(v.id("hospitals")),
  },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) return null;

    // Get providers in scope
    let providers;
    if (args.hospitalId) {
      providers = await ctx.db
        .query("providers")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId!))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    } else {
      providers = await ctx.db
        .query("providers")
        .withIndex("by_health_system", (q) =>
          q.eq("healthSystemId", scenario.healthSystemId)
        )
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    }

    // Get availability for each provider
    const summaries = await Promise.all(
      providers.map(async (provider) => {
        const availability = await ctx.db
          .query("provider_availability")
          .withIndex("by_provider", (q) => q.eq("providerId", provider._id))
          .collect();

        // Filter to scenario date range
        const scenarioAvailability = availability.filter(
          (a) => a.date >= scenario.startDate && a.date <= scenario.endDate
        );

        const availableDays = scenarioAvailability.filter(
          (a) =>
            a.availabilityType === "available" && (a.amAvailable || a.pmAvailable)
        ).length;

        const unavailableDays = scenarioAvailability.filter(
          (a) => a.availabilityType === "unavailable"
        ).length;

        const jobType = await ctx.db.get(provider.jobTypeId);

        return {
          providerId: provider._id,
          providerName: `${provider.firstName} ${provider.lastName}`,
          jobTypeName: jobType?.name,
          jobTypeCode: jobType?.code,
          totalDaysInRange: scenarioAvailability.length,
          availableDays,
          unavailableDays,
          noResponseDays:
            scenarioAvailability.length === 0
              ? Math.ceil(
                  (new Date(scenario.endDate).getTime() -
                    new Date(scenario.startDate).getTime()) /
                    (1000 * 60 * 60 * 24)
                ) + 1
              : 0,
        };
      })
    );

    return {
      totalProviders: providers.length,
      providersWithAvailability: summaries.filter(
        (s) => s.totalDaysInRange > 0
      ).length,
      summaries,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Set availability for a single date
 */
export const setAvailability = mutation({
  args: {
    providerId: v.id("providers"),
    date: v.string(),
    availabilityType: v.string(), // "available" | "unavailable"
    amAvailable: v.boolean(),
    pmAvailable: v.boolean(),
    amPreferred: v.optional(v.boolean()),
    pmPreferred: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    scenarioId: v.optional(v.id("strike_scenarios")),
  },
  handler: async (ctx, args) => {
    const provider = await ctx.db.get(args.providerId);
    if (!provider) throw new Error("Provider not found");

    const user = await requireDepartmentAccess(ctx, provider.departmentId);

    // Check if availability already exists for this date
    const existing = await ctx.db
      .query("provider_availability")
      .withIndex("by_provider_date", (q) =>
        q.eq("providerId", args.providerId).eq("date", args.date)
      )
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        availabilityType: args.availabilityType,
        amAvailable: args.amAvailable,
        pmAvailable: args.pmAvailable,
        amPreferred: args.amPreferred,
        pmPreferred: args.pmPreferred,
        notes: args.notes,
        scenarioId: args.scenarioId,
        enteredBy: user._id,
        enteredAt: Date.now(),
      });

      return { updated: true, availabilityId: existing._id };
    } else {
      // Create new
      const availabilityId = await ctx.db.insert("provider_availability", {
        providerId: args.providerId,
        date: args.date,
        availabilityType: args.availabilityType,
        amAvailable: args.amAvailable,
        pmAvailable: args.pmAvailable,
        amPreferred: args.amPreferred,
        pmPreferred: args.pmPreferred,
        notes: args.notes,
        scenarioId: args.scenarioId,
        enteredBy: user._id,
        enteredAt: Date.now(),
        source: "admin",
      });

      return { created: true, availabilityId };
    }
  },
});

/**
 * Set availability for a date range
 */
export const setAvailabilityRange = mutation({
  args: {
    providerId: v.id("providers"),
    startDate: v.string(),
    endDate: v.string(),
    availabilityType: v.string(),
    amAvailable: v.boolean(),
    pmAvailable: v.boolean(),
    amPreferred: v.optional(v.boolean()),
    pmPreferred: v.optional(v.boolean()),
    notes: v.optional(v.string()),
    scenarioId: v.optional(v.id("strike_scenarios")),
    skipWeekends: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const provider = await ctx.db.get(args.providerId);
    if (!provider) throw new Error("Provider not found");

    const user = await requireDepartmentAccess(ctx, provider.departmentId);

    // Generate date range
    const dates: string[] = [];
    const start = new Date(args.startDate);
    const end = new Date(args.endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];

      // Skip weekends if requested
      if (args.skipWeekends) {
        const day = d.getDay();
        if (day === 0 || day === 6) continue;
      }

      dates.push(dateStr);
    }

    let created = 0;
    let updated = 0;

    for (const date of dates) {
      const existing = await ctx.db
        .query("provider_availability")
        .withIndex("by_provider_date", (q) =>
          q.eq("providerId", args.providerId).eq("date", date)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          availabilityType: args.availabilityType,
          amAvailable: args.amAvailable,
          pmAvailable: args.pmAvailable,
          amPreferred: args.amPreferred,
          pmPreferred: args.pmPreferred,
          notes: args.notes,
          scenarioId: args.scenarioId,
          enteredBy: user._id,
          enteredAt: Date.now(),
        });
        updated++;
      } else {
        await ctx.db.insert("provider_availability", {
          providerId: args.providerId,
          date,
          availabilityType: args.availabilityType,
          amAvailable: args.amAvailable,
          pmAvailable: args.pmAvailable,
          amPreferred: args.amPreferred,
          pmPreferred: args.pmPreferred,
          notes: args.notes,
          scenarioId: args.scenarioId,
          enteredBy: user._id,
          enteredAt: Date.now(),
          source: "admin",
        });
        created++;
      }
    }

    await auditLog(ctx, user, "BULK_UPDATE", "PROVIDER_AVAILABILITY", args.providerId, {
      startDate: args.startDate,
      endDate: args.endDate,
      created,
      updated,
    });

    return { created, updated, totalDays: dates.length };
  },
});

/**
 * Bulk import availability from spreadsheet data
 */
export const bulkImportAvailability = mutation({
  args: {
    availabilities: v.array(
      v.object({
        providerEmail: v.string(),
        date: v.string(),
        amAvailable: v.boolean(),
        pmAvailable: v.boolean(),
        amPreferred: v.optional(v.boolean()),
        pmPreferred: v.optional(v.boolean()),
        notes: v.optional(v.string()),
      })
    ),
    scenarioId: v.optional(v.id("strike_scenarios")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: { email: string; date: string; reason: string }[] = [];

    for (const avail of args.availabilities) {
      // Find provider by email
      const provider = await ctx.db
        .query("providers")
        .filter((q) => q.eq(q.field("email"), avail.providerEmail))
        .first();

      if (!provider) {
        errors.push({
          email: avail.providerEmail,
          date: avail.date,
          reason: "Provider not found",
        });
        skipped++;
        continue;
      }

      // Check if availability exists
      const existing = await ctx.db
        .query("provider_availability")
        .withIndex("by_provider_date", (q) =>
          q.eq("providerId", provider._id).eq("date", avail.date)
        )
        .first();

      const availabilityType =
        avail.amAvailable || avail.pmAvailable ? "available" : "unavailable";

      if (existing) {
        await ctx.db.patch(existing._id, {
          availabilityType,
          amAvailable: avail.amAvailable,
          pmAvailable: avail.pmAvailable,
          amPreferred: avail.amPreferred,
          pmPreferred: avail.pmPreferred,
          notes: avail.notes,
          scenarioId: args.scenarioId,
          enteredBy: user._id,
          enteredAt: Date.now(),
          source: "bulk_import",
        });
        updated++;
      } else {
        await ctx.db.insert("provider_availability", {
          providerId: provider._id,
          date: avail.date,
          availabilityType,
          amAvailable: avail.amAvailable,
          pmAvailable: avail.pmAvailable,
          amPreferred: avail.amPreferred,
          pmPreferred: avail.pmPreferred,
          notes: avail.notes,
          scenarioId: args.scenarioId,
          enteredBy: user._id,
          enteredAt: Date.now(),
          source: "bulk_import",
        });
        created++;
      }
    }

    await auditLog(ctx, user, "BULK_IMPORT", "PROVIDER_AVAILABILITY", null, {
      totalRecords: args.availabilities.length,
      created,
      updated,
      skipped,
      errors: errors.length,
    });

    return { created, updated, skipped, errors };
  },
});

/**
 * Delete availability for a specific date
 */
export const deleteAvailability = mutation({
  args: {
    providerId: v.id("providers"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const provider = await ctx.db.get(args.providerId);
    if (!provider) throw new Error("Provider not found");

    const user = await requireDepartmentAccess(ctx, provider.departmentId);

    const existing = await ctx.db
      .query("provider_availability")
      .withIndex("by_provider_date", (q) =>
        q.eq("providerId", args.providerId).eq("date", args.date)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true };
    }

    return { deleted: false };
  },
});

/**
 * Clear all availability for a provider in a date range
 */
export const clearAvailabilityRange = mutation({
  args: {
    providerId: v.id("providers"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const provider = await ctx.db.get(args.providerId);
    if (!provider) throw new Error("Provider not found");

    const user = await requireDepartmentAccess(ctx, provider.departmentId);

    const availability = await ctx.db
      .query("provider_availability")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .collect();

    const toDelete = availability.filter(
      (a) => a.date >= args.startDate && a.date <= args.endDate
    );

    for (const avail of toDelete) {
      await ctx.db.delete(avail._id);
    }

    await auditLog(ctx, user, "CLEAR", "PROVIDER_AVAILABILITY", args.providerId, {
      startDate: args.startDate,
      endDate: args.endDate,
      deleted: toDelete.length,
    });

    return { deleted: toDelete.length };
  },
});
