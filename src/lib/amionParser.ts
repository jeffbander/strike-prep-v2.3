/**
 * AMion .sch File Parser
 * Parses the proprietary AMion schedule file format to extract provider data
 * and decode schedule assignments from ROW binary data
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
}

export interface AmionAssignment {
  serviceId: number;       // Service ID
  serviceName: string;
  providerId: number;      // Staff ID (decoded from ROW)
  providerName: string;
  date: string;            // "2025-12-01"
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
  scheduleYear: number;
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
 * Convert Julian day number to a Date object
 * AMion uses a custom epoch: day 0 = Jan 1, 1990
 */
function julianDayToDate(jday: number): Date {
  // AMion epoch: January 1, 1990
  const epoch = new Date(1990, 0, 1);
  const result = new Date(epoch);
  result.setDate(epoch.getDate() + jday);
  return result;
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
 * Decode ROW binary data to extract daily assignments
 * Each character's ASCII value = staff ID for that day
 *
 * ROW format: ROW =1167 [param1] -1 -7 [numDays] <[binary_data]>
 * - 1167 is a base reference
 * - numDays is the number of days in the schedule
 * - binary_data contains staff IDs as ASCII characters
 */
function decodeROWData(
  rowData: string,
  serviceId: number,
  serviceName: string,
  startDate: Date,
  staffIdMap: Map<number, AmionProvider>
): AmionAssignment[] {
  const assignments: AmionAssignment[] = [];

  // Extract binary content between < and >
  // Handle multi-line ROW data
  const match = rowData.match(/<([^>]*)>/);
  if (!match) return assignments;

  const binaryData = match[1];

  for (let i = 0; i < binaryData.length; i++) {
    const charCode = binaryData.charCodeAt(i);

    // Skip control characters and special chars (no assignment or separator)
    if (charCode < 33 || charCode > 200) continue;

    const staffId = charCode;
    const staff = staffIdMap.get(staffId);

    if (staff) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      assignments.push({
        serviceId,
        serviceName,
        providerId: staffId,
        providerName: staff.name,
        date: date.toISOString().split('T')[0],
      });
    }
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
    scheduleYear: new Date().getFullYear(),
  };

  let currentSection = "";
  let currentProvider: Partial<AmionProvider> | null = null;
  let currentService: Partial<AmionService> | null = null;
  let currentSkill = "";
  let scheduleJday = 0;
  let collectingRowData = false;
  let rowDataBuffer = "";
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
      const yearMatch = trimmed.match(/YEAR=(\d+)/);
      if (yearMatch) {
        result.scheduleYear = parseInt(yearMatch[1], 10);
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
        currentService = {
          name: trimmed.substring(5),
          id: 0,
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
  if (result.scheduleStartDate && result.staffIdMap.size > 0) {
    const startDate = new Date(result.scheduleStartDate);

    for (const service of result.amionServices) {
      if (service.rawRowData) {
        const serviceAssignments = decodeROWData(
          service.rawRowData,
          service.id,
          service.name,
          startDate,
          result.staffIdMap
        );
        result.assignments.push(...serviceAssignments);
      }
    }
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
