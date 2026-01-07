import { internalMutation } from "./_generated/server";

/**
 * Clean up census data older than 3 days
 * Called by scheduled cron job
 */
export const cleanupExpiredData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let patientsDeleted = 0;
    let historyDeleted = 0;
    let importsDeleted = 0;

    // Delete expired patients
    const expiredPatients = await ctx.db
      .query("census_patients")
      .withIndex("by_expires_at")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    for (const patient of expiredPatients) {
      await ctx.db.delete(patient._id);
      patientsDeleted++;
    }

    // Delete expired history
    const expiredHistory = await ctx.db
      .query("census_patient_history")
      .withIndex("by_expires_at")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    for (const history of expiredHistory) {
      await ctx.db.delete(history._id);
      historyDeleted++;
    }

    // Mark old imports as inactive (don't delete, keep for audit)
    // Get imports with no active patients
    const oldImports = await ctx.db
      .query("census_imports")
      .withIndex("by_imported_at")
      .filter((q) =>
        q.and(
          q.lt(q.field("importedAt"), now - 7 * 24 * 60 * 60 * 1000), // Older than 7 days
          q.eq(q.field("isActive"), true)
        )
      )
      .collect();

    for (const importRecord of oldImports) {
      // Check if any patients still reference this import
      const activePatients = await ctx.db
        .query("census_patients")
        .withIndex("by_import", (q) => q.eq("importId", importRecord._id))
        .filter((q) => q.eq(q.field("isActive"), true))
        .first();

      if (!activePatients) {
        await ctx.db.patch(importRecord._id, { isActive: false });
        importsDeleted++;
      }
    }

    console.log(
      `Census cleanup: ${patientsDeleted} patients, ${historyDeleted} history records, ${importsDeleted} imports marked inactive`
    );

    return {
      patientsDeleted,
      historyDeleted,
      importsDeleted,
    };
  },
});
