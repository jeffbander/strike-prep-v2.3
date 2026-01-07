import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireHospitalAccess, auditLog } from "./lib/auth";
import { Id } from "./_generated/dataModel";

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

// 3 days in milliseconds
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// Unit type detection patterns
const ICU_PATTERNS = ["CCU", "CSIU", "CVU", "ICU", "CICU", "MSM"];

/**
 * Detect if a unit name is ICU or floor based on patterns
 */
function detectUnitType(unitName: string): { unitType: "icu" | "floor"; isICU: boolean } {
  const upperName = unitName.toUpperCase();
  const isICU = ICU_PATTERNS.some((pattern) => upperName.includes(pattern));
  return {
    unitType: isICU ? "icu" : "floor",
    isICU,
  };
}

/**
 * Convert full name to initials
 * "Johnson, Bob" -> "JB"
 * "Bob Johnson" -> "BJ"
 */
function nameToInitials(fullName: string): string {
  // Handle "Last, First" format
  if (fullName.includes(",")) {
    const [last, first] = fullName.split(",").map((s) => s.trim());
    const lastInitial = last.charAt(0).toUpperCase();
    const firstInitial = first?.charAt(0).toUpperCase() || "";
    return `${lastInitial}${firstInitial}`;
  }
  // Handle "First Last" format
  const parts = fullName.trim().split(/\s+/);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

// ═══════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════

/**
 * List all census imports for a hospital
 */
export const listImports = query({
  args: {
    hospitalId: v.id("hospitals"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    const imports = await ctx.db
      .query("census_imports")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
      .order("desc")
      .take(50);

    return imports;
  },
});

/**
 * Get the latest census import for a hospital
 */
export const getLatestImport = query({
  args: {
    hospitalId: v.id("hospitals"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    const latestImport = await ctx.db
      .query("census_imports")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
      .order("desc")
      .first();

    return latestImport;
  },
});

/**
 * Get patients for a specific census date
 */
export const getPatientsByDate = query({
  args: {
    hospitalId: v.id("hospitals"),
    censusDate: v.string(),
    unitName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    let patients;

    if (args.unitName) {
      patients = await ctx.db
        .query("census_patients")
        .withIndex("by_unit", (q) =>
          q.eq("hospitalId", args.hospitalId).eq("currentUnitName", args.unitName!)
        )
        .filter((q) =>
          q.and(q.eq(q.field("censusDate"), args.censusDate), q.eq(q.field("isActive"), true))
        )
        .collect();
    } else {
      patients = await ctx.db
        .query("census_patients")
        .withIndex("by_census_date", (q) =>
          q.eq("hospitalId", args.hospitalId).eq("censusDate", args.censusDate)
        )
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    }

    return patients;
  },
});

/**
 * Get current census summary by unit
 */
export const getCensusSummaryByUnit = query({
  args: {
    hospitalId: v.id("hospitals"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    // Get the latest import
    const latestImport = await ctx.db
      .query("census_imports")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
      .order("desc")
      .first();

    if (!latestImport) {
      return { units: [], totalPatients: 0, icuPatients: 0, floorPatients: 0 };
    }

    // Get all active patients from the latest import
    const patients = await ctx.db
      .query("census_patients")
      .withIndex("by_import", (q) => q.eq("importId", latestImport._id))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Group by unit
    const unitMap = new Map<
      string,
      {
        unitName: string;
        unitType: string;
        patientCount: number;
        avgProjectedDays: number;
        totalProjectedDays: number;
        patientsWithPredictions: number;
      }
    >();

    for (const patient of patients) {
      const existing = unitMap.get(patient.currentUnitName);
      if (existing) {
        existing.patientCount++;
        if (patient.projectedDischargeDays) {
          existing.totalProjectedDays += patient.projectedDischargeDays;
          existing.patientsWithPredictions++;
        }
      } else {
        unitMap.set(patient.currentUnitName, {
          unitName: patient.currentUnitName,
          unitType: patient.unitType,
          patientCount: 1,
          avgProjectedDays: 0,
          totalProjectedDays: patient.projectedDischargeDays || 0,
          patientsWithPredictions: patient.projectedDischargeDays ? 1 : 0,
        });
      }
    }

    // Calculate averages
    const units = Array.from(unitMap.values()).map((u) => ({
      ...u,
      avgProjectedDays:
        u.patientsWithPredictions > 0
          ? Math.round(u.totalProjectedDays / u.patientsWithPredictions)
          : 0,
    }));

    // Sort: ICUs first, then by patient count
    units.sort((a, b) => {
      if (a.unitType !== b.unitType) {
        return a.unitType === "icu" ? -1 : 1;
      }
      return b.patientCount - a.patientCount;
    });

    const icuPatients = patients.filter((p) => p.unitType === "icu").length;
    const floorPatients = patients.filter((p) => p.unitType === "floor").length;

    return {
      units,
      totalPatients: patients.length,
      icuPatients,
      floorPatients,
      censusDate: latestImport.uploadDate,
      importedAt: latestImport.importedAt,
    };
  },
});

/**
 * Get patient transfer history
 */
export const getPatientHistory = query({
  args: {
    hospitalId: v.id("hospitals"),
    mrn: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    const history = await ctx.db
      .query("census_patient_history")
      .withIndex("by_mrn", (q) => q.eq("hospitalId", args.hospitalId).eq("mrn", args.mrn))
      .order("desc")
      .collect();

    return history;
  },
});

/**
 * Get unit mappings for a hospital
 */
export const getUnitMappings = query({
  args: {
    hospitalId: v.id("hospitals"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    const mappings = await ctx.db
      .query("census_unit_mappings")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
      .collect();

    return mappings;
  },
});

// ═══════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a new census import record
 */
export const createImport = mutation({
  args: {
    hospitalId: v.id("hospitals"),
    fileName: v.string(),
    uploadDate: v.string(), // ISO date
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    // Get hospital to get health system
    const hospital = await ctx.db.get(args.hospitalId);
    if (!hospital) throw new Error("Hospital not found");

    const importId = await ctx.db.insert("census_imports", {
      hospitalId: args.hospitalId,
      healthSystemId: hospital.healthSystemId,
      fileName: args.fileName,
      uploadDate: args.uploadDate,
      patientsProcessed: 0,
      predictionsGenerated: 0,
      status: "pending",
      importedAt: Date.now(),
      importedBy: user._id,
      isActive: true,
    });

    return importId;
  },
});

/**
 * Update import status and statistics
 */
export const updateImportStatus = mutation({
  args: {
    importId: v.id("census_imports"),
    status: v.string(),
    patientsProcessed: v.optional(v.number()),
    predictionsGenerated: v.optional(v.number()),
    errors: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) throw new Error("Import not found");

    await requireHospitalAccess(ctx, importRecord.hospitalId);

    await ctx.db.patch(args.importId, {
      status: args.status,
      ...(args.patientsProcessed !== undefined && { patientsProcessed: args.patientsProcessed }),
      ...(args.predictionsGenerated !== undefined && {
        predictionsGenerated: args.predictionsGenerated,
      }),
      ...(args.errors !== undefined && { errors: args.errors }),
    });
  },
});

/**
 * Upsert patients from import (batch operation)
 */
export const upsertPatients = mutation({
  args: {
    importId: v.id("census_imports"),
    patients: v.array(
      v.object({
        mrn: v.string(),
        patientName: v.string(), // Full name - will be converted to initials
        unitName: v.string(),
        admissionDate: v.string(),
        censusDate: v.string(),
        service: v.optional(v.string()),
        losDays: v.optional(v.number()),
        attendingDoctor: v.optional(v.string()),
        // AI-generated fields (optional - may be pre-populated or null)
        primaryDiagnosis: v.optional(v.string()),
        clinicalStatus: v.optional(v.string()),
        dispositionConsiderations: v.optional(v.string()),
        projectedDischargeDays: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) throw new Error("Import not found");

    await requireHospitalAccess(ctx, importRecord.hospitalId);

    const hospitalId = importRecord.hospitalId;
    const now = Date.now();
    const expiresAt = now + THREE_DAYS_MS;

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const patient of args.patients) {
      try {
        // Convert name to initials
        const initials = nameToInitials(patient.patientName);

        // Detect unit type
        const { unitType, isICU } = detectUnitType(patient.unitName);

        // Check if patient already exists (by MRN)
        const existingPatient = await ctx.db
          .query("census_patients")
          .withIndex("by_mrn", (q) => q.eq("hospitalId", hospitalId).eq("mrn", patient.mrn))
          .first();

        if (existingPatient) {
          // Check for unit transfer
          if (existingPatient.currentUnitName !== patient.unitName) {
            // Record transfer in history
            await ctx.db.insert("census_patient_history", {
              patientId: existingPatient._id,
              hospitalId,
              mrn: patient.mrn,
              fromUnitName: existingPatient.currentUnitName,
              toUnitName: patient.unitName,
              transferDate: patient.censusDate,
              clinicalSummary: patient.primaryDiagnosis,
              createdAt: now,
              expiresAt,
            });
          }

          // Update existing patient
          await ctx.db.patch(existingPatient._id, {
            importId: args.importId,
            initials,
            service: patient.service,
            currentUnitName: patient.unitName,
            unitType,
            admissionDate: patient.admissionDate,
            censusDate: patient.censusDate,
            losDays: patient.losDays,
            attendingDoctor: patient.attendingDoctor,
            primaryDiagnosis: patient.primaryDiagnosis,
            clinicalStatus: patient.clinicalStatus,
            dispositionConsiderations: patient.dispositionConsiderations,
            projectedDischargeDays: patient.projectedDischargeDays,
            expiresAt,
            updatedAt: now,
          });
          updated++;
        } else {
          // Create new patient
          const patientId = await ctx.db.insert("census_patients", {
            hospitalId,
            importId: args.importId,
            mrn: patient.mrn,
            initials,
            service: patient.service,
            currentUnitName: patient.unitName,
            unitType,
            admissionDate: patient.admissionDate,
            censusDate: patient.censusDate,
            losDays: patient.losDays,
            attendingDoctor: patient.attendingDoctor,
            primaryDiagnosis: patient.primaryDiagnosis,
            clinicalStatus: patient.clinicalStatus,
            dispositionConsiderations: patient.dispositionConsiderations,
            projectedDischargeDays: patient.projectedDischargeDays,
            expiresAt,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          });

          // Record initial admission in history
          await ctx.db.insert("census_patient_history", {
            patientId,
            hospitalId,
            mrn: patient.mrn,
            fromUnitName: undefined,
            toUnitName: patient.unitName,
            transferDate: patient.admissionDate,
            clinicalSummary: patient.primaryDiagnosis,
            createdAt: now,
            expiresAt,
          });

          created++;
        }

        // Ensure unit mapping exists
        const existingMapping = await ctx.db
          .query("census_unit_mappings")
          .withIndex("by_raw_name", (q) =>
            q.eq("hospitalId", hospitalId).eq("rawUnitName", patient.unitName)
          )
          .first();

        if (!existingMapping) {
          await ctx.db.insert("census_unit_mappings", {
            hospitalId,
            rawUnitName: patient.unitName,
            unitType,
            isICU,
            createdBy: user._id,
            createdAt: now,
          });
        }
      } catch (error) {
        errors.push(`MRN ${patient.mrn}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    // Update import statistics
    await ctx.db.patch(args.importId, {
      patientsProcessed: created + updated,
      status: errors.length > 0 ? "completed" : "completed",
      errors: errors.length > 0 ? errors : undefined,
    });

    return { created, updated, errors };
  },
});

/**
 * Update patient predictions (internal - called by AI action)
 */
export const updatePatientPredictions = internalMutation({
  args: {
    patientId: v.id("census_patients"),
    predictions: v.object({
      primaryDiagnosis: v.optional(v.string()),
      clinicalStatus: v.optional(v.string()),
      dispositionConsiderations: v.optional(v.string()),
      projectedDischargeDays: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.patientId, {
      ...args.predictions,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update import prediction count (internal - called by AI action)
 */
export const updateImportPredictions = internalMutation({
  args: {
    importId: v.id("census_imports"),
    predictionsGenerated: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.importId, {
      predictionsGenerated: args.predictionsGenerated,
    });
  },
});

/**
 * Update unit mapping
 */
export const updateUnitMapping = mutation({
  args: {
    hospitalId: v.id("hospitals"),
    rawUnitName: v.string(),
    unitId: v.optional(v.id("units")),
    unitType: v.string(),
    isICU: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    const existing = await ctx.db
      .query("census_unit_mappings")
      .withIndex("by_raw_name", (q) =>
        q.eq("hospitalId", args.hospitalId).eq("rawUnitName", args.rawUnitName)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        unitId: args.unitId,
        unitType: args.unitType,
        isICU: args.isICU,
      });
    } else {
      await ctx.db.insert("census_unit_mappings", {
        hospitalId: args.hospitalId,
        rawUnitName: args.rawUnitName,
        unitId: args.unitId,
        unitType: args.unitType,
        isICU: args.isICU,
        createdBy: user._id,
        createdAt: Date.now(),
      });
    }
  },
});

/**
 * Deactivate a patient (soft delete)
 */
export const deactivatePatient = mutation({
  args: {
    patientId: v.id("census_patients"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const patient = await ctx.db.get(args.patientId);
    if (!patient) throw new Error("Patient not found");

    await requireHospitalAccess(ctx, patient.hospitalId);

    await ctx.db.patch(args.patientId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    await auditLog(ctx, user, "DEACTIVATE", "PROVIDER", args.patientId, {
      mrn: patient.mrn,
    });
  },
});
