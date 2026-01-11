# Amion .sch File Parser Skill

## Overview
This skill enables parsing Amion OnCall scheduling system .sch files to extract staff, services, and schedule assignments. Use this when building healthcare scheduling integrations, strike coverage planning tools, or any application that needs to read Amion schedule data.

## When to Use
- User mentions "Amion", ".sch file", or "OnCall schedule"
- Building hospital/healthcare scheduling features
- Strike coverage planning applications
- Provider availability tracking
- Schedule data extraction/migration

## File Format Summary

### Structure
Amion .sch files are mixed text/binary with these sections:
1. HTTP multipart header
2. Global config (YEAR, BLDT, TIME, HOLI, etc.)
3. `SECT=page` - View definitions
4. `SECT=service` - Department/service definitions
5. `SECT=staff` - Provider records (NOT schedule data)
6. `SECT=xln` - **Schedule data lives here** (TYPE=15 composites)
7. `SECT=pattern`, `SECT=site`, `SECT=rule`, `SECT=data`

### Key Insight
Schedule assignments are in `SECT=xln`, NOT `SECT=staff`. Look for `TYPE=15` records with ROW data.

### Staff Record
```
NAME=BANDER, J.
ABBR=JB
TYPE=1
UNID=136          # External ID
ID  =63           # INTERNAL ID - used in ROW binary!
PAGR=6465565559   # Pager - cross-file matching key
```

### Schedule Record (in SECT=xln)
```
NAME=MSW ON CALL ATTENDING
TYPE=15
ROW =1167 269 -1 -7 70 <binary_data>
SPID=1167 433 -1 -7 70 <binary_data>  # Secondary (split shifts)
```

### ROW Parameters
```
ROW =startOffset count direction increment bytesPerEntry <data>
```
- `direction=-1`: Reverse chronological (newest first)
- `increment=-7`: Weekly blocks

### Binary RLE Decoding
```typescript
function decodeRLE(bytes: number[]): number[] {
  const result: number[] = [];
  let i = 2; // Skip 2-byte header
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

### Date System
Julian Day Number with epoch Jan 1, 2000:
```typescript
const EPOCH = new Date(2000, 0, 1);
const jdnToDate = (jdn: number) => new Date(EPOCH.getTime() + jdn * 86400000);
```

## Implementation Template

### TypeScript Parser Class
```typescript
interface AmionStaff {
  id: number;        // Internal ID (used in ROW)
  unid: number;      // External unique ID
  name: string;
  abbreviation: string;
  type: number;
  pager?: string;
  phone?: string;
}

interface ScheduleEntry {
  date: Date;
  serviceName: string;
  primaryStaffId?: number;
  primaryStaffName?: string;
  secondaryStaffId?: number;
  secondaryStaffName?: string;
}

class AmionParser {
  private content: string;
  private staffById: Map<number, AmionStaff> = new Map();
  
  constructor(content: string) {
    this.content = content;
  }
  
  parse(): { staff: AmionStaff[], schedule: ScheduleEntry[] } {
    const staff = this.parseStaff();
    staff.forEach(s => this.staffById.set(s.id, s));
    
    const schedule = this.parseSchedule();
    return { staff, schedule };
  }
  
  private parseStaff(): AmionStaff[] {
    const staffSection = this.content.match(/SECT=staff\n(.*?)(?=SECT=)/s)?.[1] || '';
    const records = staffSection.split(/\nNAME=/);
    
    return records.filter(r => r.trim() && !r.includes('TYPE=15')).map(record => {
      const name = record.split('\n')[0].trim();
      const id = parseInt(record.match(/(?:^|\n)ID\s*=\s*(\d+)/)?.[1] || '0');
      const unid = parseInt(record.match(/UNID=(\d+)/)?.[1] || '0');
      const abbreviation = record.match(/ABBR=([^\n]+)/)?.[1]?.trim() || '';
      const type = parseInt(record.match(/TYPE=(\d+)/)?.[1] || '0');
      const pager = record.match(/PAGR=([^\n]+)/)?.[1]?.trim();
      
      return { id, unid, name, abbreviation, type, pager };
    });
  }
  
  private parseSchedule(): ScheduleEntry[] {
    const xlnSection = this.content.match(/SECT=xln\n(.*?)(?=SECT=pattern|$)/s)?.[1] || '';
    const entries: ScheduleEntry[] = [];
    
    // Find TYPE=15 records with ROW data
    const pattern = /NAME=([^\n]+)\nTYPE=15.*?ROW\s*=\s*(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+(\d+)\s*<([^>]+)>/gs;
    
    let match;
    while ((match = pattern.exec(xlnSection)) !== null) {
      const [, serviceName, startOffset, count, direction, , , rawData] = match;
      const bytes = [...rawData].map(c => c.charCodeAt(0));
      const staffIds = this.decodeRLE(bytes);
      
      // Reverse if direction=-1 for chronological order
      if (parseInt(direction) === -1) staffIds.reverse();
      
      // Calculate dates (simplified - needs calibration)
      const baseDate = new Date(); // Would calculate from startOffset
      staffIds.forEach((staffId, idx) => {
        const date = new Date(baseDate);
        date.setDate(date.getDate() - staffIds.length + idx);
        
        const staff = this.staffById.get(staffId);
        entries.push({
          date,
          serviceName: serviceName.trim(),
          primaryStaffId: staffId || undefined,
          primaryStaffName: staff?.name,
        });
      });
    }
    
    return entries;
  }
  
  private decodeRLE(bytes: number[]): number[] {
    const result: number[] = [];
    let i = 2;
    while (i < bytes.length - 1) {
      const count = bytes[i];
      const staffId = bytes[i + 1];
      if (count === 0 || count > 50) { i++; continue; }
      for (let j = 0; j < count; j++) result.push(staffId);
      i += 2;
    }
    return result;
  }
}
```

### File Reading (Node.js)
```typescript
import { readFileSync } from 'fs';

function parseAmionFile(filepath: string) {
  // CRITICAL: Use latin-1 encoding for binary data
  const content = readFileSync(filepath, { encoding: 'latin1' });
  const parser = new AmionParser(content);
  return parser.parse();
}
```

### File Reading (Browser)
```typescript
async function parseAmionUpload(file: File) {
  const buffer = await file.arrayBuffer();
  const decoder = new TextDecoder('iso-8859-1');
  const content = decoder.decode(buffer);
  const parser = new AmionParser(content);
  return parser.parse();
}
```

## Known Staff IDs (Mount Sinai Cardiology)
For testing/validation:
| ID | Name |
|----|------|
| 3 | LAM, P. |
| 6 | MEHTA, D. |
| 47 | KUKAR, N. |
| 54 | KORNBERG, R. |
| 63 | BANDER, J. |
| 81 | ENGSTOM, K. |
| 110 | Leis, P |
| 127 | Shahab, Hunaina |
| 139 | ZAREMSKI, L |
| 187 | PUGLIESE, DANIEL |
| 191 | chad harris |

## Cross-File Matching
Same provider has different IDs in different department files. Match by pager:
```typescript
const normalizedPager = (pager: string) => pager.replace(/\D/g, '');

function matchProviders(file1Staff: AmionStaff[], file2Staff: AmionStaff[]) {
  return file1Staff.map(s1 => {
    const match = file2Staff.find(s2 => 
      normalizedPager(s1.pager || '') === normalizedPager(s2.pager || '')
    );
    return { file1: s1, file2: match };
  });
}
```

## Special Byte Values
- `0x00` (0): Empty/no assignment
- `0xFA` (250): Empty slot marker  
- `0xFF` (255): Disabled
- `0xFC 0x07` (252, 7): Weekly override section marker

## Shift Time Format (SHTM)
```
SHTM=28 72 44
```
- Values are quarter-hours from midnight
- 28 = 7:00 AM (28 × 15min = 420min = 7h)
- 72 = 6:00 PM (72 × 15min = 1080min = 18h)
- 44 = 11 hours duration

## Holiday Format
```
HOLI=24 0
10221 1 "Christmas
10228 1 "New year
```
- First line: count, unknown
- Following lines: JDN, type, "name

## Limitations
1. Date calculation requires calibration with known schedule
2. Weekly override sections (fc 07) partially decoded
3. Complex split shift timing (SPTM) needs more analysis
4. Pattern/rotation rules not fully decoded

## Files
- Primary spec: `/mnt/skills/user/amion-parser/AMION_SCH_FORMAT_SPEC.md`
- Example files: Mount Sinai Cardiology and Clinical Support .sch files

## Related Skills
- `xlsx` - For exporting schedules to Excel
- `pdf` - For generating schedule reports
