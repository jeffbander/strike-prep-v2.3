/**
 * AMion .sch File Parser
 * Parses the proprietary AMion schedule file format to extract provider data
 * and decode schedule assignments from ROW binary data
 *
 * Key technical details:
 * - Epoch: January 1, 2000 (not 1990)
 * - ROW data uses RLE encoding: (count, staffId) pairs after 2-byte header
 * - Direction -1 means reverse chronological (newest first)
 * - SPID field contains secondary provider for split shifts
 */

export interface AmionProvider {
  name: string;
  firstName: string;
  lastName: string;
  abbreviation: string;
  type: number;
  roleLabel: string;
  amionId: number;        // ID= from staff section (used for ROW decoding)
  pager?: string;
  cellPhone?: string;
  officePhone?: string;
  additionalContacts: { type: string; value: string }[];
}

export interface AmionService {
  name: string;
  id: number;              // ID= from xln section (used for ROW decoding)
  shiftDisplay?: string;   // "7a-5p" display format
  rawRowData?: string;     // Binary ROW data for decoding
  rawSpidData?: string;    // Secondary provider ROW data (split shifts)
  isGenericTitle?: boolean; // True if name is generic like "Consult Fellow"
}

export interface AmionAssignment {
  serviceId: number;       // Service ID
  serviceName: string;
  providerId: number;      // Staff ID (decoded from ROW)
  providerName: string;
  date: string;            // "2025-12-01"
  secondaryProviderId?: number;    // For split shifts
  secondaryProviderName?: string;  // For split shifts
  isGenericTitle?: boolean;        // True if provider name is generic
}

export interface AmionParseResult {
  department: string;
  organization: string;
  lastUpdated: string;
  providers: AmionProvider[];
  services: string[];
  skills: string[];
  // Enhanced schedule data
  amionServices: AmionService[];
  assignments: AmionAssignment[];
  staffIdMap: Map<number, AmionProvider>;
  scheduleStartDate: string;
  scheduleEndDate: string;
  scheduleYear: number;
  scheduleEndYear?: number;  // End year from YEAR field (e.g., 2026 from "YEAR=2024...2026")
}

// ROW header parameters extracted from the ROW line
interface RowHeaderParams {
  startOffset: number;    // Reference point (often 1167)
  count: number;          // Number of schedule entries
  direction: number;      // -1 = reverse chronological, 1 = forward
  increment: number;      // -7 = weekly blocks, -1 = daily
  bytesPerEntry: number;  // Bytes per time slot
  binaryData: string;     // The actual binary data between < and >
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

// AMion epoch: January 1, 2000
const AMION_EPOCH = new Date(2000, 0, 1);

// Special byte values in ROW data
const SPECIAL_BYTES = {
  EMPTY: 0,
  EMPTY_SLOT: 250,    // 0xFA - empty slot marker
  EMPTY_SLOT_2: 253,  // 0xFD - another empty marker
  DISABLED: 255,      // 0xFF - disabled/not applicable
  WEEK_MARKER_1: 252, // 0xFC - weekly override section marker
  WEEK_MARKER_2: 7,   // 0x07 - paired with WEEK_MARKER_1
};

// 2-byte special values that appear as staff IDs
const SPECIAL_STAFF_IDS = new Set([
  65533,  // 0xFFFD - empty/TBD marker
  65534,  // 0xFFFE - disabled
  65535,  // 0xFFFF - not applicable
  0,      // empty
]);

// Generic title patterns that should be flagged
const GENERIC_TITLE_PATTERNS = [
  /fellow/i,
  /consult/i,
  /resident/i,
  /on.?call/i,
  /attending$/i,  // Just "Attending" alone
  /^md$/i,
  /coverage/i,
  /backup/i,
  /float/i,
];

/**
 * Check if a name is a generic title (not a real person's name)
 */
function isGenericTitle(name: string): boolean {
  if (!name) return false;
  // If it contains a comma (like "BANDER, J."), it's likely a real name
  if (name.includes(",")) return false;
  // If it's just one or two words and matches a pattern, it's generic
  return GENERIC_TITLE_PATTERNS.some(pattern => pattern.test(name));
}

/**
 * Convert Julian day number to a Date object
 * AMion uses epoch: January 1, 2000
 */
function julianDayToDate(jday: number): Date {
  return new Date(AMION_EPOCH.getTime() + jday * 86400000);
}

/**
 * Convert Date to Julian day number
 */
function dateToJulianDay(date: Date): number {
  return Math.floor((date.getTime() - AMION_EPOCH.getTime()) / 86400000);
}

/**
 * Parse ROW header parameters from a ROW line
 * Format: ROW =1167 269 -1 -7 70 <binary_data>
 */
function parseRowHeader(rowLine: string): RowHeaderParams | null {
  // Match: startOffset count direction increment bytesPerEntry <data>
  const match = rowLine.match(/(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+(\d+)\s*<([^>]*)>/);
  if (!match) return null;

  return {
    startOffset: parseInt(match[1], 10),
    count: parseInt(match[2], 10),
    direction: parseInt(match[3], 10),
    increment: parseInt(match[4], 10),
    bytesPerEntry: parseInt(match[5], 10),
    binaryData: match[6],
  };
}

/**
 * Extract byte values from binary string data
 */
function extractBytes(rawData: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < rawData.length; i++) {
    bytes.push(rawData.charCodeAt(i));
  }
  return bytes;
}

/**
 * Decode Run-Length Encoded schedule data
 * Format: [header1] [header2] [count1] [staffId1] [count2] [staffId2] ...
 *
 * Each (count, staffId) pair means "staffId is assigned for 'count' consecutive days"
 */
function decodeRLE(bytes: number[]): number[] {
  const result: number[] = [];
  let i = 2; // Skip 2-byte header

  while (i < bytes.length - 1) {
    const count = bytes[i];
    const staffId = bytes[i + 1];

    // Validate count - skip if 0 or unreasonably large
    if (count === 0 || count > 50) {
      i++;
      continue;
    }

    // Check for weekly override marker (0xFC 0x07)
    if (count === SPECIAL_BYTES.WEEK_MARKER_1 && staffId === SPECIAL_BYTES.WEEK_MARKER_2) {
      // Skip override section: marker + ref + sep + 7 days
      i += 11;
      continue;
    }

    // Add staffId 'count' times
    for (let j = 0; j < count; j++) {
      result.push(staffId);
    }

    i += 2;
  }

  return result;
}

/**
 * Calculate dates for decoded schedule entries
 *
 * AMion ROW data format: ROW =startOffset count direction increment bytesPerEntry <data>
 * - startOffset: Week number from AMion epoch (Jan 1, 2000)
 * - direction: -1 = reverse chronological, 1 = forward
 * - increment: -7 = weekly blocks, -1 = daily
 *
 * The startOffset is actually a week offset from AMion epoch (Jan 1, 2000).
 * startOffset=1167 means week 1167 from Jan 1, 2000 = ~May 2022
 */
function calculateDates(
  startOffset: number,
  decodedIds: number[],
  direction: number,
  increment: number,
  scheduleYear: number,
  scheduleEndYear?: number
): Date[] {
  const dates: Date[] = [];
  const totalEntries = decodedIds.length;

  if (totalEntries === 0) return dates;

  // startOffset is the week number from AMion epoch (Jan 1, 2000)
  // Convert to actual date: epoch + (startOffset * 7) days
  const epochDate = new Date(2000, 0, 1);
  const referenceDate = new Date(epochDate);
  referenceDate.setDate(referenceDate.getDate() + (startOffset * 7));

  // Determine the step size (weekly = 7 days)
  const daysPerEntry = Math.abs(increment) || 1;

  // Generate dates for each entry
  // If direction is -1, the data is stored newest-first, so we've already reversed it
  // Now entry 0 is the oldest, and we count forward from the reference date
  for (let i = 0; i < totalEntries; i++) {
    const date = new Date(referenceDate);
    date.setDate(date.getDate() + (i * daysPerEntry));
    dates.push(date);
  }

  return dates;
}

/**
 * Parse shift time from SHTM field
 * Format: SHTM=startMinutes endMinutes duration
 * e.g., SHTM=28 68 40 means 7am-5pm (28*15min = 420min = 7:00, 68*15min = 1020min = 17:00)
 */
function parseShiftTime(shtm: string): string | undefined {
  const parts = shtm.split(' ').map(Number);
  if (parts.length < 2) return undefined;

  const startQuarters = parts[0];
  const endQuarters = parts[1];

  // Convert from quarter-hours to hours
  const startHour = Math.floor(startQuarters / 4);
  const endHour = Math.floor(endQuarters / 4);

  // Format as "7a-5p" style
  const formatHour = (h: number): string => {
    if (h === 0) return "12a";
    if (h < 12) return `${h}a`;
    if (h === 12) return "12p";
    return `${h - 12}p`;
  };

  return `${formatHour(startHour)}-${formatHour(endHour)}`;
}

/**
 * Decode ROW binary data to extract schedule assignments using proper RLE decoding
 *
 * ROW format: ROW =startOffset count direction increment bytesPerEntry <binary_data>
 * Binary data uses RLE: [header1] [header2] [count1] [staffId1] [count2] [staffId2] ...
 */
function decodeROWData(
  rowData: string,
  spidData: string | undefined,
  serviceId: number,
  serviceName: string,
  staffIdMap: Map<number, AmionProvider>,
  scheduleYear: number,
  scheduleEndYear?: number
): AmionAssignment[] {
  const assignments: AmionAssignment[] = [];

  // Parse ROW header and binary data
  const rowParams = parseRowHeader(rowData);
  if (!rowParams) return assignments;

  // Decode primary provider assignments
  const primaryBytes = extractBytes(rowParams.binaryData);
  let primaryIds = decodeRLE(primaryBytes);

  // Decode secondary provider assignments (split shifts) if SPID exists
  let secondaryIds: number[] = [];
  if (spidData) {
    const spidParams = parseRowHeader(spidData);
    if (spidParams) {
      const spidBytes = extractBytes(spidParams.binaryData);
      secondaryIds = decodeRLE(spidBytes);
    }
  }

  // Reverse if direction is -1 (data stored newest first)
  if (rowParams.direction === -1) {
    primaryIds = primaryIds.reverse();
    if (secondaryIds.length > 0) {
      secondaryIds = secondaryIds.reverse();
    }
  }

  // Calculate dates based on schedule year range and increment
  const dates = calculateDates(
    rowParams.startOffset,
    primaryIds,
    rowParams.direction,
    rowParams.increment,
    scheduleYear,
    scheduleEndYear
  );

  // Create assignments for each entry
  for (let i = 0; i < primaryIds.length; i++) {
    const primaryId = primaryIds[i];
    const secondaryId = secondaryIds[i];
    const date = dates[i];

    // Skip empty/invalid assignments
    if (
      primaryId === SPECIAL_BYTES.EMPTY ||
      primaryId === SPECIAL_BYTES.EMPTY_SLOT ||
      primaryId === SPECIAL_BYTES.EMPTY_SLOT_2 ||
      SPECIAL_STAFF_IDS.has(primaryId)
    ) {
      continue;
    }

    const primaryStaff = staffIdMap.get(primaryId);

    // Skip if we can't resolve the staff ID (unknown provider)
    if (!primaryStaff) {
      continue;
    }

    const secondaryStaff = secondaryId && !SPECIAL_STAFF_IDS.has(secondaryId)
      ? staffIdMap.get(secondaryId)
      : undefined;

    assignments.push({
      serviceId,
      serviceName,
      providerId: primaryId,
      providerName: primaryStaff.name,
      date: date.toISOString().split('T')[0],
      secondaryProviderId: secondaryStaff ? secondaryId : undefined,
      secondaryProviderName: secondaryStaff?.name,
      isGenericTitle: isGenericTitle(primaryStaff.name) || isGenericTitle(serviceName),
    });
  }

  return assignments;
}

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
    amionServices: [],
    assignments: [],
    staffIdMap: new Map(),
    scheduleStartDate: "",
    scheduleEndDate: "",
    scheduleYear: new Date().getFullYear(),
    scheduleEndYear: undefined,
  };

  let currentSection = "";
  let currentProvider: Partial<AmionProvider> | null = null;
  let currentService: Partial<AmionService> | null = null;
  let currentSkill = "";
  let scheduleJday = 0;
  let collectingRowData = false;
  let collectingSpidData = false;
  let rowDataBuffer = "";
  let spidDataBuffer = "";
  let currentShiftTime = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Section markers
    if (trimmed.startsWith("SECT=")) {
      // Save current provider if exists
      if (currentProvider && currentProvider.name) {
        const provider = finalizeProvider(currentProvider);
        result.providers.push(provider);
        if (provider.amionId > 0) {
          result.staffIdMap.set(provider.amionId, provider);
        }
      }
      // Save current service if exists
      if (currentService && currentService.name) {
        result.amionServices.push(currentService as AmionService);
      }
      currentProvider = null;
      currentService = null;
      collectingRowData = false;
      currentSection = trimmed.substring(5);
      continue;
    }

    // Handle multi-line ROW data collection
    if (collectingRowData) {
      rowDataBuffer += line;
      if (line.includes('>')) {
        collectingRowData = false;
        // Finalize the service with ROW data
        if (currentService) {
          currentService.rawRowData = rowDataBuffer;
        }
        rowDataBuffer = "";
      }
      continue;
    }

    // Handle multi-line SPID data collection
    if (collectingSpidData) {
      spidDataBuffer += line;
      if (line.includes('>')) {
        collectingSpidData = false;
        // Finalize the service with SPID data
        if (currentService) {
          currentService.rawSpidData = spidDataBuffer;
        }
        spidDataBuffer = "";
      }
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
      // Format: YEAR=2024 1 8 :2024 2026
      // First number is base year, last number after colon is end year
      const yearMatch = trimmed.match(/YEAR=(\d+).*:(\d+)\s+(\d+)/);
      if (yearMatch) {
        result.scheduleYear = parseInt(yearMatch[1], 10);
        // The end year is the last number in the sequence
        const endYear = parseInt(yearMatch[3], 10);
        if (endYear > result.scheduleYear) {
          result.scheduleEndYear = endYear;
        }
      } else {
        // Fallback to simple match
        const simpleMatch = trimmed.match(/YEAR=(\d+)/);
        if (simpleMatch) {
          result.scheduleYear = parseInt(simpleMatch[1], 10);
        }
      }
      continue;
    }
    if (trimmed.startsWith("JDAY=")) {
      scheduleJday = parseInt(trimmed.substring(5), 10);
      if (scheduleJday > 0) {
        const startDate = julianDayToDate(scheduleJday);
        result.scheduleStartDate = startDate.toISOString().split('T')[0];
      }
      continue;
    }

    // Staff section parsing
    if (currentSection === "staff") {
      if (trimmed.startsWith("NAME=")) {
        // Save previous provider
        if (currentProvider && currentProvider.name) {
          const provider = finalizeProvider(currentProvider);
          result.providers.push(provider);
          if (provider.amionId > 0) {
            result.staffIdMap.set(provider.amionId, provider);
          }
        }
        currentProvider = {
          name: trimmed.substring(5),
          additionalContacts: [],
          amionId: 0,
        };
      } else if (currentProvider) {
        if (trimmed.startsWith("ABBR=")) {
          currentProvider.abbreviation = trimmed.substring(5);
        } else if (trimmed.startsWith("TYPE=")) {
          currentProvider.type = parseInt(trimmed.substring(5), 10);
          currentProvider.roleLabel = TYPE_TO_ROLE[currentProvider.type] || "Unknown";
        } else if (trimmed.startsWith("ID  =")) {
          // Staff ID for ROW decoding
          currentProvider.amionId = parseInt(trimmed.substring(5), 10);
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

    // Service section parsing (for basic service list)
    if (currentSection === "service") {
      if (trimmed.startsWith("NAME=")) {
        const serviceName = trimmed.substring(5);
        if (serviceName && !result.services.includes(serviceName)) {
          result.services.push(serviceName);
        }
      }
    }

    // XLN section parsing (extended schedule lines with ROW data)
    if (currentSection === "xln") {
      if (trimmed.startsWith("NAME=")) {
        // Save previous service
        if (currentService && currentService.name) {
          result.amionServices.push(currentService as AmionService);
        }
        const serviceName = trimmed.substring(5);
        currentService = {
          name: serviceName,
          id: 0,
          isGenericTitle: isGenericTitle(serviceName),
        };
        currentShiftTime = "";
      } else if (currentService) {
        if (trimmed.startsWith("ID  =")) {
          currentService.id = parseInt(trimmed.substring(5), 10);
        } else if (trimmed.startsWith("SHTM=")) {
          currentShiftTime = trimmed.substring(5);
          currentService.shiftDisplay = parseShiftTime(currentShiftTime);
        } else if (trimmed.startsWith("ROW =")) {
          // ROW data might span multiple lines
          rowDataBuffer = trimmed.substring(5);
          if (!trimmed.includes('>')) {
            collectingRowData = true;
          } else {
            currentService.rawRowData = rowDataBuffer;
            rowDataBuffer = "";
          }
        } else if (trimmed.startsWith("SPID=")) {
          // SPID data for secondary provider (split shifts)
          spidDataBuffer = trimmed.substring(5);
          if (!trimmed.includes('>')) {
            collectingSpidData = true;
          } else {
            currentService.rawSpidData = spidDataBuffer;
            spidDataBuffer = "";
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

  // Don't forget last provider/service
  if (currentProvider && currentProvider.name) {
    const provider = finalizeProvider(currentProvider);
    result.providers.push(provider);
    if (provider.amionId > 0) {
      result.staffIdMap.set(provider.amionId, provider);
    }
  }
  if (currentService && currentService.name) {
    result.amionServices.push(currentService as AmionService);
  }

  // Decode ROW data for all services to get assignments
  // Note: We decode regardless of scheduleStartDate since dates come from ROW header
  if (result.staffIdMap.size > 0) {
    // Define the relevant date range based on schedule years
    const startYear = result.scheduleYear;
    const endYear = result.scheduleEndYear || result.scheduleYear;
    const rangeStartDate = `${startYear}-01-01`;
    const rangeEndDate = `${endYear}-12-31`;

    for (const service of result.amionServices) {
      if (service.rawRowData) {
        const serviceAssignments = decodeROWData(
          service.rawRowData,
          service.rawSpidData,
          service.id,
          service.name,
          result.staffIdMap,
          result.scheduleYear,
          result.scheduleEndYear
        );

        // Filter to only include assignments within the schedule year range
        const filteredAssignments = serviceAssignments.filter(a =>
          a.date >= rangeStartDate && a.date <= rangeEndDate
        );
        result.assignments.push(...filteredAssignments);
      }
    }
  }

  // Calculate schedule date range from assignments
  if (result.assignments.length > 0) {
    const dates = result.assignments.map(a => a.date).sort();
    result.scheduleStartDate = dates[0];
    result.scheduleEndDate = dates[dates.length - 1];
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
    amionId: partial.amionId || 0,
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
  servicesCount: number;
  assignmentsCount: number;
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
    servicesCount: result.amionServices.length,
    assignmentsCount: result.assignments.length,
  };
}

/**
 * Get assignments grouped by service (for grid display)
 */
export function getAssignmentsByService(
  result: AmionParseResult
): Map<string, AmionAssignment[]> {
  const byService = new Map<string, AmionAssignment[]>();

  for (const assignment of result.assignments) {
    const existing = byService.get(assignment.serviceName) || [];
    existing.push(assignment);
    byService.set(assignment.serviceName, existing);
  }

  return byService;
}

/**
 * Get assignments grouped by date (for calendar display)
 */
export function getAssignmentsByDate(
  result: AmionParseResult
): Map<string, AmionAssignment[]> {
  const byDate = new Map<string, AmionAssignment[]>();

  for (const assignment of result.assignments) {
    const existing = byDate.get(assignment.date) || [];
    existing.push(assignment);
    byDate.set(assignment.date, existing);
  }

  return byDate;
}

/**
 * Get all assignments for a specific provider
 */
export function getProviderAssignments(
  result: AmionParseResult,
  providerId: number
): AmionAssignment[] {
  return result.assignments.filter(a => a.providerId === providerId);
}

/**
 * Get unique dates in the schedule
 */
export function getScheduleDates(result: AmionParseResult): string[] {
  const dates = new Set<string>();
  for (const assignment of result.assignments) {
    dates.add(assignment.date);
  }
  return Array.from(dates).sort();
}

// ═══════════════════════════════════════════════════════════════════
// CSV SCHEDULE PARSER
// For importing generic CSV schedule files
// ═══════════════════════════════════════════════════════════════════

export interface ScheduleAssignmentRow {
  providerName: string;
  providerFirstName?: string;
  providerLastName?: string;
  date: string;
  rotation: string;
  notes?: string;
}

export interface ScheduleCSVParseResult {
  assignments: ScheduleAssignmentRow[];
  errors: string[];
  rotationsFound: string[];
}

/**
 * Parse a CSV file with schedule data
 * Expected columns: Provider Name (or First/Last), Date, Rotation/Service, Notes (optional)
 */
export function parseScheduleCSV(content: string): ScheduleCSVParseResult {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length < 2) {
    return {
      assignments: [],
      errors: ['CSV file must have at least a header row and one data row'],
      rotationsFound: [],
    };
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map(h => h.toLowerCase().trim());

  // Find column indices
  const providerNameIdx = findColumnIndex(headers, ['provider name', 'provider', 'name']);
  const firstNameIdx = findColumnIndex(headers, ['first name', 'first', 'firstname']);
  const lastNameIdx = findColumnIndex(headers, ['last name', 'last', 'lastname']);
  const dateIdx = findColumnIndex(headers, ['date', 'shift date', 'assignment date']);
  const rotationIdx = findColumnIndex(headers, ['rotation', 'service', 'assignment', 'shift']);
  const notesIdx = findColumnIndex(headers, ['notes', 'comments', 'note']);

  // Validate required columns
  const hasProviderName = providerNameIdx >= 0;
  const hasFirstLast = firstNameIdx >= 0 && lastNameIdx >= 0;

  if (!hasProviderName && !hasFirstLast) {
    return {
      assignments: [],
      errors: ['CSV must have either "Provider Name" column or both "First Name" and "Last Name" columns'],
      rotationsFound: [],
    };
  }

  if (dateIdx < 0) {
    return {
      assignments: [],
      errors: ['CSV must have a "Date" column'],
      rotationsFound: [],
    };
  }

  if (rotationIdx < 0) {
    return {
      assignments: [],
      errors: ['CSV must have a "Rotation" or "Service" column'],
      rotationsFound: [],
    };
  }

  const assignments: ScheduleAssignmentRow[] = [];
  const errors: string[] = [];
  const rotationsSet = new Set<string>();

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = parseCSVLine(line);

    try {
      const providerName = hasProviderName
        ? values[providerNameIdx]?.trim() || ''
        : `${values[firstNameIdx]?.trim() || ''} ${values[lastNameIdx]?.trim() || ''}`.trim();

      if (!providerName) {
        errors.push(`Row ${i + 1}: Missing provider name`);
        continue;
      }

      const dateStr = values[dateIdx]?.trim() || '';
      const normalizedDate = normalizeCSVDate(dateStr);
      if (!normalizedDate) {
        errors.push(`Row ${i + 1}: Invalid date "${dateStr}"`);
        continue;
      }

      const rotation = values[rotationIdx]?.trim() || '';
      if (!rotation) {
        errors.push(`Row ${i + 1}: Missing rotation/service`);
        continue;
      }

      rotationsSet.add(rotation);

      const firstName = hasFirstLast ? values[firstNameIdx]?.trim() : undefined;
      const lastName = hasFirstLast ? values[lastNameIdx]?.trim() : undefined;

      assignments.push({
        providerName,
        providerFirstName: firstName,
        providerLastName: lastName,
        date: normalizedDate,
        rotation,
        notes: notesIdx >= 0 ? values[notesIdx]?.trim() : undefined,
      });
    } catch (e) {
      errors.push(`Row ${i + 1}: Parse error - ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  return {
    assignments,
    errors,
    rotationsFound: Array.from(rotationsSet).sort(),
  };
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Find column index by trying multiple possible names
 */
function findColumnIndex(headers: string[], possibleNames: string[]): number {
  for (const name of possibleNames) {
    const idx = headers.findIndex(h => h.includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Normalize date string to ISO format (YYYY-MM-DD)
 */
function normalizeCSVDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Handle MM/DD/YYYY or M/D/YY format
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Handle YYYY-MM-DD format (already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try Date parsing as fallback
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

// Helper to get service details from AmionParseResult for display
export function getServiceDetails(result: AmionParseResult): Array<{
  name: string;
  typeLabel: string;
  lins: number;
}> {
  return result.amionServices.map(svc => ({
    name: svc.name,
    typeLabel: svc.isGenericTitle ? 'generic' :
      (svc.name.toLowerCase().includes('vac') || svc.name.toLowerCase().includes('sick')) ? 'vacation' : 'service',
    lins: 1,
  }));
}

// Helper to get rotation names from AmionParseResult
export function getRotationNames(result: AmionParseResult): string[] {
  return result.services;
}
