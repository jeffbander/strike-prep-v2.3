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
  id?: number; // AMion internal ID
  pager?: string;
  cellPhone?: string;
  officePhone?: string;
  additionalContacts: { type: string; value: string }[];
}

// Schedule line from xln section with assignments
export interface AmionScheduleLine {
  name: string;
  type: number;
  startJulian: number;
  numDays: number;
  providerIds: number[]; // Provider ID for each day
}

export interface AmionService {
  name: string;
  type: number;
  typeLabel: string; // "schedule_line" | "vacation" | "service" | "unknown"
  lins: number; // Number of lines/positions
}

export interface AmionParseResult {
  department: string;
  organization: string;
  lastUpdated: string;
  year: string;
  baseYear: number; // Base year for Julian day calculations
  providers: AmionProvider[];
  services: string[];
  serviceDetails: AmionService[];
  scheduleLines: AmionScheduleLine[]; // Schedule lines with assignments
  skills: string[];
  rotationsFound: string[]; // Unique rotation/service names for categorization
}

// Schedule assignment from CSV import
export interface ScheduleAssignmentRow {
  providerName: string;
  providerFirstName?: string;
  providerLastName?: string;
  date: string; // ISO date
  rotation: string;
  notes?: string;
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
// These are the primary codes to try first
export const AMION_TO_JOBTYPE: Record<string, string> = {
  "EP MD": "MD",
  "Fellow": "FELLOW",
  "Attending": "MD",
  "NP": "NP",
  "PA": "PA",
};

// Alternative codes to try if the primary doesn't match
export const JOBTYPE_ALTERNATIVES: Record<string, string[]> = {
  "FELLOW": ["FEL", "FELL", "Fellow"],
  "MD": ["ATT", "ATTENDING", "Attending", "PHYS"],
  "NP": ["ARNP", "RNP"],
  "PA": ["PA-C"],
};

// Service TYPE codes
const SERVICE_TYPE_LABELS: Record<number, string> = {
  2: "service",      // Regular service/rotation
  4: "vacation",     // Vacation/PTO type
  15: "schedule_line", // Schedule line for assignments
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
    year: "",
    baseYear: 2024,
    providers: [],
    services: [],
    serviceDetails: [],
    scheduleLines: [],
    skills: [],
    rotationsFound: [],
  };

  let currentSection = "";
  let currentProvider: Partial<AmionProvider> | null = null;
  let currentServiceDetail: Partial<AmionService> | null = null;
  let currentScheduleLine: Partial<AmionScheduleLine> | null = null;
  let currentSkill = "";

  // Multi-line ROW data accumulation
  let accumulatingRowData = false;
  let rowDataBuffer = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle multi-line ROW data accumulation
    if (accumulatingRowData && currentScheduleLine) {
      // Check if this line contains the closing >
      const closingIndex = line.indexOf('>');
      if (closingIndex >= 0) {
        // Add content up to the closing bracket
        rowDataBuffer += line.substring(0, closingIndex);
        accumulatingRowData = false;
        // Decode the complete binary data (pass numDays for proper repeat/patch calculation)
        currentScheduleLine.providerIds = decodeBinaryProviderIds(
          rowDataBuffer,
          currentScheduleLine.numDays || 777
        );
        rowDataBuffer = "";
      } else {
        // Continue accumulating
        rowDataBuffer += line;
      }
      continue;
    }

    // Section markers
    if (trimmed.startsWith("SECT=")) {
      // Save current provider if exists
      if (currentProvider && currentProvider.name) {
        result.providers.push(finalizeProvider(currentProvider));
      }
      // Save current service detail if exists
      if (currentServiceDetail && currentServiceDetail.name) {
        result.serviceDetails.push(finalizeService(currentServiceDetail));
        if (!result.rotationsFound.includes(currentServiceDetail.name)) {
          result.rotationsFound.push(currentServiceDetail.name);
        }
      }
      // Save current schedule line if exists
      if (currentScheduleLine && currentScheduleLine.name) {
        result.scheduleLines.push(finalizeScheduleLine(currentScheduleLine));
      }
      currentProvider = null;
      currentServiceDetail = null;
      currentScheduleLine = null;
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
    if (trimmed.startsWith("YEAR=")) {
      result.year = trimmed.substring(5);
      // Parse base year from "YEAR=2024 1 8 :2024 2026" format
      const yearMatch = trimmed.match(/YEAR=(\d{4})/);
      if (yearMatch) {
        result.baseYear = parseInt(yearMatch[1], 10);
      }
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
        } else if (trimmed.startsWith("ID  =")) {
          currentProvider.id = parseInt(trimmed.substring(5), 10);
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

    // Service section parsing (SECT=service contains service definitions)
    if (currentSection === "service") {
      if (trimmed.startsWith("NAME=")) {
        // Save previous service
        if (currentServiceDetail && currentServiceDetail.name) {
          result.serviceDetails.push(finalizeService(currentServiceDetail));
          if (!result.rotationsFound.includes(currentServiceDetail.name)) {
            result.rotationsFound.push(currentServiceDetail.name);
          }
        }
        currentServiceDetail = {
          name: trimmed.substring(5),
          lins: 1,
        };
      } else if (currentServiceDetail) {
        if (trimmed.startsWith("TYPE=")) {
          currentServiceDetail.type = parseInt(trimmed.substring(5), 10);
          currentServiceDetail.typeLabel = SERVICE_TYPE_LABELS[currentServiceDetail.type] || "unknown";
        } else if (trimmed.startsWith("LINS=")) {
          currentServiceDetail.lins = parseInt(trimmed.substring(5), 10);
        }
      }
    }

    // Schedule line section parsing (xln = actual schedule lines with assignments)
    if (currentSection === "xln") {
      if (trimmed.startsWith("NAME=")) {
        // Save previous schedule line
        if (currentScheduleLine && currentScheduleLine.name) {
          result.scheduleLines.push(finalizeScheduleLine(currentScheduleLine));
        }
        const serviceName = trimmed.substring(5);
        currentScheduleLine = {
          name: serviceName,
          providerIds: [],
        };
        if (serviceName && !result.services.includes(serviceName)) {
          result.services.push(serviceName);
        }
        if (serviceName && !result.rotationsFound.includes(serviceName)) {
          result.rotationsFound.push(serviceName);
        }
      } else if (currentScheduleLine) {
        if (trimmed.startsWith("TYPE=")) {
          currentScheduleLine.type = parseInt(trimmed.substring(5), 10);
        } else if (trimmed.startsWith("ROW =")) {
          // Parse ROW header: "ROW =1167 777 -1 -7 66 <..."
          const rowMatch = trimmed.match(/ROW =(\d+)\s+(\d+)/);
          if (rowMatch) {
            currentScheduleLine.startJulian = parseInt(rowMatch[1], 10);
            currentScheduleLine.numDays = parseInt(rowMatch[2], 10);
          }
          // Check if ROW data contains < to start multi-line accumulation
          const openIndex = line.indexOf('<');
          if (openIndex >= 0) {
            const closeIndex = line.indexOf('>', openIndex);
            if (closeIndex >= 0) {
              // Data is on single line
              const binaryData = line.substring(openIndex + 1, closeIndex);
              currentScheduleLine.providerIds = decodeBinaryProviderIds(
                binaryData,
                currentScheduleLine.numDays || 777
              );
            } else {
              // Multi-line data - start accumulating
              accumulatingRowData = true;
              rowDataBuffer = line.substring(openIndex + 1);
            }
          }
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

  // Don't forget last service detail
  if (currentServiceDetail && currentServiceDetail.name) {
    result.serviceDetails.push(finalizeService(currentServiceDetail));
    if (!result.rotationsFound.includes(currentServiceDetail.name)) {
      result.rotationsFound.push(currentServiceDetail.name);
    }
  }

  // Don't forget last schedule line
  if (currentScheduleLine && currentScheduleLine.name) {
    result.scheduleLines.push(finalizeScheduleLine(currentScheduleLine));
  }

  return result;
}

/**
 * Finalize a service record
 */
function finalizeService(partial: Partial<AmionService>): AmionService {
  return {
    name: partial.name || "",
    type: partial.type || 0,
    typeLabel: partial.typeLabel || "unknown",
    lins: partial.lins || 1,
  };
}

/**
 * Finalize a schedule line record
 */
function finalizeScheduleLine(partial: Partial<AmionScheduleLine>): AmionScheduleLine {
  return {
    name: partial.name || "",
    type: partial.type || 0,
    startJulian: partial.startJulian || 0,
    numDays: partial.numDays || 0,
    providerIds: partial.providerIds || [],
  };
}

/**
 * Decode binary provider IDs from ROW data
 *
 * AMion binary format (discovered through reverse engineering):
 * 1. Section 0 (before first 252 byte): RLE encoded base pattern
 *    - Pairs of (provider_id, count) where count is 1-7 days
 * 2. Patch sections (after each 252 marker):
 *    - Format: 252, <type>, <week_offset>, 0, <provider_ids...>
 *    - Apply at (week_offset + 31) * 7 days
 *    - Provider ID 0 means "inherit from base pattern"
 */
function decodeBinaryProviderIds(data: string, numDays: number = 777): number[] {
  // Read bytes as raw character codes (Latin-1)
  const bytes: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const charCode = data.charCodeAt(i);
    if (charCode === 65533) {
      bytes.push(255); // Unicode replacement character fallback
    } else if (charCode < 256) {
      bytes.push(charCode);
    }
  }

  if (bytes.length === 0) return [];

  // Find all 252 markers (section delimiters)
  const pos252 = bytes.map((b, i) => b === 252 ? i : -1).filter(i => i >= 0);
  const section0End = pos252.length > 0 ? pos252[0] : bytes.length;

  // Step 1: Decode Section 0 as RLE to get base pattern
  const baseSchedule: number[] = [];
  for (let i = 0; i < section0End - 1; i += 2) {
    const providerId = bytes[i];
    const count = bytes[i + 1];
    if (count >= 1 && count <= 7) {
      for (let c = 0; c < count; c++) {
        baseSchedule.push(providerId);
      }
    }
  }

  // Handle edge case: if no base schedule decoded, fall back to simple decode
  if (baseSchedule.length === 0) {
    // Fallback: treat all bytes as provider IDs
    return bytes.filter(b => b !== 252 && b !== 0);
  }

  // Step 2: Build full schedule by repeating base pattern
  const schedule: number[] = [];
  for (let d = 0; d < numDays; d++) {
    schedule.push(baseSchedule[d % baseSchedule.length]);
  }

  // Step 3: Apply patches with +31 week adjustment
  // Patch format: 252, type, week_offset, 0, provider_ids...
  for (let p = 0; p < pos252.length; p++) {
    const blockStart = pos252[p];
    const blockEnd = p + 1 < pos252.length ? pos252[p + 1] : bytes.length;

    if (blockStart + 3 >= bytes.length) continue;

    const weekOffset = bytes[blockStart + 2];
    const separator = bytes[blockStart + 3];

    // Skip malformed patches (separator should be 0)
    if (separator !== 0) continue;

    const providers = bytes.slice(blockStart + 4, blockEnd);

    // Apply +31 week offset adjustment
    const adjustedWeek = weekOffset + 31;
    const startDay = adjustedWeek * 7;

    if (startDay >= numDays) continue;

    // Apply patch - 0 means inherit from base (don't overwrite)
    for (let d = 0; d < providers.length && startDay + d < schedule.length; d++) {
      const pid = providers[d];
      if (pid !== 0) {
        schedule[startDay + d] = pid;
      }
    }
  }

  return schedule;
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
    id: partial.id,
    pager: partial.pager,
    cellPhone: partial.cellPhone,
    officePhone: partial.officePhone,
    additionalContacts: partial.additionalContacts || [],
  };
}

/**
 * Convert AMion Julian day to ISO date string
 * AMion uses Julian days calculated from an epoch 3 years before the base year
 * E.g., if YEAR=2024, Julian day 0 = Jan 1, 2021
 */
function julianToDate(julianDay: number, baseYear: number): string {
  // AMion epoch is 3 years before the stated base year
  const epochYear = baseYear - 3;
  const baseDate = new Date(epochYear, 0, 1); // Jan 1 of epoch year
  baseDate.setDate(baseDate.getDate() + julianDay);
  return baseDate.toISOString().split('T')[0];
}

/**
 * Generate schedule assignments from parsed AMion data
 * This converts the binary schedule data into usable assignment rows
 */
export function generateScheduleAssignments(result: AmionParseResult): ScheduleAssignmentRow[] {
  const assignments: ScheduleAssignmentRow[] = [];

  // Build provider ID to name map
  const providerById = new Map<number, AmionProvider>();
  for (const provider of result.providers) {
    if (provider.id !== undefined) {
      providerById.set(provider.id, provider);
    }
  }

  // Process each schedule line
  for (const line of result.scheduleLines) {
    if (!line.providerIds || line.providerIds.length === 0) continue;

    // Each provider ID in the array corresponds to a day
    for (let dayOffset = 0; dayOffset < line.providerIds.length; dayOffset++) {
      const providerId = line.providerIds[dayOffset];
      if (providerId === 0 || providerId === 32) continue; // 0 = null, 32 = space (no assignment)

      const provider = providerById.get(providerId);
      if (!provider) continue;

      const date = julianToDate(line.startJulian + dayOffset, result.baseYear);

      assignments.push({
        providerName: provider.name,
        providerFirstName: provider.firstName,
        providerLastName: provider.lastName,
        date,
        rotation: line.name,
      });
    }
  }

  return assignments;
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

/**
 * Parse CSV content for schedule assignments
 * Expected columns: Provider Name, Date, Rotation, Notes (optional)
 * Or: First Name, Last Name, Date, Rotation, Notes (optional)
 */
export function parseScheduleCSV(content: string): {
  assignments: ScheduleAssignmentRow[];
  errors: string[];
  rotationsFound: string[];
} {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const assignments: ScheduleAssignmentRow[] = [];
  const errors: string[] = [];
  const rotationsFound = new Set<string>();

  if (lines.length < 2) {
    errors.push("CSV must have a header row and at least one data row");
    return { assignments, errors, rotationsFound: [] };
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map(h => h.toLowerCase().trim());

  // Detect column indices
  const providerNameIdx = headers.findIndex(h => h.includes("provider") && h.includes("name"));
  const firstNameIdx = headers.findIndex(h => h === "first name" || h === "firstname");
  const lastNameIdx = headers.findIndex(h => h === "last name" || h === "lastname");
  const dateIdx = headers.findIndex(h => h === "date" || h.includes("date"));
  const rotationIdx = headers.findIndex(h => h === "rotation" || h === "service" || h.includes("rotation"));
  const notesIdx = headers.findIndex(h => h === "notes" || h === "note" || h === "comments");

  // Validate required columns
  const hasProviderName = providerNameIdx >= 0 || (firstNameIdx >= 0 && lastNameIdx >= 0);
  if (!hasProviderName) {
    errors.push("CSV must have either 'Provider Name' column or 'First Name' and 'Last Name' columns");
  }
  if (dateIdx < 0) {
    errors.push("CSV must have a 'Date' column");
  }
  if (rotationIdx < 0) {
    errors.push("CSV must have a 'Rotation' or 'Service' column");
  }

  if (errors.length > 0) {
    return { assignments, errors, rotationsFound: [] };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    try {
      const values = parseCSVLine(line);

      // Extract values
      let providerName = "";
      let firstName = "";
      let lastName = "";

      if (providerNameIdx >= 0) {
        providerName = values[providerNameIdx]?.trim() || "";
        const parsed = parseName(providerName);
        firstName = parsed.firstName;
        lastName = parsed.lastName;
      } else {
        firstName = values[firstNameIdx]?.trim() || "";
        lastName = values[lastNameIdx]?.trim() || "";
        providerName = `${firstName} ${lastName}`.trim();
      }

      const dateStr = values[dateIdx]?.trim() || "";
      const rotation = values[rotationIdx]?.trim() || "";
      const notes = notesIdx >= 0 ? values[notesIdx]?.trim() : undefined;

      // Validate row
      if (!providerName && !firstName && !lastName) {
        errors.push(`Row ${i + 1}: Missing provider name`);
        continue;
      }
      if (!dateStr) {
        errors.push(`Row ${i + 1}: Missing date`);
        continue;
      }
      if (!rotation) {
        errors.push(`Row ${i + 1}: Missing rotation`);
        continue;
      }

      // Parse date (handle various formats)
      const parsedDate = parseDate(dateStr);
      if (!parsedDate) {
        errors.push(`Row ${i + 1}: Invalid date format "${dateStr}"`);
        continue;
      }

      rotationsFound.add(rotation);

      assignments.push({
        providerName,
        providerFirstName: firstName,
        providerLastName: lastName,
        date: parsedDate,
        rotation,
        notes,
      });
    } catch (e) {
      errors.push(`Row ${i + 1}: Parse error - ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }

  return {
    assignments,
    errors,
    rotationsFound: Array.from(rotationsFound),
  };
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Parse a date string into ISO format (YYYY-MM-DD)
 * Handles: MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD, MM/DD/YY
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // MM/DD/YYYY or MM-DD-YYYY
  const usMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (usMatch) {
    const month = usMatch[1].padStart(2, '0');
    const day = usMatch[2].padStart(2, '0');
    const year = usMatch[3];
    return `${year}-${month}-${day}`;
  }

  // MM/DD/YY
  const shortMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (shortMatch) {
    const month = shortMatch[1].padStart(2, '0');
    const day = shortMatch[2].padStart(2, '0');
    const yearShort = parseInt(shortMatch[3], 10);
    const year = yearShort >= 50 ? `19${shortMatch[3]}` : `20${shortMatch[3]}`;
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Generate date range array
 */
export function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  return dates;
}

/**
 * Categorize rotation name to a status
 */
export function categorizeRotation(rotationName: string): string {
  const lower = rotationName.toLowerCase();

  // Vacation/PTO
  if (lower.includes('vac') || lower.includes('pto') || lower.includes('holiday')) {
    return 'vacation';
  }

  // Sick
  if (lower.includes('sick') || lower.includes('illness')) {
    return 'sick';
  }

  // Curtailable
  if (lower.includes('research') || lower.includes('elective') || lower.includes('admin') ||
      lower.includes('education') || lower.includes('cme') || lower.includes('conference')) {
    return 'curtailable';
  }

  // Default to on_service
  return 'on_service';
}
