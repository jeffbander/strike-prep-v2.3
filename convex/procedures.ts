import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireHospitalAccess, auditLog } from "./lib/auth";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  predictDisposition,
  parseAgeFromName,
  parseNumericValue,
  processProcedurePatients,
  ProcedurePatientInput,
} from "./lib/procedureDisposition";

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert full name to initials
 * "Johnson, Bob (60 y.o. M)" -> "JB"
 */
function nameToInitials(fullName: string): string {
  // Remove age/sex suffix first
  const nameOnly = fullName.replace(/\s*\(\d+\s*y\.?o\.?\s*[MF]?\)\s*/i, "");

  // Handle "Last, First" format
  if (nameOnly.includes(",")) {
    const [last, first] = nameOnly.split(",").map((s) => s.trim());
    const lastInitial = last.charAt(0).toUpperCase();
    const firstInitial = first?.charAt(0).toUpperCase() || "";
    return `${lastInitial}${firstInitial}`;
  }

  // Handle "First Last" format
  const parts = nameOnly.trim().split(/\s+/);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

/**
 * Parse sex from patient name format: "LastName, F (60 y.o. M)"
 */
function parseSexFromName(patientName: string): string | undefined {
  const sexMatch = patientName.match(/\(\d+\s*y\.?o\.?\s*([MF])\)/i);
  return sexMatch ? sexMatch[1].toUpperCase() : undefined;
}

/**
 * Parse CSV row into patient input
 */
function parseCSVRow(row: Record<string, string>): ProcedurePatientInput {
  // Handle various column name formats
  const procedureText =
    row["Procedure"] || row["procedure"] || row["PROCEDURE"] || "";
  const patientName =
    row["Patient Name/Age/Gender"] ||
    row["Patient"] ||
    row["patient_name"] ||
    row["PATIENT"] ||
    "";
  const mrn = row["MRN"] || row["mrn"] || row["Medical Record Number"] || "";
  const visitDate =
    row["Visit Date"] || row["visit_date"] || row["Date"] || "";
  const provider =
    row["Provider/Resource"] ||
    row["Provider"] ||
    row["provider"] ||
    row["PROVIDER"] ||
    "";
  const reasonForExam =
    row["Reason for Exam"] ||
    row["Reason"] ||
    row["reason_for_exam"] ||
    row["REASON"] ||
    "";

  // Clinical values
  const efRaw =
    row["Last Ejection Fraction Value"] ||
    row["EF"] ||
    row["ef"] ||
    row["Ejection Fraction"] ||
    "";
  const creatinineRaw =
    row["Creatinine"] || row["creatinine"] || row["Cr"] || row["CR"] || "";
  const hemoglobinRaw =
    row["HEMOGLOBIN"] ||
    row["Hemoglobin"] ||
    row["hemoglobin"] ||
    row["Hgb"] ||
    row["HGB"] ||
    "";

  return {
    procedureText,
    patientName,
    mrn,
    visitDate,
    provider: provider || undefined,
    reasonForExam: reasonForExam || undefined,
    age: parseAgeFromName(patientName),
    ef: parseNumericValue(efRaw),
    creatinine: parseNumericValue(creatinineRaw),
    hemoglobin: parseNumericValue(hemoglobinRaw),
  };
}

/**
 * Parse CSV content into rows
 */
function parseCSV(csvContent: string): Record<string, string>[] {
  const lines = csvContent.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || "";
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  // Don't forget the last field
  result.push(current.trim());

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// SERVICE TYPE CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════

type ServiceType = "EP" | "Cath" | "Structural";

const EP_PROCEDURES = [
  "VT_ABLATION",
  "AFIB_ABLATION",
  "FLUTTER_ABLATION",
  "SVT_ABLATION",
  "PVC_ABLATION",
  "PPM_IMPLANT",
  "ICD_IMPLANT",
  "GENERATOR_CHANGE",
  "LOOP_RECORDER",
  "CARDIOVERSION",
  "TILT_TABLE",
];

const STRUCTURAL_PROCEDURES = ["TAVR"];

/**
 * Categorize procedure into EP, Cath, or Structural service
 */
function getServiceType(category: string): ServiceType {
  if (EP_PROCEDURES.includes(category)) return "EP";
  if (STRUCTURAL_PROCEDURES.includes(category)) return "Structural";
  return "Cath";
}

// ═══════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════

/**
 * List procedure imports for a hospital
 */
export const listImports = query({
  args: {
    hospitalId: v.id("hospitals"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    const imports = await ctx.db
      .query("procedure_imports")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
      .order("desc")
      .take(50);

    return imports;
  },
});

/**
 * Get the latest procedure import for a hospital
 */
export const getLatestImport = query({
  args: {
    hospitalId: v.id("hospitals"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    const latestImport = await ctx.db
      .query("procedure_imports")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
      .order("desc")
      .first();

    return latestImport;
  },
});

/**
 * Get patients for a specific procedure import
 */
export const getPatientsByImport = query({
  args: {
    importId: v.id("procedure_imports"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) throw new Error("Import not found");

    await requireHospitalAccess(ctx, importRecord.hospitalId);

    const patients = await ctx.db
      .query("procedure_patients")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    return patients;
  },
});

/**
 * Get patients by procedure date
 */
export const getPatientsByDate = query({
  args: {
    hospitalId: v.id("hospitals"),
    visitDate: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    const patients = await ctx.db
      .query("procedure_patients")
      .withIndex("by_visit_date", (q) =>
        q.eq("hospitalId", args.hospitalId).eq("visitDate", args.visitDate)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    return patients;
  },
});

/**
 * Get patients by procedure date range (for combined forecast)
 */
export const getPatientsByDateRange = query({
  args: {
    hospitalId: v.id("hospitals"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    // Get all active procedure patients for hospital
    const patients = await ctx.db
      .query("procedure_patients")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Filter to date range and only those who will admit
    return patients.filter(
      (p) =>
        p.willAdmit &&
        p.visitDate >= args.startDate &&
        p.visitDate <= args.endDate
    );
  },
});

/**
 * Get procedure summary by date
 */
export const getProcedureSummary = query({
  args: {
    hospitalId: v.id("hospitals"),
    visitDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    // Get the latest import if no date specified
    let patients;
    if (args.visitDate !== undefined) {
      patients = await ctx.db
        .query("procedure_patients")
        .withIndex("by_visit_date", (q) =>
          q.eq("hospitalId", args.hospitalId).eq("visitDate", args.visitDate!)
        )
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    } else {
      const latestImport = await ctx.db
        .query("procedure_imports")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
        .order("desc")
        .first();

      if (!latestImport) {
        return {
          totalPatients: 0,
          willAdmit: 0,
          sameDayDischarge: 0,
          riskModifiedAdmits: 0,
          bedCountsByUnit: { CCU: 0, N07E: 0 },
          byCategory: {},
          visitDate: null,
        };
      }

      patients = await ctx.db
        .query("procedure_patients")
        .withIndex("by_import", (q) => q.eq("importId", latestImport._id))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
    }

    // Calculate summary
    const summary = {
      totalPatients: patients.length,
      willAdmit: patients.filter((p) => p.willAdmit).length,
      sameDayDischarge: patients.filter((p) => !p.willAdmit).length,
      riskModifiedAdmits: patients.filter((p) => p.riskModified).length,
      bedCountsByUnit: {
        CCU: patients.reduce((sum, p) => sum + (p.icuUnit === "CCU" ? p.icuDays : 0), 0),
        N07E: patients.reduce((sum, p) => sum + (p.floorUnit === "N07E" ? p.floorDays : 0), 0),
      },
      byCategory: {} as Record<string, number>,
      visitDate: args.visitDate || patients[0]?.visitDate || null,
    };

    // Count by category
    for (const patient of patients) {
      summary.byCategory[patient.procedureCategory] =
        (summary.byCategory[patient.procedureCategory] || 0) + 1;
    }

    return summary;
  },
});

/**
 * Get procedure dashboard data grouped by service type
 */
export const getProcedureDashboard = query({
  args: {
    hospitalId: v.id("hospitals"),
    startDate: v.string(),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    const endDate = args.endDate || args.startDate;

    // Get all active procedure patients for hospital
    const allPatients = await ctx.db
      .query("procedure_patients")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Filter to date range
    const patients = allPatients.filter(
      (p) => p.visitDate >= args.startDate && p.visitDate <= endDate
    );

    // Initialize service stats
    const byService: Record<ServiceType, {
      count: number;
      willAdmit: number;
      sameDayDischarge: number;
      ccuDays: number;
      floorDays: number;
      riskModified: number;
    }> = {
      EP: { count: 0, willAdmit: 0, sameDayDischarge: 0, ccuDays: 0, floorDays: 0, riskModified: 0 },
      Cath: { count: 0, willAdmit: 0, sameDayDischarge: 0, ccuDays: 0, floorDays: 0, riskModified: 0 },
      Structural: { count: 0, willAdmit: 0, sameDayDischarge: 0, ccuDays: 0, floorDays: 0, riskModified: 0 },
    };

    // Summary totals
    const summary = {
      totalProcedures: patients.length,
      willAdmit: 0,
      sameDayDischarge: 0,
      riskModified: 0,
      ccuBedDays: 0,
      floorBedDays: 0,
    };

    // Process each patient
    const processedPatients = patients.map((p) => {
      const serviceType = getServiceType(p.procedureCategory);

      // Update service stats
      byService[serviceType].count++;
      if (p.willAdmit) {
        byService[serviceType].willAdmit++;
        summary.willAdmit++;
      } else {
        byService[serviceType].sameDayDischarge++;
        summary.sameDayDischarge++;
      }
      if (p.riskModified) {
        byService[serviceType].riskModified++;
        summary.riskModified++;
      }
      byService[serviceType].ccuDays += p.icuDays || 0;
      byService[serviceType].floorDays += p.floorDays || 0;
      summary.ccuBedDays += p.icuDays || 0;
      summary.floorBedDays += p.floorDays || 0;

      return {
        _id: p._id,
        mrn: p.mrn,
        initials: p.initials,
        visitDate: p.visitDate,
        procedureText: p.procedureText,
        procedureCategory: p.procedureCategory,
        serviceType,
        willAdmit: p.willAdmit,
        icuDays: p.icuDays || 0,
        floorDays: p.floorDays || 0,
        totalLOS: p.totalLOS || 0,
        riskFactors: p.riskFactors || [],
        riskModified: p.riskModified || false,
        reasoning: p.reasoning || "",
        provider: p.provider,
        age: p.age,
        ef: p.ef,
        creatinine: p.creatinine,
        hemoglobin: p.hemoglobin,
      };
    });

    // Sort patients by date, then by service type
    processedPatients.sort((a, b) => {
      if (a.visitDate !== b.visitDate) {
        return a.visitDate.localeCompare(b.visitDate);
      }
      return a.serviceType.localeCompare(b.serviceType);
    });

    return {
      dateRange: { start: args.startDate, end: endDate },
      summary,
      byService,
      patients: processedPatients,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a new procedure import record
 */
export const createImport = mutation({
  args: {
    hospitalId: v.id("hospitals"),
    fileName: v.string(),
    procedureDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireHospitalAccess(ctx, args.hospitalId);

    const hospital = await ctx.db.get(args.hospitalId);
    if (!hospital) throw new Error("Hospital not found");

    const importId = await ctx.db.insert("procedure_imports", {
      hospitalId: args.hospitalId,
      healthSystemId: hospital.healthSystemId,
      fileName: args.fileName,
      procedureDate: args.procedureDate,
      patientsProcessed: 0,
      willAdmit: 0,
      sameDayDischarge: 0,
      riskModifiedAdmits: 0,
      ccuBedDays: 0,
      floorBedDays: 0,
      status: "pending",
      importedAt: Date.now(),
      importedBy: user._id,
      isActive: true,
    });

    await auditLog(ctx, user, "CREATE", "PROCEDURE_IMPORT", importId, {
      fileName: args.fileName,
      procedureDate: args.procedureDate,
    });

    return importId;
  },
});

/**
 * Process procedure patients and store predictions
 */
export const processProcedures = mutation({
  args: {
    importId: v.id("procedure_imports"),
    patients: v.array(
      v.object({
        mrn: v.string(),
        patientName: v.string(),
        procedureText: v.string(),
        visitDate: v.string(),
        provider: v.optional(v.string()),
        reasonForExam: v.optional(v.string()),
        age: v.optional(v.number()),
        sex: v.optional(v.string()),
        ef: v.optional(v.number()),
        creatinine: v.optional(v.number()),
        hemoglobin: v.optional(v.number()),
        csn: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) throw new Error("Import not found");

    await requireHospitalAccess(ctx, importRecord.hospitalId);

    const now = Date.now();
    const hospitalId = importRecord.hospitalId;

    let created = 0;
    let updated = 0;
    let willAdmitCount = 0;
    let sameDayCount = 0;
    let riskModifiedCount = 0;
    let ccuDays = 0;
    let floorDays = 0;
    const errors: string[] = [];

    for (const patient of args.patients) {
      try {
        // Generate prediction
        const prediction = predictDisposition({
          procedureText: patient.procedureText,
          patientName: patient.patientName,
          age: patient.age,
          ef: patient.ef,
          creatinine: patient.creatinine,
          hemoglobin: patient.hemoglobin,
        });

        // Convert name to initials
        const initials = nameToInitials(patient.patientName);

        // Parse sex if not provided
        const sex = patient.sex || parseSexFromName(patient.patientName);

        // Check for existing patient by MRN + visitDate (prevent duplicates)
        const existingPatient = await ctx.db
          .query("procedure_patients")
          .withIndex("by_mrn", (q) => q.eq("hospitalId", hospitalId).eq("mrn", patient.mrn))
          .filter((q) => q.eq(q.field("visitDate"), patient.visitDate))
          .first();

        if (existingPatient) {
          // Update existing patient record
          await ctx.db.patch(existingPatient._id, {
            importId: args.importId,
            patientName: patient.patientName,
            initials,
            age: patient.age,
            sex,
            procedureText: patient.procedureText,
            procedureCategory: prediction.procedureCategory,
            provider: patient.provider,
            reasonForExam: patient.reasonForExam,
            ef: patient.ef,
            creatinine: patient.creatinine,
            hemoglobin: patient.hemoglobin,
            csn: patient.csn,
            willAdmit: prediction.willAdmit,
            totalLOS: prediction.totalLOS,
            icuDays: prediction.icuDays,
            icuUnit: prediction.icuUnit || undefined,
            floorDays: prediction.floorDays,
            floorUnit: prediction.floorUnit || undefined,
            riskFactors: prediction.riskFactors,
            riskModified: prediction.riskModified,
            reasoning: prediction.reasoning,
            isActive: true,
            updatedAt: now,
          });
          updated++;
        } else {
          // Create new patient record
          await ctx.db.insert("procedure_patients", {
            hospitalId,
            importId: args.importId,
            mrn: patient.mrn,
            patientName: patient.patientName,
            initials,
            age: patient.age,
            sex,
            procedureText: patient.procedureText,
            procedureCategory: prediction.procedureCategory,
            visitDate: patient.visitDate,
            provider: patient.provider,
            reasonForExam: patient.reasonForExam,
            ef: patient.ef,
            creatinine: patient.creatinine,
            hemoglobin: patient.hemoglobin,
            csn: patient.csn,
            willAdmit: prediction.willAdmit,
            totalLOS: prediction.totalLOS,
            icuDays: prediction.icuDays,
            icuUnit: prediction.icuUnit || undefined,
            floorDays: prediction.floorDays,
            floorUnit: prediction.floorUnit || undefined,
            riskFactors: prediction.riskFactors,
            riskModified: prediction.riskModified,
            reasoning: prediction.reasoning,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          });
          created++;
        }

        // Update counts
        if (prediction.willAdmit) {
          willAdmitCount++;
        } else {
          sameDayCount++;
        }
        if (prediction.riskModified) {
          riskModifiedCount++;
        }
        if (prediction.icuUnit === "CCU") {
          ccuDays += prediction.icuDays;
        }
        if (prediction.floorUnit === "N07E") {
          floorDays += prediction.floorDays;
        }
      } catch (error) {
        errors.push(
          `MRN ${patient.mrn}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    // Update import statistics
    await ctx.db.patch(args.importId, {
      patientsProcessed: created + updated,
      willAdmit: willAdmitCount,
      sameDayDischarge: sameDayCount,
      riskModifiedAdmits: riskModifiedCount,
      ccuBedDays: ccuDays,
      floorBedDays: floorDays,
      status: "completed",
      errors: errors.length > 0 ? errors : undefined,
    });

    return {
      created,
      updated,
      willAdmit: willAdmitCount,
      sameDayDischarge: sameDayCount,
      riskModifiedAdmits: riskModifiedCount,
      ccuBedDays: ccuDays,
      floorBedDays: floorDays,
      errors,
    };
  },
});

/**
 * Deactivate a procedure import and its patients
 */
export const deactivateImport = mutation({
  args: {
    importId: v.id("procedure_imports"),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) throw new Error("Import not found");

    await requireHospitalAccess(ctx, importRecord.hospitalId);

    // Deactivate import
    await ctx.db.patch(args.importId, { isActive: false });

    // Deactivate all patients from this import
    const patients = await ctx.db
      .query("procedure_patients")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .collect();

    for (const patient of patients) {
      await ctx.db.patch(patient._id, { isActive: false });
    }

    await auditLog(ctx, user, "DEACTIVATE", "PROCEDURE_IMPORT", args.importId, {
      patientsDeactivated: patients.length,
    });

    return { deactivated: patients.length };
  },
});

/**
 * Clear all procedure data for a hospital (hard delete)
 * Uses action with batched mutations to avoid Convex write limits
 */
export const clearAllProcedures = action({
  args: {
    hospitalId: v.id("hospitals"),
  },
  handler: async (ctx, args): Promise<{ patientsDeleted: number; importsDeleted: number }> => {
    // Get all patient and import IDs
    const { patientIds, importIds } = await ctx.runQuery(
      internal.procedures.getClearableIds,
      { hospitalId: args.hospitalId }
    );

    const totalPatients = patientIds.length;
    const totalImports = importIds.length;

    // Delete patients in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < patientIds.length; i += BATCH_SIZE) {
      const batch = patientIds.slice(i, i + BATCH_SIZE);
      await ctx.runMutation(internal.procedures.deleteProcedureBatch, {
        patientIds: batch,
        importIds: [],
      });
    }

    // Delete imports in one batch (usually just a few)
    if (importIds.length > 0) {
      await ctx.runMutation(internal.procedures.deleteProcedureBatch, {
        patientIds: [],
        importIds,
      });
    }

    // Log the clear action
    await ctx.runMutation(internal.procedures.logClearAction, {
      hospitalId: args.hospitalId,
      patientsDeleted: totalPatients,
      importsDeleted: totalImports,
    });

    return {
      patientsDeleted: totalPatients,
      importsDeleted: totalImports,
    };
  },
});

/**
 * Internal query to get IDs for clearing
 */
export const getClearableIds = internalQuery({
  args: {
    hospitalId: v.id("hospitals"),
  },
  handler: async (ctx, args) => {
    const patients = await ctx.db
      .query("procedure_patients")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
      .collect();

    const imports = await ctx.db
      .query("procedure_imports")
      .withIndex("by_hospital", (q) => q.eq("hospitalId", args.hospitalId))
      .collect();

    return {
      patientIds: patients.map((p) => p._id),
      importIds: imports.map((i) => i._id),
    };
  },
});

/**
 * Internal mutation to delete a batch of procedures
 */
export const deleteProcedureBatch = internalMutation({
  args: {
    patientIds: v.array(v.id("procedure_patients")),
    importIds: v.array(v.id("procedure_imports")),
  },
  handler: async (ctx, args) => {
    for (const id of args.patientIds) {
      await ctx.db.delete(id);
    }
    for (const id of args.importIds) {
      await ctx.db.delete(id);
    }
  },
});

/**
 * Internal mutation to log clear action
 */
export const logClearAction = internalMutation({
  args: {
    hospitalId: v.id("hospitals"),
    patientsDeleted: v.number(),
    importsDeleted: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await auditLog(ctx, user, "CLEAR", "PROCEDURE_IMPORT", args.hospitalId, {
      patientsDeleted: args.patientsDeleted,
      importsDeleted: args.importsDeleted,
    });
  },
});

// ═══════════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS (for use by actions)
// ═══════════════════════════════════════════════════════════════════

/**
 * Internal: Create a new procedure import record (for action use)
 */
export const internalCreateImport = internalMutation({
  args: {
    hospitalId: v.id("hospitals"),
    healthSystemId: v.id("health_systems"),
    fileName: v.string(),
    procedureDate: v.string(),
    importedBy: v.id("users"),
  },
  handler: async (ctx, args): Promise<Id<"procedure_imports">> => {
    const importId = await ctx.db.insert("procedure_imports", {
      hospitalId: args.hospitalId,
      healthSystemId: args.healthSystemId,
      fileName: args.fileName,
      procedureDate: args.procedureDate,
      patientsProcessed: 0,
      willAdmit: 0,
      sameDayDischarge: 0,
      riskModifiedAdmits: 0,
      ccuBedDays: 0,
      floorBedDays: 0,
      status: "pending",
      importedAt: Date.now(),
      importedBy: args.importedBy,
      isActive: true,
    });

    return importId;
  },
});

/**
 * Internal: Process procedure patients and store predictions (for action use)
 */
export const internalProcessProcedures = internalMutation({
  args: {
    importId: v.id("procedure_imports"),
    hospitalId: v.id("hospitals"),
    patients: v.array(
      v.object({
        mrn: v.string(),
        patientName: v.string(),
        procedureText: v.string(),
        visitDate: v.string(),
        provider: v.optional(v.string()),
        reasonForExam: v.optional(v.string()),
        age: v.optional(v.number()),
        sex: v.optional(v.string()),
        ef: v.optional(v.number()),
        creatinine: v.optional(v.number()),
        hemoglobin: v.optional(v.number()),
        csn: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const hospitalId = args.hospitalId;

    let created = 0;
    let willAdmitCount = 0;
    let sameDayCount = 0;
    let riskModifiedCount = 0;
    let ccuDays = 0;
    let floorDays = 0;
    const errors: string[] = [];

    for (const patient of args.patients) {
      try {
        // Generate prediction
        const prediction = predictDisposition({
          procedureText: patient.procedureText,
          patientName: patient.patientName,
          age: patient.age,
          ef: patient.ef,
          creatinine: patient.creatinine,
          hemoglobin: patient.hemoglobin,
        });

        // Convert name to initials
        const initials = nameToInitials(patient.patientName);

        // Parse sex if not provided
        const sex = patient.sex || parseSexFromName(patient.patientName);

        // Create patient record
        await ctx.db.insert("procedure_patients", {
          hospitalId,
          importId: args.importId,
          mrn: patient.mrn,
          patientName: patient.patientName,
          initials,
          age: patient.age,
          sex,
          procedureText: patient.procedureText,
          procedureCategory: prediction.procedureCategory,
          visitDate: patient.visitDate,
          provider: patient.provider,
          reasonForExam: patient.reasonForExam,
          ef: patient.ef,
          creatinine: patient.creatinine,
          hemoglobin: patient.hemoglobin,
          csn: patient.csn,
          willAdmit: prediction.willAdmit,
          totalLOS: prediction.totalLOS,
          icuDays: prediction.icuDays,
          icuUnit: prediction.icuUnit || undefined,
          floorDays: prediction.floorDays,
          floorUnit: prediction.floorUnit || undefined,
          riskFactors: prediction.riskFactors,
          riskModified: prediction.riskModified,
          reasoning: prediction.reasoning,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });

        created++;

        // Update counts
        if (prediction.willAdmit) {
          willAdmitCount++;
        } else {
          sameDayCount++;
        }
        if (prediction.riskModified) {
          riskModifiedCount++;
        }
        if (prediction.icuUnit === "CCU") {
          ccuDays += prediction.icuDays;
        }
        if (prediction.floorUnit === "N07E") {
          floorDays += prediction.floorDays;
        }
      } catch (error) {
        errors.push(
          `MRN ${patient.mrn}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    // Update import statistics
    await ctx.db.patch(args.importId, {
      patientsProcessed: created,
      willAdmit: willAdmitCount,
      sameDayDischarge: sameDayCount,
      riskModifiedAdmits: riskModifiedCount,
      ccuBedDays: ccuDays,
      floorBedDays: floorDays,
      status: "completed",
      errors: errors.length > 0 ? errors : undefined,
    });

    return {
      created,
      willAdmit: willAdmitCount,
      sameDayDischarge: sameDayCount,
      riskModifiedAdmits: riskModifiedCount,
      ccuBedDays: ccuDays,
      floorBedDays: floorDays,
      errors,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Process a procedure CSV file
 * Parses CSV content, generates predictions, and stores results
 */
export const processProcedureCSV = action({
  args: {
    hospitalId: v.id("hospitals"),
    fileName: v.string(),
    procedureDate: v.string(),
    csvContent: v.string(),
  },
  handler: async (ctx, args): Promise<{
    importId: Id<"procedure_imports">;
    created: number;
    willAdmit: number;
    sameDayDischarge: number;
    riskModifiedAdmits: number;
    ccuBedDays: number;
    floorBedDays: number;
    errors: string[];
  }> => {
    // Parse CSV
    const rows = parseCSV(args.csvContent);
    if (rows.length === 0) {
      throw new Error("No valid data rows found in CSV");
    }

    // Parse patients from CSV
    const patients: Array<{
      mrn: string;
      patientName: string;
      procedureText: string;
      visitDate: string;
      provider?: string;
      reasonForExam?: string;
      age?: number;
      sex?: string;
      ef?: number;
      creatinine?: number;
      hemoglobin?: number;
      csn?: string;
    }> = [];

    for (const row of rows) {
      const input = parseCSVRow(row);

      // Skip rows without MRN or procedure
      if (!input.mrn || !input.procedureText) continue;

      patients.push({
        mrn: input.mrn,
        patientName: input.patientName,
        procedureText: input.procedureText,
        visitDate: input.visitDate || args.procedureDate,
        provider: input.provider,
        reasonForExam: input.reasonForExam,
        age: input.age,
        sex: parseSexFromName(input.patientName),
        ef: input.ef,
        creatinine: input.creatinine,
        hemoglobin: input.hemoglobin,
      });
    }

    if (patients.length === 0) {
      throw new Error("No valid patient records found in CSV");
    }

    // Get hospital to get health system ID and verify access
    const hospital = await ctx.runQuery(internal.procedures.internalGetHospital, {
      hospitalId: args.hospitalId,
    });

    if (!hospital) {
      throw new Error("Hospital not found");
    }

    // Get current user
    const user = await ctx.runQuery(internal.procedures.internalGetCurrentUser, {});

    if (!user) {
      throw new Error("User not found");
    }

    // Create import record
    const importId = await ctx.runMutation(internal.procedures.internalCreateImport, {
      hospitalId: args.hospitalId,
      healthSystemId: hospital.healthSystemId,
      fileName: args.fileName,
      procedureDate: args.procedureDate,
      importedBy: user._id,
    });

    // Process patients and store predictions
    const result = await ctx.runMutation(internal.procedures.internalProcessProcedures, {
      importId,
      hospitalId: args.hospitalId,
      patients,
    });

    return {
      importId,
      ...result,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// INTERNAL QUERIES (for use by actions)
// ═══════════════════════════════════════════════════════════════════

/**
 * Internal: Get hospital (for action use)
 */
export const internalGetHospital = internalQuery({
  args: {
    hospitalId: v.id("hospitals"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.hospitalId);
  },
});

/**
 * Internal: Get current user (for action use)
 */
export const internalGetCurrentUser = internalQuery({
  args: {},
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
