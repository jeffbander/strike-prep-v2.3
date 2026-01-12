/**
 * Procedure Disposition Prediction Module
 * Predicts admission status, LOS, and unit assignments for scheduled cath lab and EP lab procedures.
 */

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export interface DispositionPrediction {
  willAdmit: boolean;
  totalLOS: number;
  icuDays: number;
  icuUnit: string | null; // "CCU" or null
  floorDays: number;
  floorUnit: string | null; // "N07E" or null
  procedureCategory: ProcedureCategory;
  riskFactors: RiskFactor[];
  riskModified: boolean;
  reasoning: string;
}

export type ProcedureCategory =
  | "TAVR"
  | "VT_ABLATION"
  | "PCI_STENT"
  | "PERIPHERAL_INTERVENTION"
  | "AFIB_ABLATION"
  | "FLUTTER_ABLATION"
  | "SVT_ABLATION"
  | "PVC_ABLATION"
  | "PPM_IMPLANT"
  | "ICD_IMPLANT"
  | "PFO_CLOSURE"
  | "BAV"
  | "DIAGNOSTIC_CATH"
  | "TEE"
  | "VENOGRAM"
  | "CARDIOVERSION"
  | "TILT_TABLE"
  | "LOOP_RECORDER"
  | "GENERATOR_CHANGE"
  | "UNKNOWN";

export type RiskFactor = "age_gt_85" | "ef_lt_30" | "cr_gt_1.5" | "hgb_lt_10";

export interface ProcedurePatientInput {
  procedureText: string;
  patientName: string; // "LastName, F (60 y.o. M)" format
  age?: number; // Parsed from patientName if not provided
  ef?: number; // Last Ejection Fraction Value
  creatinine?: number; // May include "mg/dL" suffix
  hemoglobin?: number; // g/dL value
  mrn?: string;
  visitDate?: string;
  provider?: string;
  reasonForExam?: string;
}

export interface ProcedureSummary {
  totalPatients: number;
  willAdmit: number;
  sameDayDischarge: number;
  riskModifiedAdmits: number;
  bedCountsByUnit: {
    CCU: number;
    N07E: number;
  };
  totalICUDays: number;
  totalFloorDays: number;
  byCategory: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════════════
// PROCEDURE CLASSIFICATION PATTERNS
// ═══════════════════════════════════════════════════════════════════

interface ProcedurePattern {
  category: ProcedureCategory;
  patterns: RegExp[];
  cptCodes: string[];
}

const PROCEDURE_PATTERNS: ProcedurePattern[] = [
  // ICU + Floor Admits (3 days: 1 CCU + 2 N07E)
  {
    category: "TAVR",
    patterns: [/\bTAVR\b/i, /transcatheter\s*aortic\s*valve/i],
    cptCodes: ["33361"],
  },
  {
    category: "VT_ABLATION",
    patterns: [/\bVT\s*ABLATION\b/i, /ventricular\s*tachycardia\s*ablation/i, /VT\/PVC\/RFA/i],
    cptCodes: ["EP026"],
  },

  // Floor-Only Admits (1 day N07E)
  {
    category: "PCI_STENT",
    patterns: [/\bPCI\b/i, /\bSTENT\b/i, /percutaneous\s*coronary\s*intervention/i],
    cptCodes: ["92928"],
  },
  {
    category: "PERIPHERAL_INTERVENTION",
    patterns: [/\bPTA\b/i, /PERIPHERAL\s*POSS/i, /peripheral\s*intervention/i],
    cptCodes: ["37224", "CL022"],
  },
  {
    category: "AFIB_ABLATION",
    patterns: [/\bAFIB\s*ABLATION\b/i, /atrial\s*fibrillation\s*ablation/i, /AF\s*ABLATION/i],
    cptCodes: ["93656"],
  },
  {
    category: "FLUTTER_ABLATION",
    patterns: [/\bFLUTTER\s*ABLATION\b/i, /atrial\s*flutter\s*ablation/i, /AFL\s*ABLATION/i],
    cptCodes: ["EP064"],
  },
  {
    category: "SVT_ABLATION",
    patterns: [/\bSVT\s*ABLATION\b/i, /supraventricular\s*tachycardia\s*ablation/i],
    cptCodes: ["EP042"],
  },
  {
    category: "PVC_ABLATION",
    patterns: [/\bPVC\s*ABLATION\b/i, /premature\s*ventricular.*ablation/i],
    cptCodes: [], // PVC uses VT code when it's VT ablation
  },
  {
    category: "PPM_IMPLANT",
    patterns: [
      /\bPPM\s*IMPLANT\b/i,
      /pacemaker\s*implant/i,
      /\bPPM\b.*\b(single|dual|BIV)\b/i,
      /permanent\s*pacemaker/i,
      /UPGRADE\s*TO\s*BIV/i, // PPM upgrade
    ],
    cptCodes: ["33208", "EP037"],
  },
  {
    category: "ICD_IMPLANT",
    patterns: [/\bICD\s*IMPLANT\b/i, /defibrillator\s*implant/i, /\bAICD\s*IMPLANT\b/i],
    cptCodes: ["33249"],
  },

  // Structural interventions (1-day floor admit)
  {
    category: "PFO_CLOSURE",
    patterns: [/\bPFO\b/i, /patent\s*foramen\s*ovale/i],
    cptCodes: ["93580"],
  },
  {
    category: "BAV",
    patterns: [/\bBAV\b/i, /balloon\s*aortic\s*valvuloplasty/i],
    cptCodes: ["CL008"],
  },

  // Same-Day Discharge
  {
    category: "DIAGNOSTIC_CATH",
    patterns: [
      /\bCATH\s*POSS\b/i,
      /\bDIAGNOSTIC\s*CATH\b/i,
      /LEFT\s*HEART\s*CATH/i,
      /RIGHT\s*HEART\s*CATH/i,
      /LEFT\s*&\s*RIGHT\s*HEART\s*CATH/i,
      /\bLHC\b/i,
      /\bRHC\b/i,
      /CARIOMEM\s*IMPLANT/i, // Right heart cath with CardioMEMS
      /ENDOMYOCARDIAL\s*BIOPSY/i,
      /WITH\s*BIOPSY/i,
      /W\/BIOPSY/i,
    ],
    cptCodes: ["93452", "93460", "CL004", "33289", "93505", "CL038"],
  },
  {
    category: "TEE",
    patterns: [/\bTEE\b/i, /transesophageal\s*echo/i],
    cptCodes: ["93312"],
  },
  {
    category: "VENOGRAM",
    patterns: [/\bVENOGRAM\b/i],
    cptCodes: ["36005"],
  },
  {
    category: "CARDIOVERSION",
    patterns: [/\bCARDIOVERSION\b/i, /\bDCCV\b/i, /electrical\s*cardioversion/i],
    cptCodes: ["92960"],
  },
  {
    category: "TILT_TABLE",
    patterns: [/\bTILT\s*TABLE\b/i, /tilt\s*test/i],
    cptCodes: ["93660"],
  },
  {
    category: "LOOP_RECORDER",
    patterns: [
      /\bLOOP\s*RECORDER\b/i,
      /\bILR\b/i,
      /implantable\s*loop\s*recorder/i,
      /\bLINGQ\b/i,
      /loop\s*recorder\s*(implant|explant)/i,
    ],
    cptCodes: ["33285", "33286"],
  },
  {
    category: "GENERATOR_CHANGE",
    patterns: [
      /\bGENERATOR\s*CHANGE\b/i,
      /\bBATTERY\s*CHANGE\b/i,
      /\bPPM\s*CHANGE\b/i,
      /\bICD\s*CHANGE\b/i,
      /generator\s*replacement/i,
    ],
    cptCodes: ["33240"],
  },
];

// ═══════════════════════════════════════════════════════════════════
// DISPOSITION RULES
// ═══════════════════════════════════════════════════════════════════

interface DispositionRule {
  icuDays: number;
  icuUnit: string | null;
  floorDays: number;
  floorUnit: string | null;
  baseSameDay: boolean; // True if normally same-day discharge
  reasoning: string;
}

const DISPOSITION_RULES: Record<ProcedureCategory, DispositionRule> = {
  // ICU + Floor (3 days total)
  TAVR: {
    icuDays: 1,
    icuUnit: "CCU",
    floorDays: 2,
    floorUnit: "N07E",
    baseSameDay: false,
    reasoning: "TAVR: 1 day CCU + 2 days N07E",
  },
  VT_ABLATION: {
    icuDays: 1,
    icuUnit: "CCU",
    floorDays: 2,
    floorUnit: "N07E",
    baseSameDay: false,
    reasoning: "VT Ablation: 1 day CCU + 2 days N07E",
  },

  // Floor-only (1 day)
  PCI_STENT: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 1,
    floorUnit: "N07E",
    baseSameDay: false,
    reasoning: "PCI/Stent: 1 day N07E",
  },
  PERIPHERAL_INTERVENTION: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 1,
    floorUnit: "N07E",
    baseSameDay: false,
    reasoning: "Peripheral intervention: 1 day N07E",
  },
  AFIB_ABLATION: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 1,
    floorUnit: "N07E",
    baseSameDay: false,
    reasoning: "AFib ablation: 1 day N07E",
  },
  FLUTTER_ABLATION: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 1,
    floorUnit: "N07E",
    baseSameDay: false,
    reasoning: "Flutter ablation: 1 day N07E",
  },
  SVT_ABLATION: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 1,
    floorUnit: "N07E",
    baseSameDay: false,
    reasoning: "SVT ablation: 1 day N07E",
  },
  PVC_ABLATION: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 1,
    floorUnit: "N07E",
    baseSameDay: false,
    reasoning: "PVC ablation: 1 day N07E",
  },
  PPM_IMPLANT: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 1,
    floorUnit: "N07E",
    baseSameDay: false,
    reasoning: "PPM implant: 1 day N07E",
  },
  ICD_IMPLANT: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 1,
    floorUnit: "N07E",
    baseSameDay: false,
    reasoning: "ICD implant: 1 day N07E",
  },
  PFO_CLOSURE: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 1,
    floorUnit: "N07E",
    baseSameDay: false,
    reasoning: "PFO closure: 1 day N07E",
  },
  BAV: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 1,
    floorUnit: "N07E",
    baseSameDay: false,
    reasoning: "BAV: 1 day N07E",
  },

  // Same-day discharge
  DIAGNOSTIC_CATH: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 0,
    floorUnit: null,
    baseSameDay: true,
    reasoning: "Diagnostic cath: same-day discharge",
  },
  TEE: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 0,
    floorUnit: null,
    baseSameDay: true,
    reasoning: "TEE: same-day discharge",
  },
  VENOGRAM: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 0,
    floorUnit: null,
    baseSameDay: true,
    reasoning: "Venogram: same-day discharge",
  },
  CARDIOVERSION: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 0,
    floorUnit: null,
    baseSameDay: true,
    reasoning: "Cardioversion: same-day discharge",
  },
  TILT_TABLE: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 0,
    floorUnit: null,
    baseSameDay: true,
    reasoning: "Tilt table: same-day discharge",
  },
  LOOP_RECORDER: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 0,
    floorUnit: null,
    baseSameDay: true,
    reasoning: "Loop recorder: same-day discharge",
  },
  GENERATOR_CHANGE: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 0,
    floorUnit: null,
    baseSameDay: true,
    reasoning: "Generator change: same-day discharge",
  },

  // Unknown - default to floor admit for safety
  UNKNOWN: {
    icuDays: 0,
    icuUnit: null,
    floorDays: 1,
    floorUnit: "N07E",
    baseSameDay: false,
    reasoning: "Unknown procedure: defaulting to 1 day N07E",
  },
};

// ═══════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Classify procedure from text (procedure name + CPT code)
 */
export function classifyProcedure(procedureText: string): ProcedureCategory {
  const text = procedureText.toUpperCase();

  // Extract CPT code from brackets if present
  const cptMatch = text.match(/\[([A-Z0-9]+)\]/);
  const cptCode = cptMatch ? cptMatch[1] : null;

  // Check each pattern
  for (const proc of PROCEDURE_PATTERNS) {
    // Check CPT codes first (most specific)
    if (cptCode && proc.cptCodes.includes(cptCode)) {
      return proc.category;
    }

    // Check text patterns
    for (const pattern of proc.patterns) {
      if (pattern.test(procedureText)) {
        return proc.category;
      }
    }
  }

  // Special case: PVC ablation that's actually part of VT ablation
  if (/\bPVC\b/i.test(text) && /\bVT\b/i.test(text)) {
    return "VT_ABLATION";
  }

  return "UNKNOWN";
}

/**
 * Parse age from patient name format: "LastName, F (60 y.o. M)"
 */
export function parseAgeFromName(patientName: string): number | undefined {
  const ageMatch = patientName.match(/\((\d+)\s*y\.?o\.?\s*[MF]?\)/i);
  return ageMatch ? parseInt(ageMatch[1], 10) : undefined;
}

/**
 * Parse numeric value from string (handles "mg/dL" suffix, etc.)
 */
export function parseNumericValue(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return value;

  const numMatch = value.match(/[\d.]+/);
  return numMatch ? parseFloat(numMatch[0]) : undefined;
}

/**
 * Count risk factors and return list
 * Risk factors:
 * - Age > 85
 * - EF < 30%
 * - Creatinine > 1.5 mg/dL
 * - Hemoglobin < 10 g/dL
 */
export function countRiskFactors(
  age?: number,
  ef?: number,
  creatinine?: number,
  hemoglobin?: number
): { count: number; factors: RiskFactor[] } {
  const factors: RiskFactor[] = [];

  if (age !== undefined && age > 85) {
    factors.push("age_gt_85");
  }
  if (ef !== undefined && ef < 30) {
    factors.push("ef_lt_30");
  }
  if (creatinine !== undefined && creatinine > 1.5) {
    factors.push("cr_gt_1.5");
  }
  if (hemoglobin !== undefined && hemoglobin < 10) {
    factors.push("hgb_lt_10");
  }

  return { count: factors.length, factors };
}

/**
 * Main prediction function
 */
export function predictDisposition(patient: ProcedurePatientInput): DispositionPrediction {
  // Parse age from name if not provided
  const age = patient.age ?? parseAgeFromName(patient.patientName);

  // Parse numeric values
  const ef = parseNumericValue(patient.ef);
  const creatinine = parseNumericValue(patient.creatinine);
  const hemoglobin = parseNumericValue(patient.hemoglobin);

  // Classify procedure
  const procedureCategory = classifyProcedure(patient.procedureText);

  // Count risk factors
  const { count: riskCount, factors: riskFactors } = countRiskFactors(
    age,
    ef,
    creatinine,
    hemoglobin
  );

  // Get base disposition rule
  const rule = DISPOSITION_RULES[procedureCategory];

  // Check if risk modification applies (same-day procedures with >= 2 risk factors)
  const riskModified = rule.baseSameDay && riskCount >= 2;

  // Calculate final disposition
  let willAdmit: boolean;
  let totalLOS: number;
  let icuDays: number;
  let icuUnit: string | null;
  let floorDays: number;
  let floorUnit: string | null;
  let reasoning: string;

  if (riskModified) {
    // Convert same-day to 1-day floor admit
    willAdmit = true;
    icuDays = 0;
    icuUnit = null;
    floorDays = 1;
    floorUnit = "N07E";
    totalLOS = 1;
    reasoning = `${rule.reasoning.split(":")[0]}: normally same-day, converted to 1-day admit due to ${riskCount} risk factors (>= 2)`;
  } else {
    willAdmit = rule.icuDays > 0 || rule.floorDays > 0;
    icuDays = rule.icuDays;
    icuUnit = rule.icuUnit;
    floorDays = rule.floorDays;
    floorUnit = rule.floorUnit;
    totalLOS = icuDays + floorDays;
    reasoning = rule.reasoning;
  }

  return {
    willAdmit,
    totalLOS,
    icuDays,
    icuUnit,
    floorDays,
    floorUnit,
    procedureCategory,
    riskFactors,
    riskModified,
    reasoning,
  };
}

/**
 * Process multiple patients and generate summary
 */
export function processProcedurePatients(
  patients: ProcedurePatientInput[]
): {
  predictions: Array<ProcedurePatientInput & { prediction: DispositionPrediction }>;
  summary: ProcedureSummary;
} {
  const predictions = patients.map((patient) => ({
    ...patient,
    prediction: predictDisposition(patient),
  }));

  // Calculate summary
  const summary: ProcedureSummary = {
    totalPatients: patients.length,
    willAdmit: 0,
    sameDayDischarge: 0,
    riskModifiedAdmits: 0,
    bedCountsByUnit: {
      CCU: 0,
      N07E: 0,
    },
    totalICUDays: 0,
    totalFloorDays: 0,
    byCategory: {},
  };

  for (const { prediction } of predictions) {
    // Count admits vs same-day
    if (prediction.willAdmit) {
      summary.willAdmit++;
    } else {
      summary.sameDayDischarge++;
    }

    // Count risk-modified admits
    if (prediction.riskModified) {
      summary.riskModifiedAdmits++;
    }

    // Count bed days by unit
    if (prediction.icuUnit === "CCU") {
      summary.bedCountsByUnit.CCU += prediction.icuDays;
    }
    if (prediction.floorUnit === "N07E") {
      summary.bedCountsByUnit.N07E += prediction.floorDays;
    }

    // Total days
    summary.totalICUDays += prediction.icuDays;
    summary.totalFloorDays += prediction.floorDays;

    // Count by category
    summary.byCategory[prediction.procedureCategory] =
      (summary.byCategory[prediction.procedureCategory] || 0) + 1;
  }

  return { predictions, summary };
}

/**
 * Format risk factor for display
 */
export function formatRiskFactor(factor: RiskFactor): string {
  const labels: Record<RiskFactor, string> = {
    age_gt_85: "Age > 85",
    ef_lt_30: "EF < 30%",
    "cr_gt_1.5": "Cr > 1.5",
    hgb_lt_10: "Hgb < 10",
  };
  return labels[factor] || factor;
}

/**
 * Format procedure category for display
 */
export function formatProcedureCategory(category: ProcedureCategory): string {
  const labels: Record<ProcedureCategory, string> = {
    TAVR: "TAVR",
    VT_ABLATION: "VT Ablation",
    PCI_STENT: "PCI/Stent",
    PERIPHERAL_INTERVENTION: "Peripheral Intervention",
    AFIB_ABLATION: "AFib Ablation",
    FLUTTER_ABLATION: "Flutter Ablation",
    SVT_ABLATION: "SVT Ablation",
    PVC_ABLATION: "PVC Ablation",
    PPM_IMPLANT: "PPM Implant",
    ICD_IMPLANT: "ICD Implant",
    PFO_CLOSURE: "PFO Closure",
    BAV: "BAV",
    DIAGNOSTIC_CATH: "Diagnostic Cath",
    TEE: "TEE",
    VENOGRAM: "Venogram",
    CARDIOVERSION: "Cardioversion",
    TILT_TABLE: "Tilt Table",
    LOOP_RECORDER: "Loop Recorder",
    GENERATOR_CHANGE: "Generator Change",
    UNKNOWN: "Unknown",
  };
  return labels[category] || category;
}
