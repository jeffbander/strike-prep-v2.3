/**
 * Clinical Signal Extraction Module
 * Rule-based clinical signal extraction for census AI predictions.
 */

export interface ClinicalSignals {
  onVent: boolean;
  ventWeaning: boolean;
  onHFNC: boolean;
  onNIPPV: boolean;
  extubated: boolean;
  onPressors: boolean;
  pressorsWeaning: boolean;
  detectedPressors: string[];
  onECMO: boolean;
  onImpella: boolean;
  onIABP: boolean;
  onLVAD: boolean;
  onCRRT: boolean;
  onHD: boolean;
  newHD: boolean;
  activeInfection: boolean;
  awaitingTransplant: boolean;
  postTransplant: boolean;
  transplantOrgans: string[];
  transplantPOD: number | null;
  unosStatus: string | null;
  hasHAH: boolean;
  hasOPAT: boolean;
  hasIVABX: boolean;
  pendingPlacement: boolean;
  destination: 'home' | 'home_hah' | 'home_opat' | 'snf' | 'ltach' | 'rehab' | null;
  allDrips: string[];
}

export interface DowngradeEstimate {
  days: number;
  reasoning: string;
}

export interface DischargeEstimate {
  days: number;
  reasoning: string;
}

export interface PatientTrend {
  trend: 'Progressing' | 'No Change' | 'Regressed' | 'New';
  dayAdjustment: number;
}

export function extractClinicalSignals(comments: string): ClinicalSignals {
  const text = (comments || '').toLowerCase();

  const signals: ClinicalSignals = {
    onVent: false, ventWeaning: false, onHFNC: false, onNIPPV: false, extubated: false,
    onPressors: false, pressorsWeaning: false, detectedPressors: [],
    onECMO: false, onImpella: false, onIABP: false, onLVAD: false,
    onCRRT: false, onHD: false, newHD: false, activeInfection: false,
    awaitingTransplant: false, postTransplant: false, transplantOrgans: [], transplantPOD: null, unosStatus: null,
    hasHAH: false, hasOPAT: false, hasIVABX: false, pendingPlacement: false, destination: null, allDrips: [],
  };

  // VENTILATOR
  if (/\b(extubated|extubation)/.test(text)) {
    signals.extubated = true;
  } else if (/\b(psv\s*trial|sbt\s*trial|sbt|trach\s*collar\s*trial|vent\s*wean|weaning\s*vent)/.test(text)) {
    signals.onVent = true;
    signals.ventWeaning = true;
  } else if (/\b(intubated|ventilat|on\s*vent|acvc|acpc|mechanical\s*vent)/.test(text)) {
    if (!/\b(off\s*vent|extubat)/.test(text)) signals.onVent = true;
  }

  if (/\bhfnc\b|high\s*flow/.test(text)) signals.onHFNC = true;
  if (/\b(nippv|bipap|cpap)\b/.test(text)) signals.onNIPPV = true;

  // PRESSORS
  const pressorPatterns: [RegExp, string][] = [
    [/\bnorepi\w*/, 'norepi'], [/\blevophed/, 'levo'], [/\bvasopressin/, 'vasopressin'],
    [/\bvaso\s*[\d.]+/, 'vaso'], [/\bphenylephrine/, 'phenyl'], [/\bneo\s*[\d.]+/, 'neo'],
    [/\bdopamine/, 'dopa'], [/\bdopa\s*[\d.]+/, 'dopa'], [/\bepi(?:nephrine)?\s*[\d.]+/, 'epi'],
  ];

  for (const [pattern, name] of pressorPatterns) {
    if (pattern.test(text)) {
      const neg1 = new RegExp(`(off|stopped|discontinue|weaned?\\s*off)\\s*${name}`, 'i');
      const neg2 = new RegExp(`${name}\\s*(off|stopped|discontinued)`, 'i');
      if (!neg1.test(text) && !neg2.test(text)) {
        signals.detectedPressors.push(name);
        signals.allDrips.push(name);
      }
    }
  }

  // Global off pressors
  if (/(remains?\s*off|off)\s*(all\s*)?(pressors?|vasopressors?|vasoactive)/.test(text)) {
    signals.detectedPressors = [];
  } else if (signals.detectedPressors.length > 0) {
    signals.onPressors = true;
    if (/wean\s*(epi|vaso|norepi|pressor)/.test(text)) signals.pressorsWeaning = true;
  }

  // MCS
  if (/ecmo/.test(text) && !/(off|decannulat|removed)\s*ecmo/.test(text)) signals.onECMO = true;
  if (/impella/.test(text) && !/(off|removed|explant)\s*impella/.test(text)) signals.onImpella = true;
  if (/iabp/.test(text) && !/(off|removed)\s*iabp/.test(text)) signals.onIABP = true;
  if (/lvad/.test(text)) signals.onLVAD = true;

  // RENAL
  if (/\b(crrt|cvvh)\b/.test(text) && !/(off|stopped)\s*(crrt|cvvh)/.test(text)) signals.onCRRT = true;
  if (/\bhd\b|hemodialysis|dialysis/.test(text)) {
    signals.onHD = true;
    if (/(new|started|initiat).{0,10}(hd|dialysis)/.test(text)) signals.newHD = true;
  }

  // INFECTION
  if (/\b(infection|sepsis)\b/.test(text)) {
    if (/(no|without|resolved)\s*(signs?\s*of\s*)?(infection|sepsis)/.test(text)) {
      signals.activeInfection = false;
    } else {
      signals.activeInfection = true;
    }
  }

  // TRANSPLANT
  if (/transplant|\btx\b/.test(text)) {
    signals.awaitingTransplant = /awaiting/.test(text);
    signals.postTransplant = /pod|s\/p|post/.test(text);
    if (/heart/.test(text)) signals.transplantOrgans.push('heart');
    if (/lung/.test(text)) signals.transplantOrgans.push('lung');
    if (/liver/.test(text)) signals.transplantOrgans.push('liver');
    if (/kidney/.test(text)) signals.transplantOrgans.push('kidney');
    const podMatch = text.match(/pod[#\s]*(\d+)/);
    if (podMatch) signals.transplantPOD = parseInt(podMatch[1]);
    const unosMatch = text.match(/unos\s*(\d+\w*)/);
    if (unosMatch) signals.unosStatus = unosMatch[1];
  }

  // HAH/OPAT - CRITICAL
  signals.hasHAH = /\bhah\b|hospital\s*at\s*home/.test(text);
  signals.hasOPAT = /\bopat\b|outpatient\s*(parenteral|iv)\s*(abx|antibiotic)/.test(text);
  signals.hasIVABX = /iv\s*abx|iv\s*antibiotic/.test(text);

  // DESTINATION
  signals.pendingPlacement = /pending/.test(text) && /placement/.test(text);
  if (/sar|snf/.test(text)) signals.destination = 'snf';
  else if (/acute\s*rehab/.test(text)) signals.destination = 'rehab';
  else if (/ltach/.test(text)) signals.destination = 'ltach';
  else if (signals.hasHAH) signals.destination = 'home_hah';
  else if (signals.hasOPAT) signals.destination = 'home_opat';
  else signals.destination = 'home';

  return signals;
}

export function assessTrajectory(comments: string, signals: ClinicalSignals): string {
  const text = (comments || '').toLowerCase();
  if (/worsening|deteriorat|unstable|critical|emergent/.test(text)) return "Critical";
  if (/doing\s*well|improving|better|tolerating|extubated|weaned?\s*off/.test(text)) {
    return (signals.ventWeaning || signals.pressorsWeaning) ? "Improving, actively weaning" : "Improving";
  }
  if (/weaning|wean\s*down|psv\s*trial|sbt/.test(text)) return "Improving, actively weaning";
  if (signals.onECMO) return "Stable on ECMO";
  if (signals.onImpella || signals.onIABP) return "Stable on MCS";
  return "Stable";
}

export function estimateDowngradeDays(signals: ClinicalSignals): DowngradeEstimate {
  if (signals.awaitingTransplant) return { days: 30, reasoning: "Awaiting transplant" };

  if (signals.postTransplant) {
    const pod = signals.transplantPOD || 1;
    const isMulti = signals.transplantOrgans.length >= 2;
    const hasHeartLung = signals.transplantOrgans.includes('heart') || signals.transplantOrgans.includes('lung');
    if (isMulti) return { days: pod <= 7 ? 30 : Math.max(14, 35 - pod), reasoning: "Multi-organ transplant" };
    if (hasHeartLung) return { days: pod <= 7 ? 21 : Math.max(7, 25 - pod), reasoning: "Heart/lung transplant" };
    return { days: Math.max(5, 14 - pod), reasoning: "Post-transplant" };
  }

  if (signals.onECMO) return { days: 14, reasoning: "ECMO" };
  if (signals.onImpella) return { days: 7, reasoning: "Impella" };
  if (signals.onIABP) return { days: 5, reasoning: "IABP" };
  if (signals.onVent) return signals.ventWeaning ? { days: 3, reasoning: "Vent weaning" } : { days: 5, reasoning: "Mechanical vent" };
  if (signals.onNIPPV) return signals.onHD ? { days: 5, reasoning: "NIPPV + HD" } : { days: 4, reasoning: "NIPPV" };
  if (signals.onHFNC) return signals.onHD ? { days: 5, reasoning: "HFNC + HD" } : { days: 2, reasoning: "HFNC" };
  if (signals.onPressors) return signals.pressorsWeaning ? { days: 2, reasoning: "Weaning pressors" } : { days: 3, reasoning: "Pressors" };
  if (signals.onCRRT) return { days: 5, reasoning: "CRRT" };
  if (signals.onHD) return { days: 3, reasoning: "HD" };
  return { days: 2, reasoning: "Stable" };
}

export function estimateHospitalDischargeDays(signals: ClinicalSignals, downgradeDays: number, isICU: boolean): DischargeEstimate {
  if (signals.awaitingTransplant) return { days: 45, reasoning: "Awaiting transplant" };

  if (signals.postTransplant) {
    const isMulti = signals.transplantOrgans.length >= 2;
    const hasHeartLung = signals.transplantOrgans.includes('heart') || signals.transplantOrgans.includes('lung');
    if (isMulti) return { days: 45, reasoning: "Multi-organ: 30 ICU + 15 floor" };
    if (hasHeartLung) return { days: 30, reasoning: "Heart/lung: 21 ICU + 9 floor" };
    return { days: downgradeDays + 7, reasoning: "Transplant recovery" };
  }

  if (signals.onECMO) return { days: 35, reasoning: "ECMO + recovery" };
  if (signals.onImpella) return { days: 21, reasoning: "MCS + recovery" };
  if (signals.onIABP) return { days: 14, reasoning: "IABP + recovery" };

  // HAH/OPAT - KEY LOGIC
  if (!isICU && signals.hasIVABX) {
    if (signals.hasHAH || signals.hasOPAT) return { days: 2, reasoning: "IV ABX with HAH/OPAT - 1-2 days" };
    return { days: 5, reasoning: "IV ABX without HAH - 4-5 days" };
  }

  if (signals.destination === 'snf') {
    return signals.pendingPlacement ? { days: 5, reasoning: "SNF pending" } : { days: 3, reasoning: "SNF in progress" };
  }
  if (signals.destination === 'ltach') return { days: 7, reasoning: "LTACH placement" };
  if (signals.destination === 'rehab') return { days: 4, reasoning: "Rehab placement" };

  if (signals.onHD) return { days: downgradeDays + 5, reasoning: "HD coordination" };

  // For floor patients with no complexity, use shorter estimates
  if (!isICU) {
    // Simple floor patient going home with no barriers
    if (signals.destination === 'home' || signals.destination === null) {
      // Check if there are ANY complexity signals
      const hasComplexity = signals.onVent || signals.onHFNC || signals.onNIPPV ||
        signals.onPressors || signals.onCRRT || signals.onHD || signals.activeInfection ||
        signals.postTransplant || signals.awaitingTransplant;

      if (!hasComplexity) {
        return { days: 2, reasoning: "Stable floor patient, home discharge" };
      }
    }
  }

  // ICU patients or complex floor patients need recovery time
  return { days: isICU ? downgradeDays + 3 : 3, reasoning: isICU ? "ICU recovery" : "Floor recovery" };
}

export function calculatePatientTrend(
  currentComments: string, currentStatus: string | undefined,
  prevComments: string | undefined, prevStatus: string | undefined
): PatientTrend {
  if (!prevComments) return { trend: 'New', dayAdjustment: 0 };

  const curr = extractClinicalSignals(currentComments);
  const prev = extractClinicalSignals(prevComments);

  const rank = (s: string | undefined): number => {
    if (!s) return 5;
    const l = s.toLowerCase();
    if (l.includes('definite')) return 0;
    if (l.includes('possible') || l.includes('tomorrow')) return 1;
    if (l.includes('24-48')) return 2;
    if (l.includes('weekend')) return 3;
    return 4;
  };

  let delta = rank(prevStatus) - rank(currentStatus);

  const resp = (s: ClinicalSignals) => s.onVent && !s.ventWeaning ? 4 : s.onVent ? 3 : s.onNIPPV ? 2 : s.onHFNC ? 1 : 0;
  delta += resp(prev) - resp(curr);
  if (prev.onPressors && !curr.onPressors) delta += 1;
  if (!prev.onPressors && curr.onPressors) delta -= 1;

  if (delta > 0) return { trend: 'Progressing', dayAdjustment: 0 };
  if (delta < 0) return { trend: 'Regressed', dayAdjustment: 2 };
  return { trend: 'No Change', dayAdjustment: 0 };
}

export function detectOneToOneDevices(signals: ClinicalSignals): string[] {
  const d: string[] = [];
  if (signals.onECMO) d.push('ECMO');
  if (signals.onImpella) d.push('Impella');
  if (signals.onIABP) d.push('IABP');
  if (signals.onCRRT) d.push('CVVH');
  return d;
}

export function requiresOneToOne(signals: ClinicalSignals): boolean {
  return signals.onECMO || signals.onImpella || (signals.onVent && signals.ventWeaning);
}

export function formatSignalsForPrompt(signals: ClinicalSignals, trajectory: string, downgrade: number, discharge: number): string {
  return `
PRE-CALCULATED (use these values):
- Trajectory: ${trajectory}
- Downgrade: ${downgrade} days
- Discharge: ${discharge} days

SIGNALS:
- Vent: ${signals.onVent ? (signals.ventWeaning ? 'Weaning' : 'Mechanical') : 'Off'}
- HFNC: ${signals.onHFNC}, NIPPV: ${signals.onNIPPV}
- Pressors: ${signals.onPressors ? signals.detectedPressors.join(',') : 'None'}${signals.pressorsWeaning ? ' (weaning)' : ''}
- MCS: ECMO=${signals.onECMO}, Impella=${signals.onImpella}, IABP=${signals.onIABP}
- Renal: CRRT=${signals.onCRRT}, HD=${signals.onHD}
- Transplant: awaiting=${signals.awaitingTransplant}, post=${signals.postTransplant}, organs=${signals.transplantOrgans.join(',')||'N/A'}
- Discharge: IV_ABX=${signals.hasIVABX}, HAH=${signals.hasHAH}, OPAT=${signals.hasOPAT}, dest=${signals.destination}
`.trim();
}
