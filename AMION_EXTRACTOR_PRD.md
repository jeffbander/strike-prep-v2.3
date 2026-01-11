# Amion Schedule Extractor - Product Requirements Document & Claude Code Prompt

## Executive Summary

Build an Amion .sch file parser and schedule extractor to integrate into the existing Strike Coverage Planning app. This will automatically extract provider schedules from Amion files, enabling rapid identification of where attending physicians and fellows are assigned during nursing/NP strikes—helping fill coverage gaps in the strike planning grid.

---

## Part 1: Claude Code Implementation Prompt

### Prompt for Claude Code

```
I need you to build an Amion .sch file parser and schedule extractor feature for my existing Next.js + Convex strike planning app.

## Context
We're building a hospital strike coverage tool. When nurses or NPs strike, attendings and fellows may need to cover. We use Amion for scheduling but need to extract schedules programmatically to know where providers are assigned on any given day.

## What You're Building
A complete Amion .sch file parser that:
1. Parses the proprietary binary/text format
2. Extracts all staff members with their IDs, names, pagers, phones
3. Extracts all services/roles (EP Attending, On Call, Consult, etc.)
4. Decodes the RLE-encoded schedule data to get date→provider assignments
5. Handles split shifts (primary + secondary provider)
6. Provides an API to query "who is working [service] on [date]?"

## Technical Stack
- Next.js 14+ with App Router
- Convex backend (convex.dev)
- TypeScript throughout
- File uploads via Convex file storage

## File Format Specification (CRITICAL - Use This Exact Knowledge)

### Overall Structure
The .sch file is a multipart text/binary format with these sections in order:
1. HTTP multipart header (Sid, Lo, Admin, Msgo, ulf fields)
2. Global configuration (YEAR, BLDT, TIME, CONT, GMTO, HOLI, etc.)
3. SECT=page (view definitions)
4. SECT=service (department/service definitions)
5. SECT=staff (provider records - but NOT schedule data)
6. SECT=skill, SECT=clinic, SECT=xcov (usually empty)
7. SECT=xln (CRITICAL: This contains TYPE=15 composite services with actual schedule data)
8. SECT=pattern, SECT=site, SECT=rule, SECT=data

### Staff Record Structure (in SECT=staff)
```
NAME=BANDER, J.
ABBR=JB
TYPE=1                    # 1=regular staff, 3=provider, 15=composite service
UNID=136                  # External unique ID
ID  =63                   # CRITICAL: Internal ID used in ROW binary data
ROW =...                  # Staff's own schedule reference
VSET=48
PAGR=6465565559          # Pager - use for cross-file matching
TELE=office: 212-555-1234
```

### Composite Service Structure (in SECT=xln) - WHERE SCHEDULE DATA LIVES
```
NAME=MSW ON CALL ATTENDING
TYPE=15                   # Composite service type
UNID=54
ID  =6
ROW =1167 269 -1 -7 70 <binary_data>
SPID=1167 433 -1 -7 70 <binary_data>   # Secondary provider (for split shifts)
SPTM=1167 140 -1 -7 42 <binary_data>   # Split time boundaries
VSET=48
QC  =126
CPAR=5                    # Parent service ID (links to SECT=service)
SHTM=28 72 44            # Shift time: start=7AM (28×15min), end=6PM (72×15min), duration=11h
```

### ROW Binary Encoding - THE CORE ALGORITHM
```
ROW =startOffset count direction increment bytesPerEntry <binary_data>
```

Parameters:
- startOffset: Reference point (often 1167, used for date calculation)
- count: Number of schedule entries
- direction: -1 = reverse chronological (newest first), 1 = forward
- increment: -7 = weekly blocks, -1 = daily
- bytesPerEntry: Bytes per time slot (varies 42-70)

Binary data format after 2-byte header:
```
[header_byte1] [header_byte2] [count1] [staffID1] [count2] [staffID2] ...
```

This is Run-Length Encoding (RLE):
- (count, staffID) pairs
- count = number of consecutive days with this assignment
- staffID = references the ID field (NOT UNID) from SECT=staff

Example:
```
bytes: [10, 14, 1, 0, 1, 110, 7, 139, 7, 54, 7, 63]
decode:
  skip header [10, 14]
  1 day: ID 0 (empty)
  1 day: ID 110 (Leis, P)
  7 days: ID 139 (ZAREMSKI, L)
  7 days: ID 54 (KORNBERG, R.)
  7 days: ID 63 (BANDER, J.)
```

### Special Byte Values
- 0x00 (0): Empty/no assignment
- 0xFA (250): Empty slot marker
- 0xFF (255): Disabled/not applicable
- 0xFC 0x07 (252, 7): Weekly override section marker

### Split Shifts
When SPID field exists, it contains secondary provider assignments in same RLE format.
Combine ROW (primary) + SPID (secondary) for full picture:
- Day with ROW=54, SPID=191 means "KORNBERG primary, chad_harris secondary"

### Date Calculation
Amion uses Julian Day Numbers with epoch January 1, 2000:
```typescript
const EPOCH = new Date(2000, 0, 1);
function jdnToDate(jdn: number): Date {
  return new Date(EPOCH.getTime() + jdn * 86400000);
}
```

The schedule data is stored reverse chronologically (direction=-1), so:
- First decoded entry = most recent date
- Reverse the array to get chronological order

### Holiday Detection
```
HOLI=24 0
10221 1 "Christmas
10228 1 "New year
...
```
Format: JDN, type, "name

## Implementation Requirements

### 1. Convex Schema (convex/schema.ts additions)
```typescript
// Add to existing schema
amionFiles: defineTable({
  filename: v.string(),
  storageId: v.id("_storage"),
  uploadedAt: v.number(),
  siteId: v.string(),
  department: v.string(),
  parsed: v.boolean(),
})
  .index("by_site", ["siteId"]),

amionStaff: defineTable({
  fileId: v.id("amionFiles"),
  staffId: v.number(),        // The ID field, NOT UNID
  unid: v.number(),
  name: v.string(),
  abbreviation: v.string(),
  staffType: v.number(),
  pager: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
})
  .index("by_file", ["fileId"])
  .index("by_pager", ["pager"]),

amionServices: defineTable({
  fileId: v.id("amionFiles"),
  serviceId: v.number(),
  name: v.string(),
  serviceType: v.number(),
  parentId: v.optional(v.number()),
  shiftStart: v.optional(v.number()),  // Quarter-hours from midnight
  shiftEnd: v.optional(v.number()),
  shiftDuration: v.optional(v.number()),
})
  .index("by_file", ["fileId"]),

amionSchedule: defineTable({
  fileId: v.id("amionFiles"),
  serviceId: v.number(),
  serviceName: v.string(),
  date: v.string(),           // ISO date string YYYY-MM-DD
  primaryStaffId: v.optional(v.number()),
  primaryStaffName: v.optional(v.string()),
  secondaryStaffId: v.optional(v.number()),
  secondaryStaffName: v.optional(v.string()),
})
  .index("by_file_date", ["fileId", "date"])
  .index("by_service_date", ["serviceName", "date"])
  .index("by_staff_date", ["primaryStaffId", "date"]),
```

### 2. Parser Library (lib/amion-parser.ts)
Create a comprehensive parser class:
```typescript
interface AmionStaff {
  id: number;           // Internal ID used in ROW data
  unid: number;         // External unique ID
  name: string;
  abbreviation: string;
  type: number;
  pager?: string;
  phone?: string;
}

interface AmionService {
  id: number;
  name: string;
  type: number;
  parentId?: number;
  shiftTime?: { start: number; end: number; duration: number };
}

interface ScheduleEntry {
  date: Date;
  primaryStaffId?: number;
  primaryStaffName?: string;
  secondaryStaffId?: number;
  secondaryStaffName?: string;
}

interface AmionSchedule {
  siteId: string;
  department: string;
  lastModified: Date;
  staff: AmionStaff[];
  services: AmionService[];
  scheduleByService: Map<string, ScheduleEntry[]>;
}

class AmionParser {
  parse(content: string): AmionSchedule;
  private parseGlobalConfig(content: string): GlobalConfig;
  private parseStaffSection(content: string): AmionStaff[];
  private parseServiceSection(content: string): AmionService[];
  private parseXlnSection(content: string): Map<string, CompositeService>;
  private decodeRLE(data: number[], skipHeader?: number): number[];
  private calculateDates(startOffset: number, count: number, direction: number): Date[];
}
```

### 3. API Routes
```
POST /api/amion/upload     - Upload and parse .sch file
GET  /api/amion/staff      - Get all staff from a file
GET  /api/amion/services   - Get all services from a file  
GET  /api/amion/schedule   - Query schedule by date range and service
GET  /api/amion/provider   - Get schedule for specific provider
POST /api/amion/sync       - Sync Amion staff to app providers
```

### 4. Convex Functions
```typescript
// convex/amion.ts
export const uploadFile = mutation({...});
export const parseFile = action({...});  // Use action for CPU-intensive parsing
export const getStaff = query({...});
export const getSchedule = query({...});
export const getProviderSchedule = query({...});
export const syncToProviders = mutation({...});  // Match by pager/name
```

### 5. UI Components
- AmionUploader: File upload with drag-drop
- AmionStaffList: View extracted staff with sync status
- AmionScheduleView: Calendar view of service assignments
- ProviderScheduleCard: Show where a provider is assigned during strike dates

## Key Implementation Notes

1. **Staff ID Matching**: The ID field (NOT UNID) is used in ROW binary data. Build a lookup map:
   ```typescript
   const staffById = new Map<number, AmionStaff>();
   ```

2. **Binary Parsing**: The .sch file mixes text and binary. Read with latin-1/ISO-8859-1 encoding:
   ```typescript
   const decoder = new TextDecoder('iso-8859-1');
   ```

3. **RLE Decoding**: Skip first 2 bytes (header), then process (count, staffID) pairs:
   ```typescript
   function decodeRLE(bytes: number[]): number[] {
     const result: number[] = [];
     let i = 2; // Skip header
     while (i < bytes.length - 1) {
       const count = bytes[i];
       const staffId = bytes[i + 1];
       if (count === 0 || count > 50) { i++; continue; }
       for (let j = 0; j < count; j++) result.push(staffId);
       i += 2;
     }
     return result;
   }
   ```

4. **Date Calculation**: Direction=-1 means reverse chronological. The most recent date is decoded first.

5. **Cross-File Matching**: Same provider has different IDs across department files. Match by pager number:
   ```typescript
   const normalizedPager = pager.replace(/\D/g, '');
   ```

6. **Split Shifts**: Combine ROW and SPID data for complete picture.

## Testing Data
Use this known mapping to validate parser:
- ID 63 = BANDER, J.
- ID 54 = KORNBERG, R.
- ID 127 = Shahab, Hunaina
- ID 110 = Leis, P
- ID 139 = ZAREMSKI, L

Expected pattern for late December 2025 MSW ON CALL ATTENDING:
- 7 days BANDER → 7 days KORNBERG → 7 days Shahab → ...

## Deliverables
1. `/lib/amion-parser.ts` - Core parsing library
2. `/convex/amion.ts` - Convex mutations/queries
3. `/convex/schema.ts` - Updated schema
4. `/app/api/amion/*` - API routes if needed
5. `/components/amion/*` - UI components
6. `/app/(dashboard)/amion/*` - Page routes

Start with the parser library, then schema, then Convex functions, then UI.
```

---

## Part 2: Product Requirements Document

### Problem Statement
During hospital strikes (nursing, NP), clinical operations must identify available attending physicians and fellows to cover essential services. Currently, this requires manually cross-referencing multiple Amion schedules, which is time-consuming and error-prone.

### Solution
Integrate Amion .sch file parsing into the Strike Coverage Planning app to:
1. Automatically extract provider schedules
2. Identify who is assigned where on strike dates
3. Pre-populate the coverage grid with known assignments
4. Highlight gaps that need coverage

### User Stories

**As an Operations Manager, I want to:**
- Upload Amion .sch files for multiple departments
- See all providers extracted with their contact info
- View the schedule for any date range
- Know which providers are already assigned during strike dates
- Identify coverage gaps automatically

**As a Clinical Administrator, I want to:**
- Match Amion providers to our internal provider list
- See split shifts (AM/PM coverage)
- Export schedule data for reporting
- Compare schedules across departments

### Features

#### P0 (Must Have)
1. **File Upload & Parsing**
   - Accept .sch file uploads
   - Parse all sections (staff, services, schedules)
   - Store parsed data in Convex
   - Show parsing progress/status

2. **Staff Extraction**
   - Extract all staff with ID, name, abbreviation
   - Extract contact info (pager, phone)
   - Link to existing providers by pager match

3. **Schedule Extraction**
   - Decode ROW binary data (RLE)
   - Calculate dates from reference points
   - Handle split shifts (primary/secondary)
   - Store date→provider assignments

4. **Schedule Query**
   - Query by date range
   - Query by service/role
   - Query by provider
   - Show on calendar view

#### P1 (Should Have)
5. **Provider Sync**
   - Match Amion staff to app providers
   - Auto-match by pager number
   - Manual match UI for mismatches
   - Flag new providers not in system

6. **Coverage Grid Integration**
   - Pre-fill grid with Amion assignments
   - Show "conflicts" (provider assigned elsewhere)
   - Calculate availability windows

7. **Multi-File Support**
   - Handle multiple department files
   - Cross-reference providers across files
   - Unified schedule view

#### P2 (Nice to Have)
8. **Auto-Refresh**
   - Detect newer .sch file versions
   - Incremental update parsing
   - Webhook for Amion updates (if available)

9. **Analytics**
   - Provider utilization reports
   - Coverage gap analysis
   - Historical schedule comparison

### Technical Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   .sch File     │────▶│  Amion Parser    │────▶│  Convex DB      │
│   (Upload)      │     │  (lib/amion-*)   │     │  (amion* tables)│
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
┌─────────────────┐     ┌──────────────────┐              │
│  Strike Grid    │◀────│  Schedule Query  │◀─────────────┘
│  UI Component   │     │  (Convex query)  │
└─────────────────┘     └──────────────────┘
```

### Data Model

```
amionFiles (1) ──┬── (*) amionStaff
                 ├── (*) amionServices  
                 └── (*) amionSchedule
                 
providers (existing) ── (matched by pager) ── amionStaff
```

### API Design

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/amion/upload` | POST | Upload .sch file |
| `/api/amion/files` | GET | List uploaded files |
| `/api/amion/files/:id` | DELETE | Remove file and data |
| `/api/amion/staff` | GET | Get staff from file(s) |
| `/api/amion/schedule` | GET | Query schedule |
| `/api/amion/sync` | POST | Sync to providers |

### Success Metrics
- Parse .sch file in < 5 seconds
- 100% accuracy on staff extraction
- 95%+ accuracy on schedule decoding
- Reduce manual schedule lookup time by 80%

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Amion format changes | Version detection, modular parser |
| Large file performance | Streaming parse, background jobs |
| ID mismatch across files | Pager-based matching, manual override |
| Binary encoding edge cases | Extensive test cases, fallback display |

### Timeline Estimate
- Parser Library: 2-3 days
- Convex Integration: 1-2 days
- Basic UI: 2-3 days
- Grid Integration: 2-3 days
- Testing & Polish: 2-3 days
- **Total: ~2 weeks**

---

## Part 3: Skill File for Future Reference

See separate file: `/mnt/skills/user/amion-parser/SKILL.md`

