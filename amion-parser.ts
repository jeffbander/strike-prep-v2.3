/**
 * Amion .sch File Parser
 * Complete TypeScript implementation for Next.js + Convex
 * 
 * Usage:
 *   const parser = new AmionParser(fileContent);
 *   const result = parser.parse();
 */

// ============================================================================
// TYPES
// ============================================================================

export interface AmionStaff {
  id: number;           // Internal ID (used in ROW binary data)
  unid: number;         // External unique ID
  name: string;
  abbreviation: string;
  type: number;         // 1=staff, 3=provider, 15=composite
  pager?: string;
  phone?: string;
  email?: string;
}

export interface AmionService {
  id: number;
  unid: number;
  name: string;
  type: number;         // 2=service, 4=special, 15=composite
  parentId?: number;    // CPAR field - links to parent service
  shiftStart?: number;  // Quarter-hours from midnight
  shiftEnd?: number;
  shiftDuration?: number;
  description?: string; // WOHD field
}

export interface ScheduleEntry {
  date: Date;
  dateStr: string;      // YYYY-MM-DD
  serviceName: string;
  serviceId: number;
  primaryStaffId?: number;
  primaryStaffName?: string;
  secondaryStaffId?: number;
  secondaryStaffName?: string;
  isEmpty: boolean;
}

export interface AmionHoliday {
  date: Date;
  dateStr: string;
  jdn: number;
  type: number;
  name: string;
}

export interface AmionParseResult {
  // Metadata
  siteId: string;
  department: string;
  lastModified: Date;
  contact: string;
  yearRange: string;
  
  // Extracted data
  staff: AmionStaff[];
  services: AmionService[];
  holidays: AmionHoliday[];
  schedule: ScheduleEntry[];
  
  // Lookup maps (for convenience)
  staffById: Map<number, AmionStaff>;
  staffByPager: Map<string, AmionStaff>;
  serviceById: Map<number, AmionService>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const EPOCH = new Date(2000, 0, 1); // January 1, 2000

const SPECIAL_BYTES = {
  EMPTY: 0,
  EMPTY_SLOT: 250,    // 0xFA
  DISABLED: 255,      // 0xFF
  WEEK_MARKER_1: 252, // 0xFC
  WEEK_MARKER_2: 7,   // 0x07
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert Amion Julian Day Number to JavaScript Date
 */
export function jdnToDate(jdn: number): Date {
  return new Date(EPOCH.getTime() + jdn * 86400000);
}

/**
 * Convert JavaScript Date to Amion Julian Day Number
 */
export function dateToJdn(date: Date): number {
  return Math.floor((date.getTime() - EPOCH.getTime()) / 86400000);
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Normalize phone/pager number for matching
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Convert quarter-hour value to time string
 */
export function quarterHourToTime(qh: number): string {
  const totalMinutes = qh * 15;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// ============================================================================
// PARSER CLASS
// ============================================================================

export class AmionParser {
  private content: string;
  private staffById: Map<number, AmionStaff> = new Map();
  private serviceById: Map<number, AmionService> = new Map();
  
  constructor(content: string) {
    this.content = content;
  }
  
  /**
   * Parse the .sch file and return all extracted data
   */
  parse(): AmionParseResult {
    // Parse metadata
    const siteId = this.extractField('Sid') || '';
    const department = this.extractDepartment();
    const lastModified = this.extractLastModified();
    const contact = this.extractField('CONT') || '';
    const yearRange = this.extractYearRange();
    
    // Parse sections
    const staff = this.parseStaffSection();
    staff.forEach(s => this.staffById.set(s.id, s));
    
    const services = this.parseServiceSection();
    services.forEach(s => this.serviceById.set(s.id, s));
    
    const holidays = this.parseHolidays();
    const schedule = this.parseXlnSchedule();
    
    // Build lookup maps
    const staffByPager = new Map<string, AmionStaff>();
    staff.forEach(s => {
      if (s.pager) {
        staffByPager.set(normalizePhone(s.pager), s);
      }
    });
    
    return {
      siteId,
      department,
      lastModified,
      contact,
      yearRange,
      staff,
      services,
      holidays,
      schedule,
      staffById: this.staffById,
      staffByPager,
      serviceById: this.serviceById,
    };
  }
  
  // --------------------------------------------------------------------------
  // Metadata Extraction
  // --------------------------------------------------------------------------
  
  private extractField(fieldName: string): string | null {
    const match = this.content.match(new RegExp(`${fieldName}[=\\n]\\s*([^\\n]+)`));
    return match ? match[1].trim() : null;
  }
  
  private extractDepartment(): string {
    // Look in SECT=data section
    // Use [\s\S] instead of . with /s flag for ES5 compatibility
    const dataSection = this.content.match(/SECT=data\n([\s\S]*?)$/)?.[1] || '';
    const deptMatch = dataSection.match(/NAME=([^\n]+)/);
    if (deptMatch) return deptMatch[1].trim();

    // Fallback to first page name
    const pageMatch = this.content.match(/SECT=page\n[\s\S]*?NAME=([^\n]+)/);
    return pageMatch ? pageMatch[1].trim() : 'Unknown';
  }
  
  private extractLastModified(): Date {
    const timeStr = this.extractField('TIME');
    if (timeStr) {
      // Format: "Jan 2 16:59 2026"
      const parsed = new Date(timeStr);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  }
  
  private extractYearRange(): string {
    const yearMatch = this.content.match(/YEAR=(\d+)\s+\d+\s+\d+\s*:(\d+)\s+(\d+)/);
    if (yearMatch) {
      return `${yearMatch[2]} - ${yearMatch[3]}`;
    }
    return '';
  }
  
  // --------------------------------------------------------------------------
  // Staff Parsing
  // --------------------------------------------------------------------------
  
  private parseStaffSection(): AmionStaff[] {
    const staffSection = this.content.match(/SECT=staff\n([\s\S]*?)(?=SECT=skill|SECT=pattern|$)/)?.[1] || '';
    const records = staffSection.split(/\nNAME=/);
    
    const staff: AmionStaff[] = [];
    
    for (const record of records) {
      if (!record.trim()) continue;
      if (record.includes('TYPE=15')) continue; // Skip composite services
      
      const name = record.split('\n')[0].trim();
      if (!name) continue;
      
      // CRITICAL: Extract ID (not UNID) - this is used in ROW binary data
      const idMatch = record.match(/(?:^|\n)ID\s*=\s*(\d+)/);
      const id = idMatch ? parseInt(idMatch[1]) : 0;
      
      const unid = parseInt(record.match(/UNID=(\d+)/)?.[1] || '0');
      const abbreviation = record.match(/ABBR=([^\n]+)/)?.[1]?.trim() || '';
      const type = parseInt(record.match(/TYPE=(\d+)/)?.[1] || '0');
      const pager = record.match(/PAGR=([^\n]+)/)?.[1]?.trim();
      const phone = record.match(/TELE=([^\n]+)/)?.[1]?.trim();
      
      if (id > 0) {
        staff.push({ id, unid, name, abbreviation, type, pager, phone });
      }
    }
    
    return staff;
  }
  
  // --------------------------------------------------------------------------
  // Service Parsing
  // --------------------------------------------------------------------------
  
  private parseServiceSection(): AmionService[] {
    const serviceSection = this.content.match(/SECT=service\n([\s\S]*?)(?=SECT=staff)/)?.[1] || '';
    const records = serviceSection.split(/\nNAME=/);
    
    const services: AmionService[] = [];
    
    for (const record of records) {
      if (!record.trim()) continue;
      
      const name = record.split('\n')[0].trim();
      if (!name) continue;
      
      const id = parseInt(record.match(/(?:^|\n)ID\s*=\s*(\d+)/)?.[1] || '0');
      const unid = parseInt(record.match(/UNID=(\d+)/)?.[1] || '0');
      const type = parseInt(record.match(/TYPE=(\d+)/)?.[1] || '0');
      
      // Parse shift time (SHTM)
      const shtmMatch = record.match(/SHTM=(\d+)\s+(\d+)\s+(\d+)/);
      let shiftStart, shiftEnd, shiftDuration;
      if (shtmMatch) {
        shiftStart = parseInt(shtmMatch[1]);
        shiftEnd = parseInt(shtmMatch[2]);
        shiftDuration = parseInt(shtmMatch[3]);
      }
      
      if (id > 0) {
        services.push({ id, unid, name, type, shiftStart, shiftEnd, shiftDuration });
      }
    }
    
    return services;
  }
  
  // --------------------------------------------------------------------------
  // Holiday Parsing
  // --------------------------------------------------------------------------
  
  private parseHolidays(): AmionHoliday[] {
    const holidays: AmionHoliday[] = [];
    
    const holiMatch = this.content.match(/HOLI=(\d+)\s+\d+\n([\s\S]*?)(?=\n[A-Z]{4}=|\nSECT=)/);
    if (!holiMatch) return holidays;
    
    const lines = holiMatch[2].split('\n');
    for (const line of lines) {
      const match = line.match(/(\d+)\s+(\d+)\s+"(.+)/);
      if (match) {
        const jdn = parseInt(match[1]);
        const type = parseInt(match[2]);
        const name = match[3].trim();
        const date = jdnToDate(jdn);
        
        holidays.push({
          jdn,
          type,
          name,
          date,
          dateStr: formatDateStr(date),
        });
      }
    }
    
    return holidays;
  }
  
  // --------------------------------------------------------------------------
  // Schedule Parsing (SECT=xln with TYPE=15)
  // --------------------------------------------------------------------------
  
  private parseXlnSchedule(): ScheduleEntry[] {
    const xlnSection = this.content.match(/SECT=xln\n([\s\S]*?)(?=SECT=pattern|$)/)?.[1] || '';
    const entries: ScheduleEntry[] = [];
    
    // Find all TYPE=15 composite services with ROW data
    const records = xlnSection.split(/\nNAME=/);
    
    for (const record of records) {
      if (!record.includes('TYPE=15')) continue;
      
      const serviceName = record.split('\n')[0].trim();
      const serviceId = parseInt(record.match(/(?:^|\n)ID\s*=\s*(\d+)/)?.[1] || '0');
      
      // Extract ROW (primary assignments)
      const rowMatch = record.match(/ROW\s*=\s*(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+(\d+)\s*<([^>]+)>/);
      if (!rowMatch) continue;
      
      const startOffset = parseInt(rowMatch[1]);
      const count = parseInt(rowMatch[2]);
      const direction = parseInt(rowMatch[3]);
      const increment = parseInt(rowMatch[4]);
      const bytesPerEntry = parseInt(rowMatch[5]);
      const rowBytes = this.extractBytes(rowMatch[6]);
      
      // Extract SPID (secondary assignments for split shifts)
      const spidMatch = record.match(/SPID\s*=\s*\d+\s+\d+\s+-?\d+\s+-?\d+\s+\d+\s*<([^>]+)>/);
      const spidBytes = spidMatch ? this.extractBytes(spidMatch[1]) : [];
      
      // Decode RLE data
      const primaryIds = this.decodeRLE(rowBytes);
      const secondaryIds = spidBytes.length > 0 ? this.decodeRLE(spidBytes) : [];
      
      // Reverse if needed (direction=-1 means newest first)
      if (direction === -1) {
        primaryIds.reverse();
        if (secondaryIds.length > 0) secondaryIds.reverse();
      }
      
      // Calculate dates
      // For now, assume the data ends at "today" and work backwards
      // A more accurate implementation would calibrate using known data
      const referenceDate = new Date();
      const totalDays = primaryIds.length;
      
      for (let i = 0; i < primaryIds.length; i++) {
        const date = new Date(referenceDate);
        date.setDate(date.getDate() - totalDays + i + 1);
        
        const primaryId = primaryIds[i];
        const secondaryId = secondaryIds[i];
        
        const primaryStaff = this.staffById.get(primaryId);
        const secondaryStaff = secondaryId ? this.staffById.get(secondaryId) : undefined;
        
        const isEmpty = primaryId === 0 || primaryId === SPECIAL_BYTES.EMPTY_SLOT;
        
        entries.push({
          date,
          dateStr: formatDateStr(date),
          serviceName,
          serviceId,
          primaryStaffId: isEmpty ? undefined : primaryId,
          primaryStaffName: primaryStaff?.name,
          secondaryStaffId: secondaryStaff ? secondaryId : undefined,
          secondaryStaffName: secondaryStaff?.name,
          isEmpty,
        });
      }
    }
    
    return entries;
  }
  
  /**
   * Extract bytes from raw string data
   */
  private extractBytes(rawData: string): number[] {
    return [...rawData].map(c => c.charCodeAt(0));
  }
  
  /**
   * Decode Run-Length Encoded schedule data
   * Format: [header1] [header2] [count1] [staffId1] [count2] [staffId2] ...
   */
  private decodeRLE(bytes: number[]): number[] {
    const result: number[] = [];
    let i = 2; // Skip 2-byte header
    
    while (i < bytes.length - 1) {
      const count = bytes[i];
      const staffId = bytes[i + 1];
      
      // Validate count
      if (count === 0 || count > 50) {
        i++;
        continue;
      }
      
      // Check for weekly override marker (fc 07)
      if (count === SPECIAL_BYTES.WEEK_MARKER_1 && staffId === SPECIAL_BYTES.WEEK_MARKER_2) {
        // Skip override section for now
        i += 11; // marker + ref + sep + 7 days
        continue;
      }
      
      // Add assignments
      for (let j = 0; j < count; j++) {
        result.push(staffId);
      }
      
      i += 2;
    }
    
    return result;
  }
  
  // --------------------------------------------------------------------------
  // Query Methods
  // --------------------------------------------------------------------------
  
  /**
   * Get schedule entries for a specific date range
   */
  getScheduleForDateRange(
    startDate: Date,
    endDate: Date,
    serviceName?: string
  ): ScheduleEntry[] {
    const result = this.parse();
    
    return result.schedule.filter(entry => {
      const inRange = entry.date >= startDate && entry.date <= endDate;
      const matchesService = !serviceName || entry.serviceName.includes(serviceName);
      return inRange && matchesService;
    });
  }
  
  /**
   * Get all schedule entries for a specific staff member
   */
  getScheduleForStaff(staffId: number): ScheduleEntry[] {
    const result = this.parse();
    
    return result.schedule.filter(entry => 
      entry.primaryStaffId === staffId || entry.secondaryStaffId === staffId
    );
  }
  
  /**
   * Find a staff member by pager number
   */
  findStaffByPager(pager: string): AmionStaff | undefined {
    const normalized = normalizePhone(pager);
    const result = this.parse();
    return result.staffByPager.get(normalized);
  }
}

// ============================================================================
// HELPER FUNCTIONS FOR CONVEX
// ============================================================================

/**
 * Parse an uploaded .sch file from Convex storage
 */
export async function parseAmionFromStorage(
  storageUrl: string
): Promise<AmionParseResult> {
  const response = await fetch(storageUrl);
  const buffer = await response.arrayBuffer();
  
  // CRITICAL: Use ISO-8859-1 (Latin-1) encoding for binary data
  const decoder = new TextDecoder('iso-8859-1');
  const content = decoder.decode(buffer);
  
  const parser = new AmionParser(content);
  return parser.parse();
}

/**
 * Parse an uploaded file from browser
 */
export async function parseAmionFromFile(file: File): Promise<AmionParseResult> {
  const buffer = await file.arrayBuffer();
  const decoder = new TextDecoder('iso-8859-1');
  const content = decoder.decode(buffer);
  
  const parser = new AmionParser(content);
  return parser.parse();
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  EPOCH,
  SPECIAL_BYTES,
};
