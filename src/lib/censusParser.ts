/**
 * Census Excel Parser
 * Parses single-sheet or multi-sheet Excel files with patient census data
 * Supports the Cardiology Service Line format with Unit column
 */

import * as XLSX from "xlsx";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface CensusPatient {
  mrn: string;
  patientName: string; // Full name "Last, First"
  initials: string; // Derived "LF"
  unitName: string; // From Unit column or sheet name
  unitType: "icu" | "floor";
  service?: string;
  admissionDate: string;
  losDays?: number;
  attendingDoctor?: string;
  // Demographics from CSV
  sex?: string;
  dob?: string;
  age?: number;
  language?: string;
  csn?: string;
  // AI-generated fields (may be pre-populated in structured imports)
  primaryDiagnosis?: string;
  clinicalStatus?: string;
  dispositionConsiderations?: string;
  projectedDischargeDays?: number;
  // For AI processing workflow
  rawClinicalNotes?: string;
  rawGeneralComments?: string; // Column Q - unstructured clinical notes
  // Additional fields from source
  dischargeStatus?: string; // "Definite", "Possible", "> 48 Hours", etc.
  room?: string;
  bed?: string;
  // 1:1 Nursing detection
  requiresOneToOne: boolean;
  oneToOneDevices: string[];
}

export interface CensusSheet {
  name: string;
  unitType: "icu" | "floor";
  patients: CensusPatient[];
  date?: string;
}

export interface CensusParseResult {
  sheets: CensusSheet[];
  totalPatients: number;
  icuPatients: number;
  floorPatients: number;
  censusDate: string;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

// Unit type detection patterns (ICU units)
const ICU_PATTERNS = ["CCU", "CSIU", "CVU", "ICU", "CICU", "MSM", "SICU", "MICU", "NICU"];
const SKIP_SHEETS = ["Summary", "Template", "Instructions"];

// Column name patterns for flexible matching
const COLUMN_PATTERNS = {
  mrn: ["mrn", "medical record", "med rec"],
  patient: ["patient", "name", "pt name", "patient name"],
  unit: ["unit", "location", "floor", "ward"],
  admissionDate: ["admission date", "admit date", "admission_date", "admit_date", "adm date"],
  losDays: ["los", "los (days)", "los_days", "length of stay", "days"],
  service: ["service", "svc"],
  attending: ["attending", "dr.", "doctor", "physician", "md"],
  primaryDx: ["primary dx", "primary diagnosis", "diagnosis", "dx", "primary_dx"],
  generalComments: ["general comments", "comments", "notes", "clinical notes", "comment"],
  dischargeToday: ["discharge today", "discharge today?", "dc today", "dispo", "discharge status"],
  room: ["room", "rm"],
  bed: ["bed"],
  // New demographic columns
  sex: ["sex", "gender"],
  dob: ["dob", "date of birth", "birth date", "birthdate"],
  age: ["age", "years"],
  language: ["language", "lang", "preferred language"],
  csn: ["csn", "contact serial", "encounter"],
};

// 1:1 Nursing detection keywords (NOT ventilator - that doesn't require 1:1)
const ONE_TO_ONE_KEYWORDS = ["ECMO", "CVVH", "IMPELLA", "IABP"];

// Map discharge status to projected days
const DISCHARGE_STATUS_TO_DAYS: Record<string, number> = {
  "definite": 0,
  "in 24-48 hours": 1,
  "possible": 2,
  "> 48 hours": 4,
  "> 48 hours (medically acute)": 5,
  "medically acute": 5,
};

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect if a unit name is ICU or floor based on patterns
 */
export function detectUnitType(unitName: string): "icu" | "floor" {
  const upperName = unitName.toUpperCase();
  return ICU_PATTERNS.some((pattern) => upperName.includes(pattern)) ? "icu" : "floor";
}

/**
 * Detect 1:1 nursing devices in clinical text
 * Returns array of detected device names (ECMO, CVVH, Impella, IABP)
 * NOTE: Ventilator/intubation does NOT require 1:1 nursing
 */
export function detectOneToOneDevices(text: string): string[] {
  if (!text) return [];
  const upperText = text.toUpperCase();
  return ONE_TO_ONE_KEYWORDS.filter((keyword) => upperText.includes(keyword));
}

/**
 * Check if patient requires 1:1 nursing based on clinical text
 */
export function requiresOneToOneNursing(text: string): boolean {
  return detectOneToOneDevices(text).length > 0;
}

/**
 * Convert full name to initials
 * "Johnson, Bob" -> "JB"
 * "Bob Johnson" -> "BJ"
 */
export function nameToInitials(fullName: string): string {
  if (!fullName) return "";

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

/**
 * Normalize date to ISO format (YYYY-MM-DD)
 */
export function normalizeDate(dateValue: unknown): string {
  if (!dateValue) return "";

  // Handle Excel serial date numbers
  if (typeof dateValue === "number") {
    const date = XLSX.SSF.parse_date_code(dateValue);
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }

  const dateStr = String(dateValue).trim();

  // Handle MM/DD/YY format
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Handle YYYY-MM-DD format (already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try to parse with Date
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return dateStr;
}

/**
 * Find column name by pattern matching
 */
function findColumnName(headers: string[], patterns: string[]): string | undefined {
  const lowerHeaders = headers.map((h) => (h || "").toLowerCase().trim());

  for (const pattern of patterns) {
    const index = lowerHeaders.findIndex((h) => h.includes(pattern.toLowerCase()));
    if (index !== -1) return headers[index];
  }

  return undefined;
}

/**
 * Map discharge status text to projected days
 */
function mapDischargeStatusToDays(status: string): number | undefined {
  if (!status) return undefined;

  const lower = status.toLowerCase().trim();

  // Check exact matches first
  for (const [key, days] of Object.entries(DISCHARGE_STATUS_TO_DAYS)) {
    if (lower === key || lower.includes(key)) {
      return days;
    }
  }

  return undefined;
}

/**
 * Extract census date from sheet name (e.g., "01.07" -> 2026-01-07)
 */
function extractDateFromSheetName(sheetName: string): string | undefined {
  // Match MM.DD format
  const match = sheetName.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (match) {
    const [, month, day] = match;
    const year = new Date().getFullYear();
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return undefined;
}

/**
 * Check if import has structured data (pre-populated predictions)
 */
export function hasStructuredData(result: CensusParseResult): boolean {
  return result.sheets.some((sheet) =>
    sheet.patients.some(
      (p) => p.primaryDiagnosis || p.clinicalStatus || p.dispositionConsiderations
    )
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PARSER
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse census Excel file
 * Supports both:
 * 1. Single-sheet format with Unit column (Cardiology Service Line format)
 * 2. Multi-sheet format (one sheet per unit)
 */
export function parseCensusExcel(data: ArrayBuffer): CensusParseResult {
  const workbook = XLSX.read(data, { type: "array" });

  const result: CensusParseResult = {
    sheets: [],
    totalPatients: 0,
    icuPatients: 0,
    floorPatients: 0,
    censusDate: new Date().toISOString().split("T")[0],
    errors: [],
  };

  // Process each sheet
  for (const sheetName of workbook.SheetNames) {
    // Skip summary/template sheets
    if (SKIP_SHEETS.some((skip) => sheetName.toLowerCase().includes(skip.toLowerCase()))) {
      continue;
    }

    const sheet = workbook.Sheets[sheetName];

    // Try to extract date from sheet name (e.g., "01.07")
    const sheetDate = extractDateFromSheetName(sheetName);
    if (sheetDate) {
      result.censusDate = sheetDate;
    }

    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });

    if (jsonData.length === 0) continue;

    // Get headers from first object
    const headers = Object.keys(jsonData[0] || {});

    // Find column names
    const columns = {
      mrn: findColumnName(headers, COLUMN_PATTERNS.mrn),
      patient: findColumnName(headers, COLUMN_PATTERNS.patient),
      unit: findColumnName(headers, COLUMN_PATTERNS.unit),
      admissionDate: findColumnName(headers, COLUMN_PATTERNS.admissionDate),
      losDays: findColumnName(headers, COLUMN_PATTERNS.losDays),
      service: findColumnName(headers, COLUMN_PATTERNS.service),
      attending: findColumnName(headers, COLUMN_PATTERNS.attending),
      primaryDx: findColumnName(headers, COLUMN_PATTERNS.primaryDx),
      generalComments: findColumnName(headers, COLUMN_PATTERNS.generalComments),
      dischargeToday: findColumnName(headers, COLUMN_PATTERNS.dischargeToday),
      room: findColumnName(headers, COLUMN_PATTERNS.room),
      bed: findColumnName(headers, COLUMN_PATTERNS.bed),
      // New demographic columns
      sex: findColumnName(headers, COLUMN_PATTERNS.sex),
      dob: findColumnName(headers, COLUMN_PATTERNS.dob),
      age: findColumnName(headers, COLUMN_PATTERNS.age),
      language: findColumnName(headers, COLUMN_PATTERNS.language),
      csn: findColumnName(headers, COLUMN_PATTERNS.csn),
    };

    // Validate required columns
    if (!columns.mrn) {
      result.errors.push(`Sheet "${sheetName}": Missing MRN column`);
      continue;
    }
    if (!columns.patient) {
      result.errors.push(`Sheet "${sheetName}": Missing Patient name column`);
      continue;
    }

    // Check if this is single-sheet format (has Unit column) or multi-sheet format
    const isSingleSheetFormat = !!columns.unit;

    // Group patients by unit (for single-sheet format)
    const patientsByUnit = new Map<string, CensusPatient[]>();

    // Parse each row
    for (let rowIdx = 0; rowIdx < jsonData.length; rowIdx++) {
      const row = jsonData[rowIdx];

      // Get MRN - skip if empty
      const mrn = String(row[columns.mrn!] || "").trim();
      if (!mrn) continue;

      // Get patient name
      const patientName = String(row[columns.patient!] || "").trim();
      if (!patientName) continue;

      // Skip header rows that might have been included
      if (patientName.toLowerCase() === "patient" || mrn.toLowerCase() === "mrn") {
        continue;
      }

      try {
        // Determine unit name
        const unitName = isSingleSheetFormat && columns.unit
          ? String(row[columns.unit] || "").trim() || sheetName
          : sheetName;

        const unitType = detectUnitType(unitName);

        // Get admission date
        const admissionDate = columns.admissionDate
          ? normalizeDate(row[columns.admissionDate])
          : result.censusDate;

        // Get LOS days
        let losDays: number | undefined;
        if (columns.losDays) {
          const los = row[columns.losDays];
          losDays = los ? parseInt(String(los), 10) || undefined : undefined;
        }

        // Get discharge status and map to projected days
        let dischargeStatus: string | undefined;
        let projectedDischargeDays: number | undefined;
        if (columns.dischargeToday) {
          dischargeStatus = String(row[columns.dischargeToday] || "").trim() || undefined;
          projectedDischargeDays = mapDischargeStatusToDays(dischargeStatus || "");
        }

        // Get primary diagnosis
        const primaryDiagnosis = columns.primaryDx
          ? String(row[columns.primaryDx] || "").trim() || undefined
          : undefined;

        // Get general comments as clinical status/notes
        const generalComments = columns.generalComments
          ? String(row[columns.generalComments] || "").trim() || undefined
          : undefined;

        // Detect 1:1 nursing requirements from clinical notes
        // Check both primary diagnosis and general comments for ECMO, CVVH, Impella, IABP
        const clinicalText = [primaryDiagnosis || "", generalComments || ""].join(" ");
        const oneToOneDevices = detectOneToOneDevices(clinicalText);
        const requiresOneToOne = oneToOneDevices.length > 0;

        // Extract demographics
        const sex = columns.sex
          ? String(row[columns.sex] || "").trim() || undefined
          : undefined;
        const dob = columns.dob ? normalizeDate(row[columns.dob]) || undefined : undefined;
        const age = columns.age
          ? parseInt(String(row[columns.age] || ""), 10) || undefined
          : undefined;
        const language = columns.language
          ? String(row[columns.language] || "").trim() || undefined
          : undefined;
        const csn = columns.csn
          ? String(row[columns.csn] || "").trim() || undefined
          : undefined;

        const patient: CensusPatient = {
          mrn,
          patientName,
          initials: nameToInitials(patientName),
          unitName,
          unitType,
          admissionDate,
          losDays,
          service: columns.service
            ? String(row[columns.service] || "").trim() || undefined
            : undefined,
          attendingDoctor: columns.attending
            ? String(row[columns.attending] || "").trim() || undefined
            : undefined,
          // Demographics
          sex,
          dob,
          age,
          language,
          csn,
          // Clinical data
          primaryDiagnosis,
          clinicalStatus: generalComments,
          rawClinicalNotes: generalComments,
          rawGeneralComments: generalComments,
          dischargeStatus,
          projectedDischargeDays,
          room: columns.room
            ? String(row[columns.room] || "").trim() || undefined
            : undefined,
          bed: columns.bed
            ? String(row[columns.bed] || "").trim() || undefined
            : undefined,
          // 1:1 Nursing detection
          requiresOneToOne,
          oneToOneDevices,
        };

        // Group by unit
        if (!patientsByUnit.has(unitName)) {
          patientsByUnit.set(unitName, []);
        }
        patientsByUnit.get(unitName)!.push(patient);
      } catch (error) {
        result.errors.push(
          `Sheet "${sheetName}" row ${rowIdx + 2}: ${error instanceof Error ? error.message : "Parse error"}`
        );
      }
    }

    // Create sheets from grouped patients
    for (const [unitName, patients] of patientsByUnit) {
      if (patients.length > 0) {
        const unitType = patients[0].unitType;

        result.sheets.push({
          name: unitName,
          unitType,
          patients,
          date: sheetDate,
        });

        result.totalPatients += patients.length;
        if (unitType === "icu") {
          result.icuPatients += patients.length;
        } else {
          result.floorPatients += patients.length;
        }
      }
    }
  }

  return result;
}

/**
 * Get parse statistics summary
 */
export function getParseStats(result: CensusParseResult): {
  totalSheets: number;
  icuSheets: number;
  floorSheets: number;
  totalPatients: number;
  icuPatients: number;
  floorPatients: number;
  hasStructuredData: boolean;
  errorCount: number;
} {
  return {
    totalSheets: result.sheets.length,
    icuSheets: result.sheets.filter((s) => s.unitType === "icu").length,
    floorSheets: result.sheets.filter((s) => s.unitType === "floor").length,
    totalPatients: result.totalPatients,
    icuPatients: result.icuPatients,
    floorPatients: result.floorPatients,
    hasStructuredData: hasStructuredData(result),
    errorCount: result.errors.length,
  };
}
