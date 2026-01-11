# CLAUDE CODE QUICK START PROMPT

Copy this entire prompt into Claude Code to build the Amion Schedule Extractor feature:

---

## Task: Build Amion .sch File Parser for Strike Coverage App

I need you to add an Amion schedule extractor feature to my existing Next.js + Convex strike planning app.

### Project Context
- **Stack**: Next.js 14+ (App Router), Convex backend, TypeScript
- **Purpose**: Hospital strike coverage planning - know where attendings/fellows are scheduled so we can plan coverage when nurses/NPs strike
- **Existing App**: Has providers table, strike events, coverage grid

### What to Build

1. **File Upload Component** (`/components/amion/AmionUploader.tsx`)
   - Drag-drop for .sch files
   - Upload to Convex storage
   - Show parsing progress

2. **Parser Library** (`/lib/amion-parser.ts`)
   - Parse Amion .sch binary/text format
   - Extract staff, services, schedule data
   - Use ISO-8859-1 encoding (critical!)

3. **Convex Integration** (`/convex/amion.ts` + schema updates)
   - Tables: amionFiles, amionStaff, amionServices, amionSchedule
   - Mutations for upload, parse, store
   - Queries for schedule by date, by provider

4. **UI Pages** (`/app/(dashboard)/amion/*`)
   - File list with upload
   - Staff viewer with provider matching
   - Schedule calendar view
   - Integration with strike grid

### Critical Technical Details (FROM REVERSE ENGINEERING)

**File Structure:**
- Sections: `SECT=page`, `SECT=service`, `SECT=staff`, `SECT=xln` (schedules here!)
- Schedule data is in `SECT=xln` with `TYPE=15` records, NOT in `SECT=staff`

**Staff Records:**
```
NAME=BANDER, J.
ID  =63            # <-- THIS ID is used in binary data
UNID=136           # External ID (don't use for decoding)
PAGR=6465565559    # Pager - use for cross-file matching
```

**Schedule Record (in SECT=xln):**
```
NAME=MSW ON CALL ATTENDING
TYPE=15
ROW =1167 269 -1 -7 70 <binary_data>
SPID=1167 433 -1 -7 70 <binary_data>  # Secondary provider (split shifts)
```

**ROW Binary Format - RLE Encoding:**
```typescript
// Skip first 2 bytes (header), then (count, staffID) pairs
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

**Date Direction:**
- `direction=-1` means reverse chronological (newest date first)
- Reverse the decoded array to get chronological order

**File Reading:**
```typescript
// CRITICAL: Must use ISO-8859-1 (Latin-1) encoding
const decoder = new TextDecoder('iso-8859-1');
const content = decoder.decode(buffer);
```

**Known Staff IDs (for testing):**
| ID | Name |
|----|------|
| 63 | BANDER, J. |
| 54 | KORNBERG, R. |
| 127 | Shahab, Hunaina |
| 139 | ZAREMSKI, L |

### Convex Schema Additions

```typescript
amionFiles: defineTable({
  filename: v.string(),
  storageId: v.id("_storage"),
  uploadedAt: v.number(),
  siteId: v.string(),
  department: v.string(),
  parsed: v.boolean(),
  staffCount: v.optional(v.number()),
  scheduleCount: v.optional(v.number()),
}).index("by_site", ["siteId"]),

amionStaff: defineTable({
  fileId: v.id("amionFiles"),
  staffId: v.number(),         // Internal ID (used in ROW)
  name: v.string(),
  abbreviation: v.string(),
  pager: v.optional(v.string()),
  pagerNormalized: v.optional(v.string()),
  matchedProviderId: v.optional(v.id("providers")),
}).index("by_file", ["fileId"]).index("by_pager", ["pagerNormalized"]),

amionSchedule: defineTable({
  fileId: v.id("amionFiles"),
  date: v.string(),            // YYYY-MM-DD
  serviceName: v.string(),
  primaryStaffId: v.optional(v.number()),
  primaryStaffName: v.optional(v.string()),
  secondaryStaffId: v.optional(v.number()),
  secondaryStaffName: v.optional(v.string()),
  isEmpty: v.boolean(),
}).index("by_file_date", ["fileId", "date"]).index("by_service_date", ["serviceName", "date"]),
```

### Implementation Order
1. Add schema tables to `convex/schema.ts`
2. Create `lib/amion-parser.ts` with AmionParser class
3. Create `convex/amion.ts` with upload, parse, query functions
4. Build upload component
5. Build staff list with provider matching
6. Build schedule view
7. Integrate with strike coverage grid

### Provider Matching Logic
Same person has DIFFERENT IDs in different department files. Match by pager:
```typescript
const normalizePhone = (p: string) => p.replace(/\D/g, '');
// Match amionStaff.pagerNormalized to providers.pager.replace(/\D/g, '')
```

Start with the parser library - that's the foundation. Read the SKILL.md file in /mnt/skills/user/amion-parser/ for complete technical reference.

---

## Reference Files
- `/mnt/skills/user/amion-parser/SKILL.md` - Technical skill file
- `/mnt/skills/user/amion-parser/amion-parser.ts` - Complete parser implementation
- `/mnt/skills/user/amion-parser/convex-integration.ts` - Convex schema and functions
