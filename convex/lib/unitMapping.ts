/**
 * Unit Mapping Utility
 * Normalizes unit names between census data and procedure predictions.
 */

// ICU unit aliases - map various names to canonical "CCU"
const ICU_ALIASES: string[] = [
  "CCU",
  "CSIU",
  "CVU",
  "CICU",
  "ICU",
  "MSM",
];

// Floor unit aliases - map various names to canonical "N07E"
const FLOOR_ALIASES: string[] = [
  "N07E",
  "7E",
  "N7E",
];

/**
 * Normalize a unit name to a canonical form.
 * - ICU units (CCU, CSIU, CVU, etc.) → "CCU"
 * - Floor units (N07E, 7E, etc.) → "N07E"
 * - Unknown units → returned as-is
 */
export function normalizeUnitName(rawName: string): string {
  if (!rawName) return rawName;

  const upper = rawName.toUpperCase().trim();

  // Check ICU aliases
  for (const alias of ICU_ALIASES) {
    if (upper.includes(alias)) {
      return "CCU";
    }
  }

  // Check floor aliases
  for (const alias of FLOOR_ALIASES) {
    if (upper.includes(alias)) {
      return "N07E";
    }
  }

  // Return original if no mapping found
  return rawName;
}

/**
 * Determine unit type based on name.
 */
export function getUnitType(unitName: string): "icu" | "floor" {
  const normalized = normalizeUnitName(unitName);

  // Known ICU canonical names
  if (normalized === "CCU") {
    return "icu";
  }

  // Check if original contains ICU patterns
  const upper = unitName.toUpperCase();
  for (const alias of ICU_ALIASES) {
    if (upper.includes(alias)) {
      return "icu";
    }
  }

  return "floor";
}

/**
 * Get list of canonical unit names for display.
 */
export function getCanonicalUnits(): { name: string; type: "icu" | "floor" }[] {
  return [
    { name: "CCU", type: "icu" },
    { name: "N07E", type: "floor" },
  ];
}

/**
 * Check if a unit name represents an ICU.
 */
export function isICUUnit(unitName: string): boolean {
  return getUnitType(unitName) === "icu";
}
