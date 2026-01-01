/**
 * AMion .SCH Binary Decoder - Iteration 13
 *
 * INVESTIGATING: Jan 5 shows LAM but expected MEHTA
 *
 * Patch @721 data: 33, 187, 3, 6, 0, 0, 3
 * Positions:       Wed Thu  Fri Sat Sun Mon Tue
 *                  Dec31 Jan1 Jan2 Jan3 Jan4 Jan5 Jan6
 *
 * Jan 5 (position 5) = 0 = inherit from base = LAM
 * But expected = MEHTA
 *
 * Theories to test:
 * 1. Maybe +31 is slightly off (try +32?)
 * 2. Maybe there's a different patch that covers Jan 5
 * 3. Maybe 0 doesn't mean inherit but something else
 */

import * as fs from 'fs';

const buffer = fs.readFileSync('../Amion_2025.sch');
const content = buffer.toString('latin1');
const lines = content.split('\n');

const PROVIDERS: Record<number, string> = {
  0: '(0)', 1: '?1?', 2: 'AZIZ', 3: 'LAM', 6: 'MEHTA', 7: 'SINGH',
  33: 'MOHAMMED', 40: 'PUMA', 44: 'MORENO', 47: 'KUKAR', 54: 'KORNBERG',
  60: 'GOLDFINGER', 63: 'BANDER', 81: 'ENGSTOM', 109: 'R,Suri',
  110: 'Leis', 127: 'Shahab', 140: 'Leventhal', 185: 'D Pugliese',
  187: 'PUGLIESE', 190: 'Anton Camaj', 191: 'chad harris',
};

function getDate(dayFromStart: number): string {
  const start = new Date(Date.UTC(2024, 2, 13));
  const date = new Date(start.getTime() + dayFromStart * 24 * 60 * 60 * 1000);
  const days = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
  const dow = days[dayFromStart % 7];
  return `${dow} ${date.toISOString().split('T')[0]}`;
}

let inXln = false, foundTarget = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();

  if (trimmed === 'SECT=xln') inXln = true;
  if (inXln && trimmed === 'NAME=MSW EP ATTENDING') foundTarget = true;

  if (foundTarget && trimmed.startsWith('ROW =')) {
    const openIdx = line.indexOf('<');
    if (openIdx >= 0) {
      let binaryData = '';
      let currentLine = line.substring(openIdx + 1);
      let lineIdx = i;

      while (!currentLine.includes('>') && lineIdx < lines.length - 1) {
        binaryData += currentLine;
        lineIdx++;
        currentLine = lines[lineIdx];
      }

      const closeIdx = currentLine.indexOf('>')
      if (closeIdx >= 0) {
        binaryData += currentLine.substring(0, closeIdx);
      }

      const bytes: number[] = [];
      for (let j = 0; j < binaryData.length; j++) {
        bytes.push(binaryData.charCodeAt(j));
      }

      console.log('=== DECODER ITERATION 13 - DEBUGGING JAN 5 ===\n');

      const pos252 = bytes.map((b, i) => b === 252 ? i : -1).filter(i => i >= 0);
      const section0End = pos252[0];

      // Decode base RLE
      const section0 = bytes.slice(0, section0End);
      let baseSchedule: number[] = [];
      for (let j = 0; j < section0.length - 1; j += 2) {
        const id = section0[j];
        const count = section0[j + 1];
        if (count >= 1 && count <= 7) {
          for (let c = 0; c < count; c++) baseSchedule.push(id);
        }
      }
      console.log('Base schedule length:', baseSchedule.length, 'days');

      // Check what base has at day 663 position
      const baseIdx663 = 663 % baseSchedule.length;
      console.log(`\nBase at day 663 (idx ${baseIdx663}): ${PROVIDERS[baseSchedule[baseIdx663]]}`);
      console.log('Base around that position:');
      for (let d = -3; d <= 3; d++) {
        const idx = (baseIdx663 + d + baseSchedule.length) % baseSchedule.length;
        console.log(`  Base[${idx}]: ${PROVIDERS[baseSchedule[idx]]}`);
      }

      // Look at ALL patches to see if any might cover day 663
      console.log('\n=== ALL PATCHES ===');
      for (let p = 0; p < pos252.length; p++) {
        const blockStart = pos252[p];
        const blockEnd = p + 1 < pos252.length ? pos252[p + 1] : bytes.length;

        const header = bytes.slice(blockStart, blockStart + 4);
        const weekOffset = header[2];
        const providers = bytes.slice(blockStart + 4, blockEnd);

        // Try different offset interpretations
        const offsets = [
          { name: '+31', week: weekOffset + 31 },
          { name: '+32', week: weekOffset + 32 },
          { name: '+30', week: weekOffset + 30 },
          { name: 'raw', week: weekOffset },
        ];

        for (const off of offsets) {
          const startDay = off.week * 7;
          const endDay = startDay + providers.length - 1;
          // Does this patch cover day 663?
          if (startDay <= 663 && endDay >= 663) {
            const dayInPatch = 663 - startDay;
            const providerId = providers[dayInPatch];
            console.log(`Patch @${blockStart} (offset ${weekOffset}, ${off.name}=${off.week}): covers day 663`);
            console.log(`  Provider at day 663: ${PROVIDERS[providerId] || 'ID' + providerId}`);
            console.log(`  Full patch: ${providers.map(p => PROVIDERS[p] || p).join(', ')}`);
          }
        }
      }

      // Try different offset values
      console.log('\n=== TESTING DIFFERENT OFFSETS ===');
      const testOffsets = [30, 31, 32, 33];

      for (const offsetAdj of testOffsets) {
        let schedule: number[] = [];
        for (let d = 0; d < 777; d++) {
          schedule.push(baseSchedule[d % baseSchedule.length]);
        }

        // Apply patches with this offset
        for (let p = 0; p < pos252.length; p++) {
          const blockStart = pos252[p];
          const blockEnd = p + 1 < pos252.length ? pos252[p + 1] : bytes.length;
          const weekOffset = bytes[blockStart + 2];
          const separator = bytes[blockStart + 3];
          if (separator !== 0) continue;

          const providers = bytes.slice(blockStart + 4, blockEnd);
          const adjustedWeek = weekOffset + offsetAdj;
          const startDay = adjustedWeek * 7;
          if (startDay >= 777) continue;

          for (let d = 0; d < providers.length && startDay + d < schedule.length; d++) {
            const pid = providers[d];
            if (pid !== 0) {
              schedule[startDay + d] = pid;
            }
          }
        }

        // Check Jan 1-5
        const expected = [187, 3, 6, 3, 6];
        let matches = 0;
        const results: string[] = [];
        for (let d = 0; d < 5; d++) {
          const actual = schedule[659 + d];
          if (actual === expected[d]) matches++;
          results.push(`${PROVIDERS[actual] || actual}`);
        }
        console.log(`Offset +${offsetAdj}: ${matches}/5 [${results.join(', ')}]`);
      }

      // What if we DON'T inherit from base for 0 values?
      console.log('\n=== TESTING: 0 = EMPTY (not inherit) ===');
      let schedule: number[] = [];
      for (let d = 0; d < 777; d++) {
        schedule.push(baseSchedule[d % baseSchedule.length]);
      }

      for (let p = 0; p < pos252.length; p++) {
        const blockStart = pos252[p];
        const blockEnd = p + 1 < pos252.length ? pos252[p + 1] : bytes.length;
        const weekOffset = bytes[blockStart + 2];
        const separator = bytes[blockStart + 3];
        if (separator !== 0) continue;

        const providers = bytes.slice(blockStart + 4, blockEnd);
        const adjustedWeek = weekOffset + 31;
        const startDay = adjustedWeek * 7;
        if (startDay >= 777) continue;

        for (let d = 0; d < providers.length && startDay + d < schedule.length; d++) {
          schedule[startDay + d] = providers[d]; // Apply ALL values including 0
        }
      }

      const expected = [187, 3, 6, 3, 6];
      let matches = 0;
      console.log('Jan 1-5 with 0=empty:');
      for (let d = 0; d < 5; d++) {
        const actual = schedule[659 + d];
        const match = actual === expected[d] ? '✓' : '✗';
        if (actual === expected[d]) matches++;
        console.log(`  Jan ${d+1}: ${PROVIDERS[actual] || actual} ${match} (expected ${PROVIDERS[expected[d]]})`);
      }
      console.log(`Score: ${matches}/5`);

      // Look at what other patches exist that might affect Jan 5
      console.log('\n=== LOOKING FOR OVERLAPPING PATCHES ===');
      // Day 663 with +31 offset would need week 94-31 = 63 patch covering position 5
      // Let's see all patches that touch week 94 range
      for (let p = 0; p < pos252.length; p++) {
        const blockStart = pos252[p];
        const weekOffset = bytes[blockStart + 2];
        const providers = bytes.slice(blockStart + 4, (p + 1 < pos252.length ? pos252[p + 1] : bytes.length));

        const adjWeek = weekOffset + 31;
        const startDay = adjWeek * 7;
        const endDay = startDay + providers.length - 1;

        if ((startDay <= 665 && endDay >= 659)) {
          console.log(`Patch @${blockStart}: week ${weekOffset}+31=${adjWeek}, days ${startDay}-${endDay}`);
          console.log(`  Data: ${providers.map(p => PROVIDERS[p] || p).join(', ')}`);
        }
      }
    }
    break;
  }
}

console.log('\n=== END ITERATION 13 ===');
