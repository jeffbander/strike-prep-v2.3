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
        // Demographics (from CSV)
        sex: v.optional(v.string()),
        dob: v.optional(v.string()),
        age: v.optional(v.number()),
        language: v.optional(v.string()),
        csn: v.optional(v.string()),
        // Location (can change between uploads)
        room: v.optional(v.string()),
        bed: v.optional(v.string()),
        // 1:1 Nursing detection
        requiresOneToOne: v.optional(v.boolean()),
        oneToOneDevices: v.optional(v.array(v.string())),
        // AI input from CSV
        dischargeToday: v.optional(v.string()),
        rawGeneralComments: v.optional(v.string()),
        // AI-generated fields (optional - may be pre-populated or null)
        primaryDiagnosis: v.optional(v.string()),
        clinicalStatus: v.optional(v.string()),
        dispositionConsiderations: v.optional(v.string()),
        pendingProcedures: v.optional(v.string()),
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
          // If patient was previously discharged, clean up false discharge history entries
          if (existingPatient.patientStatus === "discharged") {
            const dischargeHistoryEntries = await ctx.db
              .query("census_patient_history")
              .withIndex("by_patient", (q) => q.eq("patientId", existingPatient._id))
              .filter((q) => q.eq(q.field("toUnitName"), "DISCHARGED"))
              .collect();

            for (const entry of dischargeHistoryEntries) {
              await ctx.db.delete(entry._id);
            }
          }

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
            // Demographics
            sex: patient.sex,
            dob: patient.dob,
            age: patient.age,
            language: patient.language,
            csn: patient.csn,
            // Location
            room: patient.room,
            bed: patient.bed,
            // 1:1 Nursing
            requiresOneToOne: patient.requiresOneToOne ?? false,
            oneToOneDevices: patient.oneToOneDevices,
            oneToOneSource: (patient.requiresOneToOne ?? false) ? "keyword" : undefined,
            // AI input
            dischargeToday: patient.dischargeToday,
            rawGeneralComments: patient.rawGeneralComments,
            // AI-generated fields
            primaryDiagnosis: patient.primaryDiagnosis,
            clinicalStatus: patient.clinicalStatus,
            dispositionConsiderations: patient.dispositionConsiderations,
            pendingProcedures: patient.pendingProcedures,
            projectedDischargeDays: patient.projectedDischargeDays,
            // Status
            patientStatus: "active",
            isActive: true, // Ensure patient is marked active (may have been discharged previously)
            lastSeenImportId: args.importId,
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
            // Demographics
            sex: patient.sex,
            dob: patient.dob,
            age: patient.age,
            language: patient.language,
            csn: patient.csn,
            // Location
            room: patient.room,
            bed: patient.bed,
            // 1:1 Nursing
            requiresOneToOne: patient.requiresOneToOne ?? false,
            oneToOneDevices: patient.oneToOneDevices,
            oneToOneSource: (patient.requiresOneToOne ?? false) ? "keyword" : undefined,
            // AI input
            dischargeToday: patient.dischargeToday,
            rawGeneralComments: patient.rawGeneralComments,
            // AI-generated fields
            primaryDiagnosis: patient.primaryDiagnosis,
            clinicalStatus: patient.clinicalStatus,
            dispositionConsiderations: patient.dispositionConsiderations,
            pendingProcedures: patient.pendingProcedures,
            projectedDischargeDays: patient.projectedDischargeDays,
            // Status
            patientStatus: "active",
            lastSeenImportId: args.importId,
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
      pendingProcedures: v.optional(v.string()),
      projectedDischargeDays: v.optional(v.number()),
      losReasoning: v.optional(v.string()), // AI explanation of LOS prediction
      // Clinical signal extraction results
      trajectory: v.optional(v.string()), // "Improving", "Stable", "Critical", etc.
      projectedDowngradeDays: v.optional(v.number()), // Days until ICU downgrade
      trend: v.optional(v.string()), // "Progressing", "No Change", "Regressed", "New"
      // 1:1 Nursing detection
      requiresOneToOne: v.optional(v.boolean()),
      oneToOneDevices: v.optional(v.array(v.string())),
      oneToOneSource: v.optional(v.string()),
      // Downgrade prediction (ICU only)
      predictedDowngradeDate: v.optional(v.string()),
      predictedDowngradeUnit: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const patient = await ctx.db.get(args.patientId);
    if (!patient) return;

    // Determine 1:1 source - if AI found it and keyword already found it, mark as "both"
    let oneToOneSource = args.predictions.oneToOneSource;
    if (args.predictions.requiresOneToOne && patient.oneToOneSource === "keyword") {
      oneToOneSource = "both";
    } else if (args.predictions.requiresOneToOne) {
      oneToOneSource = oneToOneSource || "ai";
    }

    await ctx.db.patch(args.patientId, {
      ...args.predictions,
      oneToOneSource,
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

/**
 * Mark patients as discharged if not present in new import
 * Called after upsertPatients completes
 */
export const markDischargedPatients = mutation({
  args: {
    importId: v.id("census_imports"),
    currentMrns: v.array(v.string()), // MRNs present in this import
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) throw new Error("Import not found");

    await requireHospitalAccess(ctx, importRecord.hospitalId);

    const now = Date.now();
    const hospitalId = importRecord.hospitalId;
    const expiresAt = now + THREE_DAYS_MS;

    // Get all active patients for this hospital
    const activePatients = await ctx.db
      .query("census_patients")
      .withIndex("by_patient_status", (q) =>
        q.eq("hospitalId", hospitalId).eq("patientStatus", "active")
      )
      .collect();

    // Mark as discharged if not in current import
    const currentMrnSet = new Set(args.currentMrns);
    let dischargedCount = 0;

    for (const patient of activePatients) {
      if (!currentMrnSet.has(patient.mrn)) {
        await ctx.db.patch(patient._id, {
          patientStatus: "discharged",
          dischargedAt: now,
          isActive: false,
          updatedAt: now,
        });

        // Record discharge in history
        await ctx.db.insert("census_patient_history", {
          patientId: patient._id,
          hospitalId,
          mrn: patient.mrn,
          fromUnitName: patient.currentUnitName,
          toUnitName: "DISCHARGED",
          transferDate: importRecord.uploadDate,
          clinicalSummary: "Patient not present in census - assumed discharged or transferred off service",
          createdAt: now,
          expiresAt,
        });

        dischargedCount++;
      }
    }

    return { dischargedCount };
  },
});

// ═══════════════════════════════════════════════════════════════════
// STAFFING PREDICTIONS
// ═══════════════════════════════════════════════════════════════════

// Staffing ratio constants
const STAFFING_RATIOS = {
  oneToOne: 1, // 1:1 for ECMO/CVVH/Impella/IABP
  icu: 2, // 1:2 for ICU
  floor: 5, // 1:5 for floor
};

/**
 * Calculate staffing predictions by unit
 * Returns AM/PM shift predictions with RN needs based on:
 * - Floor: 1:5 ratio
 * - ICU: 1:2 ratio
 * - 1:1 devices (ECMO, CVVH, Impella, IABP): dedicated 1:1 RN
 */
export const getStaffingPredictions = query({
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

    if (!latestImport) {
      return { predictions: [], censusDate: null };
    }

    // Get active patients from the latest import only
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
        patients: typeof patients;
        oneToOnePatients: typeof patients;
      }
    >();

    for (const patient of patients) {
      if (!unitMap.has(patient.currentUnitName)) {
        unitMap.set(patient.currentUnitName, {
          unitName: patient.currentUnitName,
          unitType: patient.unitType,
          patients: [],
          oneToOnePatients: [],
        });
      }
      const unit = unitMap.get(patient.currentUnitName)!;
      unit.patients.push(patient);
      if (patient.requiresOneToOne) {
        unit.oneToOnePatients.push(patient);
      }
    }

    // Calculate predictions for each unit
    const predictions = Array.from(unitMap.values()).map((unit) => {
      const isICU = unit.unitType === "icu";
      const baseRatio = isICU ? STAFFING_RATIOS.icu : STAFFING_RATIOS.floor;

      // Count predicted discharges based on projectedDischargeDays
      // AM discharges: patients leaving today (projectedDischargeDays = 0 or 1)
      // PM discharges: patients likely leaving later today or tomorrow (projectedDischargeDays = 1 or 2)
      const amDischarges = unit.patients.filter(
        (p) => p.projectedDischargeDays !== undefined && p.projectedDischargeDays <= 1
      ).length;
      const pmDischarges = unit.patients.filter(
        (p) => p.projectedDischargeDays !== undefined && p.projectedDischargeDays === 2
      ).length;

      // Count predicted downgrades (ICU patients predicted to step down)
      const amDowngrades = isICU
        ? unit.patients.filter(
            (p) =>
              p.predictedDowngradeDate === latestImport.uploadDate ||
              (p.projectedDischargeDays !== undefined && p.projectedDischargeDays <= 2)
          ).length
        : 0;

      const currentCount = unit.patients.length;
      const oneToOneCount = unit.oneToOnePatients.length;

      // Calculate end-of-shift census
      const amEndCensus = Math.max(0, currentCount - amDischarges - amDowngrades);
      const pmEndCensus = Math.max(0, currentCount - amDischarges - pmDischarges - amDowngrades);

      // Calculate RN needs
      // Regular patients: divide by ratio
      // 1:1 patients: each needs dedicated RN
      const regularAMPatients = Math.max(0, amEndCensus - oneToOneCount);
      const regularPMPatients = Math.max(0, pmEndCensus - oneToOneCount);

      const amRnNeeded = Math.ceil(regularAMPatients / baseRatio);
      const pmRnNeeded = Math.ceil(regularPMPatients / baseRatio);

      return {
        unitName: unit.unitName,
        unitType: unit.unitType,
        currentPatients: currentCount,
        oneToOnePatients: oneToOneCount,
        oneToOneDevices: unit.oneToOnePatients.flatMap((p) => p.oneToOneDevices || []),
        amShift: {
          predictedDischarges: amDischarges,
          predictedDowngrades: amDowngrades,
          endOfShiftCensus: amEndCensus,
          rnNeeded: amRnNeeded,
          oneToOneRnNeeded: oneToOneCount,
          totalRnNeeded: amRnNeeded + oneToOneCount,
        },
        pmShift: {
          predictedDischarges: pmDischarges,
          predictedDowngrades: 0, // Usually no downgrades on PM shift
          endOfShiftCensus: pmEndCensus,
          rnNeeded: pmRnNeeded,
          oneToOneRnNeeded: oneToOneCount,
          totalRnNeeded: pmRnNeeded + oneToOneCount,
        },
      };
    });

    // Sort: ICUs first, then by patient count
    predictions.sort((a, b) => {
      if (a.unitType !== b.unitType) {
        return a.unitType === "icu" ? -1 : 1;
      }
      return b.currentPatients - a.currentPatients;
    });

    // Calculate totals
    const totals = {
      totalPatients: patients.length,
      totalOneToOne: patients.filter((p) => p.requiresOneToOne).length,
      amTotalRn: predictions.reduce((sum, p) => sum + p.amShift.totalRnNeeded, 0),
      pmTotalRn: predictions.reduce((sum, p) => sum + p.pmShift.totalRnNeeded, 0),
    };

    return {
      predictions,
      totals,
      censusDate: latestImport.uploadDate,
      importedAt: latestImport.importedAt,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// 5-DAY CENSUS FORECAST
// ═══════════════════════════════════════════════════════════════════

/**
 * Get 5-day census forecast per unit
 * Calculates projected census based on discharge predictions and ICU downgrades
 */
export const getCensusForecast = query({
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

    if (!latestImport) {
      return { forecast: [], censusDate: null, importedAt: null };
    }

    // Get active patients from the latest import only
    const patients = await ctx.db
      .query("census_patients")
      .withIndex("by_import", (q) => q.eq("importId", latestImport._id))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    if (patients.length === 0) {
      return { forecast: [], censusDate: latestImport.uploadDate, importedAt: latestImport.importedAt };
    }

    // Group patients by unit
    const unitMap = new Map<
      string,
      {
        unitName: string;
        unitType: "icu" | "floor";
        patients: typeof patients;
      }
    >();

    for (const patient of patients) {
      if (!unitMap.has(patient.currentUnitName)) {
        unitMap.set(patient.currentUnitName, {
          unitName: patient.currentUnitName,
          unitType: patient.unitType as "icu" | "floor",
          patients: [],
        });
      }
      unitMap.get(patient.currentUnitName)!.patients.push(patient);
    }

    // Calculate 5-day forecast for each unit
    const forecast = Array.from(unitMap.values()).map((unit) => {
      const days = [];
      let runningCensus = unit.patients.length;

      for (let day = 0; day <= 5; day++) {
        // Count discharges on this day (patients with projectedDischargeDays == day)
        const dischargesOnDay = unit.patients.filter(
          (p) => p.projectedDischargeDays === day
        ).length;

        // Count ICU downgrades (step-downs to floor) - only for ICU units
        let downgradesOnDay = 0;
        if (unit.unitType === "icu") {
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + day);
          const targetDateStr = targetDate.toISOString().split("T")[0];

          downgradesOnDay = unit.patients.filter(
            (p) => p.predictedDowngradeDate === targetDateStr
          ).length;
        }

        // Stub for future: predicted admits from scheduled procedures
        const predictedAdmits = 0;

        // Calculate net change and running census
        if (day > 0) {
          const netChange = predictedAdmits - dischargesOnDay - downgradesOnDay;
          runningCensus = Math.max(0, runningCensus + netChange);
        }

        days.push({
          day,
          date: new Date(Date.now() + day * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          projectedCensus: day === 0 ? unit.patients.length : runningCensus,
          predictedDischarges: dischargesOnDay,
          predictedDowngrades: downgradesOnDay,
          predictedAdmits,
          netChange: day === 0 ? 0 : predictedAdmits - dischargesOnDay - downgradesOnDay,
        });
      }

      return {
        unitName: unit.unitName,
        unitType: unit.unitType,
        currentCensus: unit.patients.length,
        days,
      };
    });

    // Sort: ICUs first, then by current census
    forecast.sort((a, b) => {
      if (a.unitType !== b.unitType) return a.unitType === "icu" ? -1 : 1;
      return b.currentCensus - a.currentCensus;
    });

    return {
      forecast,
      censusDate: latestImport.uploadDate,
      importedAt: latestImport.importedAt,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// COMBINED CENSUS + PROCEDURE FORECAST
// ═══════════════════════════════════════════════════════════════════

import { normalizeUnitName, getUnitType } from "./lib/unitMapping";

/**
 * Parse a date string in various formats and return ISO format (YYYY-MM-DD)
 * Handles: "1/13/2026", "01/13/2026", "2026-01-13"
 */
function parseToISODate(dateStr: string): string {
  if (!dateStr) return "";

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.split("T")[0];
  }

  // M/D/YYYY or MM/DD/YYYY format
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return dateStr;
}

/**
 * Get combined 7-day census forecast including procedure admissions.
 * Merges current census patients with scheduled procedure admissions.
 */
export const getCombinedForecast = query({
  args: {
    hospitalId: v.id("hospitals"),
    forecastDays: v.optional(v.number()), // Default 7
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    const numDays = args.forecastDays ?? 7;

    // Get the latest census import
    const latestImport = await ctx.db
      .query("census_imports")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
      .order("desc")
      .first();

    // Generate date range for forecast
    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < numDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }

    // Get census patients from latest import
    const censusPatients = latestImport
      ? await ctx.db
          .query("census_patients")
          .withIndex("by_import", (q) => q.eq("importId", latestImport._id))
          .filter((q) => q.eq(q.field("isActive"), true))
          .collect()
      : [];

    // Get procedure patients for date range
    const procedurePatients = await ctx.db
      .query("procedure_patients")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Filter procedures to date range and those who will admit
    // Note: visitDate in CSV can be "1/13/2026" format, convert to ISO
    const relevantProcedures = procedurePatients.filter(
      (p) => p.willAdmit && dates.includes(parseToISODate(p.visitDate))
    );

    // Build unit map from census patients
    const unitMap = new Map<
      string,
      {
        unitName: string;
        unitType: "icu" | "floor";
        censusPatients: typeof censusPatients;
        days: Array<{
          projectedCensus: number;
          discharges: number;
          downgrades: number;
          procedureAdmits: number;
        }>;
      }
    >();

    // Initialize units from census patients
    for (const patient of censusPatients) {
      const normalized = normalizeUnitName(patient.currentUnitName);
      if (!unitMap.has(normalized)) {
        unitMap.set(normalized, {
          unitName: normalized,
          unitType: getUnitType(patient.currentUnitName),
          censusPatients: [],
          days: Array.from({ length: numDays }, () => ({
            projectedCensus: 0,
            discharges: 0,
            downgrades: 0,
            procedureAdmits: 0,
          })),
        });
      }
      unitMap.get(normalized)!.censusPatients.push(patient);
    }

    // Ensure CCU and N07E exist even if no census patients
    if (!unitMap.has("CCU")) {
      unitMap.set("CCU", {
        unitName: "CCU",
        unitType: "icu",
        censusPatients: [],
        days: Array.from({ length: numDays }, () => ({
          projectedCensus: 0,
          discharges: 0,
          downgrades: 0,
          procedureAdmits: 0,
        })),
      });
    }
    if (!unitMap.has("N07E")) {
      unitMap.set("N07E", {
        unitName: "N07E",
        unitType: "floor",
        censusPatients: [],
        days: Array.from({ length: numDays }, () => ({
          projectedCensus: 0,
          discharges: 0,
          downgrades: 0,
          procedureAdmits: 0,
        })),
      });
    }

    // Calculate census discharges and downgrades by day
    for (const [unitName, unit] of unitMap) {
      for (let day = 0; day < numDays; day++) {
        // Count discharges on this day
        unit.days[day].discharges = unit.censusPatients.filter(
          (p) => p.projectedDischargeDays === day
        ).length;

        // Count ICU downgrades (only for ICU units)
        if (unit.unitType === "icu") {
          unit.days[day].downgrades = unit.censusPatients.filter((p) => {
            if (!p.predictedDowngradeDate) return false;
            return p.predictedDowngradeDate === dates[day];
          }).length;
        }
      }
    }

    // Add procedure admissions by day and unit
    for (const proc of relevantProcedures) {
      const procDateISO = parseToISODate(proc.visitDate);
      const admitDayIndex = dates.indexOf(procDateISO);
      if (admitDayIndex === -1) continue;

      // ICU stay (if any)
      if (proc.icuDays > 0) {
        const icuUnit = normalizeUnitName(proc.icuUnit || "CCU");
        const unit = unitMap.get(icuUnit);
        if (unit) {
          // Patient is in ICU from admit day for icuDays
          for (let d = admitDayIndex; d < Math.min(admitDayIndex + proc.icuDays, numDays); d++) {
            unit.days[d].procedureAdmits++;
          }
        }
      }

      // Floor stay (after ICU or direct)
      if (proc.floorDays > 0) {
        const floorUnit = normalizeUnitName(proc.floorUnit || "N07E");
        const unit = unitMap.get(floorUnit);
        if (unit) {
          const floorStartDay = admitDayIndex + (proc.icuDays || 0);
          for (let d = floorStartDay; d < Math.min(floorStartDay + proc.floorDays, numDays); d++) {
            if (d >= 0 && d < numDays) {
              unit.days[d].procedureAdmits++;
            }
          }
        }
      }
    }

    // Calculate projected census for each unit/day
    const forecast = Array.from(unitMap.values()).map((unit) => {
      let runningCensus = unit.censusPatients.length;

      const days = unit.days.map((dayData, dayIndex) => {
        if (dayIndex === 0) {
          // Day 0: current census + procedure admits
          return {
            day: dayIndex,
            date: dates[dayIndex],
            projectedCensus: runningCensus + dayData.procedureAdmits,
            predictedDischarges: dayData.discharges,
            predictedDowngrades: dayData.downgrades,
            procedureAdmits: dayData.procedureAdmits,
            netChange: 0,
          };
        }

        // Subsequent days: previous - discharges - downgrades + procedure admits
        const prevDay = unit.days[dayIndex - 1];
        runningCensus = Math.max(
          0,
          runningCensus - dayData.discharges - dayData.downgrades
        );

        const projectedCensus = runningCensus + dayData.procedureAdmits;
        const netChange =
          dayData.procedureAdmits - dayData.discharges - dayData.downgrades;

        return {
          day: dayIndex,
          date: dates[dayIndex],
          projectedCensus,
          predictedDischarges: dayData.discharges,
          predictedDowngrades: dayData.downgrades,
          procedureAdmits: dayData.procedureAdmits,
          netChange,
        };
      });

      return {
        unitName: unit.unitName,
        unitType: unit.unitType,
        currentCensus: unit.censusPatients.length,
        procedureAdmitsTotal: relevantProcedures.filter((p) => {
          const icuUnit = normalizeUnitName(p.icuUnit || "CCU");
          const floorUnit = normalizeUnitName(p.floorUnit || "N07E");
          return unit.unitName === icuUnit || unit.unitName === floorUnit;
        }).length,
        days,
      };
    });

    // Sort: ICUs first, then by current census
    forecast.sort((a, b) => {
      if (a.unitType !== b.unitType) return a.unitType === "icu" ? -1 : 1;
      return b.currentCensus - a.currentCensus;
    });

    return {
      forecast,
      censusDate: latestImport?.uploadDate || null,
      importedAt: latestImport?.importedAt || null,
      procedurePatientsTotal: relevantProcedures.length,
    };
  },
});
