import { v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  extractClinicalSignals,
  assessTrajectory,
  estimateDowngradeDays,
  estimateHospitalDischargeDays,
  detectOneToOneDevices,
  requiresOneToOne as checkRequiresOneToOne,
  formatSignalsForPrompt,
  ClinicalSignals,
} from "./lib/clinicalSignals";

// ═══════════════════════════════════════════════════════════════════
// AI PROMPTS
// ═══════════════════════════════════════════════════════════════════

const ICU_PROMPT = `You are a clinical operations analyst reviewing cardiac/cardiothoracic ICU patient data for census management, discharge planning, and staffing predictions.

IMPORTANT - 1:1 NURSING DETECTION:
Identify patients requiring 1:1 nursing care. Look for these life support devices in the clinical notes:
- ECMO (Extracorporeal Membrane Oxygenation) - includes VV ECMO, VA ECMO
- CVVH (Continuous Venovenous Hemofiltration) / CRRT
- Impella (mechanical circulatory support)
- IABP (Intra-Aortic Balloon Pump)
NOTE: Ventilator/intubation alone does NOT require 1:1 nursing.

For each patient in the input, provide predictions in the following JSON format:
{
  "mrn": "patient MRN",
  "primaryDiagnosis": "3-5 sentences: age/sex, diagnosis, procedures (with POD#), complications, PMHx, allergies",
  "clinicalStatus": "Pipe-separated: POD#, Resp status, MCS (ECMO/IABP/Impella), Drips, Lines, Rhythm, Renal, Neuro",
  "dispositionConsiderations": "Trajectory (Improving/Stable/Worsening/Critical), Barriers, Downgrade potential, Est ICU stay",
  "pendingProcedures": "List all scheduled or pending procedures, tests, and consults that are barriers to discharge or part of the care plan. Include: scheduled surgeries or interventions (with date if known), pending imaging (CT, MRI, Echo, CTA), pending lab results (pathology, cultures), pending consults (EP, GI, PT/OT), procedures in planning phase. Write 'None' if no pending procedures. Examples: 'OR CABG tomorrow', 'PCI 1/7', 'PPM today (possible)', 'CT head pending, RHC with vasoreactivity testing', 'Pathology results pending', 'EP consult, Event monitor placement', 'None'",
  "projectedDischargeDays": integer (1-3: imminent, 4-7: short, 8-14: extended, 15-21: prolonged, 21-30: very prolonged, 30+: unable to predict),
  "losReasoning": "1-2 sentence explanation of WHY this patient will stay this long. Focus on the key clinical factors driving length of stay - e.g., 'Patient requires continued ventilator weaning and pressor support. Expected 5-7 more days until hemodynamically stable for floor transfer.'",
  "requiresOneToOne": boolean (true if patient has ECMO, CVVH, Impella, or IABP),
  "oneToOneDevices": ["ECMO", "Impella"] (array of detected devices, empty array if none),
  "predictedDowngrade": {
    "likely": boolean (true if patient likely to step down to floor soon),
    "daysUntilDowngrade": integer or null (estimated days until transfer to floor),
    "targetUnit": "7C" or null (suggested floor unit based on service/location pattern)
  }
}

Guidelines by Scenario:
- Uncomplicated CABG/valve: 2-4 days ICU, then step down to 7W/7C
- Uncomplicated OHT: 7-14 days ICU
- Post-lung transplant: 10-21 days ICU
- On ECMO: 14-30+ days (requires 1:1 nursing)
- On CVVH/CRRT: 7-21 days (requires 1:1 nursing)
- Impella bridge to transplant: 5-14 days (requires 1:1 nursing)
- IABP: 2-7 days (requires 1:1 nursing)
- Multi-organ failure: 21-30+ days

Downgrade Considerations:
- Patient improving, off pressors, stable rhythm → likely downgrade soon
- POD3-4 uncomplicated post-op → ready for floor
- Still on drips, unstable, or requiring close monitoring → not ready

Return a JSON array of predictions for all patients.`;

const FLOOR_PROMPT = `You are a clinical operations analyst reviewing non-ICU floor patient data focused on discharge planning, barriers, and functional status.

For each patient in the input, provide predictions in the following JSON format:
{
  "mrn": "patient MRN",
  "primaryDiagnosis": "2-3 sentence narrative: admission reason, key procedures, current phase",
  "clinicalStatus": "Pipe-separated: Resp (O2 req), Rhythm, Mobility (PT status), Diet, Access, Wounds, Key Meds, Labs",
  "dispositionConsiderations": "Destination (Home/SAR/SNF/LTACH), Barriers (placement/insurance/PT clearance), Requirements (VNA/O2/equipment)",
  "pendingProcedures": "List all scheduled or pending procedures, tests, and consults that are barriers to discharge or part of the care plan. Include: scheduled surgeries or interventions (with date if known), pending imaging (CT, MRI, Echo, CTA), pending lab results (pathology, cultures), pending consults (EP, GI, PT/OT), procedures in planning phase. Write 'None' if no pending procedures. Examples: 'OR CABG tomorrow', 'PCI 1/7', 'PPM today (possible)', 'CT head pending, RHC with vasoreactivity testing', 'Pathology results pending', 'EP consult, Event monitor placement', 'None'",
  "projectedDischargeDays": integer,
  "losReasoning": "1-2 sentence explanation of WHY this patient will stay this long. Focus on key discharge barriers - e.g., 'Awaiting SNF placement and PT clearance for safe discharge. Insurance approval expected in 2-3 days.'",
  "requiresOneToOne": false,
  "oneToOneDevices": []
}

NOTE: Floor patients typically do not require 1:1 nursing care. Set requiresOneToOne to false and oneToOneDevices to empty array.

Disposition Stratification:
- Likely Home 1-2 days: Post-routine PCI/TAVR, stable post-op POD 4-5+
- Extended 3-7 days: Awaiting procedures, optimization, pending placement
- Prolonged 7+ days: Multi-organ dysfunction, complex social situations

Return a JSON array of predictions for all patients.`;

// ═══════════════════════════════════════════════════════════════════
// INTERNAL QUERIES
// ═══════════════════════════════════════════════════════════════════

export const getPatientsForAI = internalQuery({
  args: {
    importId: v.id("census_imports"),
    unitType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("census_patients")
      .withIndex("by_import", (q) => q.eq("importId", args.importId));

    const patients = await query.collect();

    // Filter by unit type if specified
    if (args.unitType) {
      return patients.filter((p) => p.unitType === args.unitType);
    }

    return patients;
  },
});

export const getImportForAI = internalQuery({
  args: { importId: v.id("census_imports") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.importId);
  },
});

export const getUserForAI = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
  },
});

// ═══════════════════════════════════════════════════════════════════
// AI PREDICTION ACTION
// ═══════════════════════════════════════════════════════════════════

interface PatientPrediction {
  mrn: string;
  primaryDiagnosis?: string;
  clinicalStatus?: string;
  dispositionConsiderations?: string;
  pendingProcedures?: string;
  projectedDischargeDays?: number;
  losReasoning?: string; // AI explanation of LOS prediction
  // 1:1 Nursing detection
  requiresOneToOne?: boolean;
  oneToOneDevices?: string[];
  // Downgrade prediction (ICU only)
  predictedDowngrade?: {
    likely: boolean;
    daysUntilDowngrade: number | null;
    targetUnit: string | null;
  };
}

/**
 * Generate AI predictions for census patients
 * Uses Anthropic Claude to analyze clinical data and predict discharge timelines
 */
export const generatePredictions = action({
  args: {
    importId: v.id("census_imports"),
    unitType: v.optional(v.string()), // "icu" | "floor" | undefined (all)
    rawClinicalNotes: v.optional(v.string()), // Optional raw notes to analyze
  },
  handler: async (ctx, args): Promise<{ processed: number; errors: string[] }> => {
    const errors: string[] = [];
    let processed = 0;

    try {
      // Verify user is authenticated
      console.log("Checking user authentication...");
      const user = await ctx.runQuery(internal.censusAI.getUserForAI, {});
      if (!user) {
        return { processed: 0, errors: ["User not authenticated"] };
      }
      console.log("User authenticated:", user._id);

      // Get the import record
      console.log("Getting import record...");
      const importRecord = await ctx.runQuery(internal.censusAI.getImportForAI, {
        importId: args.importId,
      });
      if (!importRecord) {
        return { processed: 0, errors: ["Import not found"] };
      }
      console.log("Import found:", importRecord._id);

      // Get patients to process
      console.log("Getting patients...");
      const patients = await ctx.runQuery(internal.censusAI.getPatientsForAI, {
        importId: args.importId,
        unitType: args.unitType,
      });
      console.log("Found patients:", patients.length);

      if (patients.length === 0) {
        return { processed: 0, errors: ["No patients to process"] };
      }

      // Get Anthropic API key from environment
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return { processed: 0, errors: ["ANTHROPIC_API_KEY not configured. Please set it in Convex environment variables."] };
      }
      console.log("API key found, length:", apiKey.length);

    // Process patients in batches of 10
    const batchSize = 10;
    for (let i = 0; i < patients.length; i += batchSize) {
      const batch = patients.slice(i, i + batchSize);

      // Separate by unit type
      const icuPatients = batch.filter((p) => p.unitType === "icu");
      const floorPatients = batch.filter((p) => p.unitType === "floor");

      // Process ICU patients
      if (icuPatients.length > 0) {
        try {
          const predictions = await callAnthropic(apiKey, ICU_PROMPT, icuPatients, args.rawClinicalNotes);
          for (const pred of predictions) {
            const patient = icuPatients.find((p) => p.mrn === pred.mrn);
            if (patient) {
              // Calculate clinical signals locally for override
              const calculated = calculatePatientSignals(patient.rawGeneralComments, true);

              // Calculate predicted downgrade date using calculated days
              let predictedDowngradeDate: string | undefined;
              let predictedDowngradeUnit: string | undefined;
              const downgradeDays = calculated.downgradeDays;
              if (downgradeDays < 30) {
                const downgradeDate = new Date();
                downgradeDate.setDate(downgradeDate.getDate() + downgradeDays);
                predictedDowngradeDate = downgradeDate.toISOString().split("T")[0];
                predictedDowngradeUnit = pred.predictedDowngrade?.targetUnit || undefined;
              }

              await ctx.runMutation(internal.census.updatePatientPredictions, {
                patientId: patient._id,
                predictions: {
                  primaryDiagnosis: pred.primaryDiagnosis,
                  clinicalStatus: pred.clinicalStatus,
                  dispositionConsiderations: pred.dispositionConsiderations,
                  pendingProcedures: pred.pendingProcedures,
                  // Override with calculated values
                  projectedDischargeDays: calculated.dischargeDays,
                  projectedDowngradeDays: calculated.downgradeDays,
                  trajectory: calculated.trajectory,
                  losReasoning: pred.losReasoning,
                  // 1:1 Nursing detection - use calculated values
                  requiresOneToOne: calculated.requiresOneToOne,
                  oneToOneDevices: calculated.oneToOneDevices,
                  oneToOneSource: calculated.requiresOneToOne ? "signals" : undefined,
                  // Downgrade prediction
                  predictedDowngradeDate,
                  predictedDowngradeUnit,
                },
              });
              processed++;
            }
          }
        } catch (error) {
          errors.push(`ICU batch error: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }

      // Process Floor patients
      if (floorPatients.length > 0) {
        try {
          const predictions = await callAnthropic(apiKey, FLOOR_PROMPT, floorPatients, args.rawClinicalNotes);
          for (const pred of predictions) {
            const patient = floorPatients.find((p) => p.mrn === pred.mrn);
            if (patient) {
              // Calculate clinical signals locally for override
              const calculated = calculatePatientSignals(patient.rawGeneralComments, false);

              await ctx.runMutation(internal.census.updatePatientPredictions, {
                patientId: patient._id,
                predictions: {
                  primaryDiagnosis: pred.primaryDiagnosis,
                  clinicalStatus: pred.clinicalStatus,
                  dispositionConsiderations: pred.dispositionConsiderations,
                  pendingProcedures: pred.pendingProcedures,
                  // Override with calculated values
                  projectedDischargeDays: calculated.dischargeDays,
                  trajectory: calculated.trajectory,
                  losReasoning: pred.losReasoning,
                  // Floor patients - use calculated values for edge cases
                  requiresOneToOne: calculated.requiresOneToOne,
                  oneToOneDevices: calculated.oneToOneDevices,
                },
              });
              processed++;
            }
          }
        } catch (error) {
          errors.push(`Floor batch error: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    }

    // Update import with prediction count
    await ctx.runMutation(internal.census.updateImportPredictions, {
      importId: args.importId,
      predictionsGenerated: processed,
    });

    return { processed, errors };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Fatal error in generatePredictions:", errorMsg);
      return { processed, errors: [...errors, `Fatal error: ${errorMsg}`] };
    }
  },
});

/**
 * Extract clinical signals and calculate estimates for a patient
 */
function calculatePatientSignals(
  comments: string | undefined,
  isICU: boolean
): {
  signals: ClinicalSignals;
  trajectory: string;
  downgradeDays: number;
  dischargeDays: number;
  oneToOneDevices: string[];
  requiresOneToOne: boolean;
  signalsPrompt: string;
} {
  const signals = extractClinicalSignals(comments || "");
  const trajectory = assessTrajectory(comments || "", signals);
  const downgradeEstimate = estimateDowngradeDays(signals);
  const dischargeEstimate = estimateHospitalDischargeDays(signals, downgradeEstimate.days, isICU);
  const oneToOneDevices = detectOneToOneDevices(signals);
  const requiresOneToOne = checkRequiresOneToOne(signals);
  const signalsPrompt = formatSignalsForPrompt(signals, trajectory, downgradeEstimate.days, dischargeEstimate.days);

  return {
    signals,
    trajectory,
    downgradeDays: downgradeEstimate.days,
    dischargeDays: dischargeEstimate.days,
    oneToOneDevices,
    requiresOneToOne,
    signalsPrompt,
  };
}

/**
 * Call Anthropic Claude API to generate predictions
 */
async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  patients: Array<{
    mrn: string;
    initials: string;
    currentUnitName: string;
    admissionDate: string;
    service?: string;
    losDays?: number;
    primaryDiagnosis?: string;
    clinicalStatus?: string;
    rawGeneralComments?: string;
    unitType?: string;
  }>,
  rawClinicalNotes?: string
): Promise<PatientPrediction[]> {
  // Build the user message with patient data and clinical signals
  const patientData = patients.map((p) => {
    const isICU = p.unitType === "icu";
    const calculated = calculatePatientSignals(p.rawGeneralComments, isICU);

    return {
      mrn: p.mrn,
      initials: p.initials,
      unit: p.currentUnitName,
      admissionDate: p.admissionDate,
      service: p.service,
      losDays: p.losDays,
      existingDiagnosis: p.primaryDiagnosis,
      existingStatus: p.clinicalStatus,
      generalComments: p.rawGeneralComments,
      // Pre-calculated clinical signals
      clinicalSignals: calculated.signalsPrompt,
      calculatedTrajectory: calculated.trajectory,
      calculatedDischargeDays: calculated.dischargeDays,
      calculatedDowngradeDays: isICU ? calculated.downgradeDays : undefined,
    };
  });

  let userMessage = `Please analyze the following patients and provide discharge predictions.

IMPORTANT: Each patient includes PRE-CALCULATED clinical signals. Use the calculated values for:
- projectedDischargeDays (use calculatedDischargeDays)
- Trajectory assessment (use calculatedTrajectory)
- For ICU patients, use calculatedDowngradeDays for predictedDowngrade.daysUntilDowngrade

Focus your analysis on primaryDiagnosis, clinicalStatus, dispositionConsiderations, and losReasoning.

Patients:\n\n${JSON.stringify(patientData, null, 2)}`;

  if (rawClinicalNotes) {
    userMessage += `\n\nAdditional clinical notes:\n${rawClinicalNotes}`;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307", // Fast and cost-effective for this use case
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Extract the JSON array from Claude's response
  const content = data.content?.[0]?.text || "";

  // Try to parse the JSON response
  try {
    // Find JSON array in the response (Claude might include markdown code blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as PatientPrediction[];
    }
    throw new Error("No JSON array found in response");
  } catch (parseError) {
    console.error("Failed to parse AI response:", content);
    throw new Error(`Failed to parse AI response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
  }
}

/**
 * Process a single patient with raw clinical notes
 * Use this when you have copy-pasted clinical notes for specific patients
 */
export const processSinglePatient = action({
  args: {
    patientId: v.id("census_patients"),
    clinicalNotes: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    // Verify user is authenticated
    const user = await ctx.runQuery(internal.censusAI.getUserForAI, {});
    if (!user) {
      throw new Error("User not authenticated");
    }

    // Get patient details
    const patient = await ctx.runQuery(internal.censusAI.getPatientById, {
      patientId: args.patientId,
    });

    if (!patient) {
      throw new Error("Patient not found");
    }

    // Get Anthropic API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    const prompt = patient.unitType === "icu" ? ICU_PROMPT : FLOOR_PROMPT;

    try {
      const predictions = await callAnthropic(apiKey, prompt, [patient], args.clinicalNotes);

      if (predictions.length > 0) {
        await ctx.runMutation(internal.census.updatePatientPredictions, {
          patientId: args.patientId,
          predictions: {
            primaryDiagnosis: predictions[0].primaryDiagnosis,
            clinicalStatus: predictions[0].clinicalStatus,
            dispositionConsiderations: predictions[0].dispositionConsiderations,
            pendingProcedures: predictions[0].pendingProcedures,
            projectedDischargeDays: predictions[0].projectedDischargeDays,
            losReasoning: predictions[0].losReasoning,
          },
        });
        return { success: true };
      }

      return { success: false, error: "No predictions generated" };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

export const getPatientById = internalQuery({
  args: { patientId: v.id("census_patients") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.patientId);
  },
});
