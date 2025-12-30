/**
 * AMion .sch File Parser
 * Parses the proprietary AMion schedule file format to extract provider data
 */

export interface AmionProvider {
  name: string;
  firstName: string;
  lastName: string;
  abbreviation: string;
  type: number;
  roleLabel: string;
  pager?: string;
  cellPhone?: string;
  officePhone?: string;
  additionalContacts: { type: string; value: string }[];
}

export interface AmionParseResult {
  department: string;
  organization: string;
  lastUpdated: string;
  providers: AmionProvider[];
  services: string[];
  skills: string[];
}

// AMion TYPE codes to role labels
const TYPE_TO_ROLE: Record<number, string> = {
  1: "EP MD",      // Electrophysiology MD
  2: "Fellow",     // Fellow (FEL)
  3: "Attending",  // Attending Physician (MD)
  4: "Service",    // Service/placeholder
  5: "NP",         // Nurse Practitioner
  6: "PA",         // Physician Assistant (assumed)
};

// Map AMion roles to Strike Prep job type codes
export const AMION_TO_JOBTYPE: Record<string, string> = {
  "EP MD": "MD",
  "Fellow": "FEL",
  "Attending": "MD",
  "NP": "NP",
  "PA": "PA",
};

/**
 * Parse an AMion .sch file content
 */
export function parseAmionFile(content: string): AmionParseResult {
  const lines = content.split('\n');

  const result: AmionParseResult = {
    department: "",
    organization: "",
    lastUpdated: "",
    providers: [],
    services: [],
    skills: [],
  };

  let currentSection = "";
  let currentProvider: Partial<AmionProvider> | null = null;
  let currentService = "";
  let currentSkill = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Section markers
    if (trimmed.startsWith("SECT=")) {
      // Save current provider if exists
      if (currentProvider && currentProvider.name) {
        result.providers.push(finalizeProvider(currentProvider));
      }
      currentProvider = null;
      currentSection = trimmed.substring(5);
      continue;
    }

    // Metadata
    if (trimmed.startsWith("DEPT=")) {
      result.department = trimmed.substring(5);
      continue;
    }
    if (trimmed.startsWith("TIME=")) {
      result.lastUpdated = trimmed.substring(5);
      continue;
    }
    if (trimmed.startsWith("SIID=")) {
      result.organization = trimmed.substring(5);
      continue;
    }

    // Staff section parsing
    if (currentSection === "staff") {
      if (trimmed.startsWith("NAME=")) {
        // Save previous provider
        if (currentProvider && currentProvider.name) {
          result.providers.push(finalizeProvider(currentProvider));
        }
        currentProvider = {
          name: trimmed.substring(5),
          additionalContacts: [],
        };
      } else if (currentProvider) {
        if (trimmed.startsWith("ABBR=")) {
          currentProvider.abbreviation = trimmed.substring(5);
        } else if (trimmed.startsWith("TYPE=")) {
          currentProvider.type = parseInt(trimmed.substring(5), 10);
          currentProvider.roleLabel = TYPE_TO_ROLE[currentProvider.type] || "Unknown";
        } else if (trimmed.startsWith("PAGR=")) {
          const pager = trimmed.substring(5);
          // Check if it looks like a cell phone (10+ digits)
          const digits = pager.replace(/\D/g, '');
          if (digits.length >= 10) {
            currentProvider.cellPhone = formatPhone(digits);
          } else {
            currentProvider.pager = pager;
          }
        } else if (trimmed.startsWith("TELE=")) {
          const tel = trimmed.substring(5);
          if (!currentProvider.officePhone) {
            currentProvider.officePhone = tel;
          }
        } else if (trimmed.startsWith("PCON=")) {
          const pcon = trimmed.substring(5);
          const parts = pcon.split('\t');
          if (parts.length >= 2) {
            const contactType = parts[0].trim();
            const contactValue = parts[1].trim();
            if (contactType === "cell" && contactValue) {
              currentProvider.cellPhone = formatPhone(contactValue);
            } else if (contactType === "office" && contactValue) {
              currentProvider.officePhone = contactValue;
            } else if (contactValue) {
              currentProvider.additionalContacts?.push({
                type: contactType,
                value: contactValue,
              });
            }
          }
        }
      }
    }

    // Service section parsing (xln = schedule lines)
    if (currentSection === "xln") {
      if (trimmed.startsWith("NAME=")) {
        currentService = trimmed.substring(5);
        if (currentService && !result.services.includes(currentService)) {
          result.services.push(currentService);
        }
      }
    }

    // Skill section parsing
    if (currentSection === "skill") {
      if (trimmed.startsWith("NAME=")) {
        currentSkill = trimmed.substring(5);
        if (currentSkill && !result.skills.includes(currentSkill)) {
          result.skills.push(currentSkill);
        }
      }
    }
  }

  // Don't forget last provider
  if (currentProvider && currentProvider.name) {
    result.providers.push(finalizeProvider(currentProvider));
  }

  return result;
}

/**
 * Finalize a provider record, parsing the name into first/last
 */
function finalizeProvider(partial: Partial<AmionProvider>): AmionProvider {
  const { firstName, lastName } = parseName(partial.name || "");

  return {
    name: partial.name || "",
    firstName,
    lastName,
    abbreviation: partial.abbreviation || "",
    type: partial.type || 0,
    roleLabel: partial.roleLabel || "Unknown",
    pager: partial.pager,
    cellPhone: partial.cellPhone,
    officePhone: partial.officePhone,
    additionalContacts: partial.additionalContacts || [],
  };
}

/**
 * Parse a name into first and last name
 * Handles formats like:
 * - "BANDER, J." -> { lastName: "Bander", firstName: "J." }
 * - "Adrian Nugent" -> { firstName: "Adrian", lastName: "Nugent" }
 * - "AHMADI, AMIR" -> { lastName: "Ahmadi", firstName: "Amir" }
 */
function parseName(name: string): { firstName: string; lastName: string } {
  if (!name) return { firstName: "", lastName: "" };

  // Check for "LAST, FIRST" format
  if (name.includes(",")) {
    const [last, first] = name.split(",").map(s => s.trim());
    return {
      firstName: toTitleCase(first || ""),
      lastName: toTitleCase(last || ""),
    };
  }

  // "First Last" format
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: "", lastName: toTitleCase(parts[0]) };
  }

  const firstName = parts.slice(0, -1).map(toTitleCase).join(" ");
  const lastName = toTitleCase(parts[parts.length - 1]);

  return { firstName, lastName };
}

/**
 * Convert string to title case
 */
function toTitleCase(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Format a phone number string
 */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone; // Return original if can't format
}

/**
 * Filter providers to only include actual staff (not placeholders)
 */
export function filterValidProviders(providers: AmionProvider[]): AmionProvider[] {
  return providers.filter(p => {
    // Must have a real name (not just abbreviation or placeholder)
    if (!p.name || p.name.length < 3) return false;

    // Skip single-letter or obvious placeholder names
    if (/^[a-z]$/i.test(p.name)) return false;
    if (p.name.toLowerCase().includes("consult page")) return false;

    // Must be a recognized role type (1-6)
    if (p.type < 1 || p.type > 6) return false;

    return true;
  });
}

/**
 * Group providers by role
 */
export function groupProvidersByRole(providers: AmionProvider[]): Record<string, AmionProvider[]> {
  const groups: Record<string, AmionProvider[]> = {};

  for (const provider of providers) {
    const role = provider.roleLabel || "Unknown";
    if (!groups[role]) {
      groups[role] = [];
    }
    groups[role].push(provider);
  }

  return groups;
}

/**
 * Get summary statistics from parsed data
 */
export function getParseStats(result: AmionParseResult): {
  totalProviders: number;
  validProviders: number;
  byRole: Record<string, number>;
  withCellPhone: number;
  withPager: number;
} {
  const valid = filterValidProviders(result.providers);
  const byRole: Record<string, number> = {};

  for (const p of valid) {
    byRole[p.roleLabel] = (byRole[p.roleLabel] || 0) + 1;
  }

  return {
    totalProviders: result.providers.length,
    validProviders: valid.length,
    byRole,
    withCellPhone: valid.filter(p => p.cellPhone).length,
    withPager: valid.filter(p => p.pager).length,
  };
}
