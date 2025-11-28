# Plan: Flexible Shift Configuration Per Job Type

## Problem Statement

The current system has a limitation: **shift times are service-wide**, meaning all job types on a service share the same day/night shift times.

**Current behavior:**
- Service has: `dayShiftStart`, `dayShiftEnd`, `nightShiftStart`, `nightShiftEnd`
- All job types on that service get the same shift times
- Example: If day shift is 7AM-7PM, ALL job types use 7AM-7PM

**Desired behavior (your use case):**
- Service: ICU Coverage
  - NPs: 5 positions, 7AM-7PM shift
  - PAs: 3 positions, 7PM-12AM shift (different times!)

This requires **shift times configurable per job type**, not per service.

---

## Current Data Model

```
services
├── dayShiftStart, dayShiftEnd      ← Service-wide times
├── nightShiftStart, nightShiftEnd  ← Service-wide times
└── operatesDays, operatesNights, operatesWeekends

service_job_types
├── serviceId
└── jobTypeId

shifts
├── serviceId
├── serviceJobTypeId
├── shiftType (Weekday_AM, Weekday_PM, etc.)
├── startTime, endTime  ← Currently copied from service
└── positionsNeeded
```

---

## Proposed Solution: Per-Job-Type Shift Configuration

### Option A: Add Shift Config to Job Type Assignment (RECOMMENDED)

Move shift times from service-level to `service_job_types` level:

```
service_job_types (enhanced)
├── serviceId
├── jobTypeId
├── dayShiftStart, dayShiftEnd       ← NEW: Per job type
├── nightShiftStart, nightShiftEnd   ← NEW: Per job type
├── operatesDays, operatesNights     ← NEW: Which shifts this job type works
└── headcount                        ← NEW: Move from create args
```

This allows:
- NP job type: works days only, 7AM-7PM
- PA job type: works nights only, 7PM-12AM
- RN job type: works both shifts, 7AM-7PM / 7PM-7AM

### Option B: Custom Shifts Array Per Job Type

```
create args:
jobTypes: [
  {
    jobTypeId: "np_id",
    shifts: [
      { shiftType: "day", start: "07:00", end: "19:00", headcount: 5 }
    ]
  },
  {
    jobTypeId: "pa_id",
    shifts: [
      { shiftType: "evening", start: "19:00", end: "00:00", headcount: 3 }
    ]
  }
]
```

This is more flexible but more complex.

---

## Recommended Implementation (Option A)

### Changes Required

#### 1. Schema Changes (`convex/schema.ts`)

**Remove from `services` table:**
- Keep `dayShiftStart`, `dayShiftEnd`, `nightShiftStart`, `nightShiftEnd` as SERVICE DEFAULTS
- These become the default values when adding a job type

**Enhance `service_job_types` table:**
```typescript
service_job_types: defineTable({
  serviceId: v.id("services"),
  jobTypeId: v.id("job_types"),
  // NEW: Shift configuration per job type
  dayShiftStart: v.optional(v.string()),  // If null, inherits service default
  dayShiftEnd: v.optional(v.string()),
  nightShiftStart: v.optional(v.string()),
  nightShiftEnd: v.optional(v.string()),
  operatesDays: v.boolean(),
  operatesNights: v.boolean(),
  headcount: v.number(),
})
```

#### 2. Backend Changes (`convex/services.ts`)

Update `create` mutation:
- Accept shift config per job type in `jobTypes` array
- Use job-type-specific times when creating shifts
- Fall back to service defaults if not specified

```typescript
jobTypes: v.array(
  v.object({
    jobTypeId: v.id("job_types"),
    skillIds: v.array(v.id("skills")),
    headcount: v.number(),
    // NEW: Per-job-type shift config
    operatesDays: v.boolean(),
    operatesNights: v.boolean(),
    dayShiftStart: v.optional(v.string()),
    dayShiftEnd: v.optional(v.string()),
    nightShiftStart: v.optional(v.string()),
    nightShiftEnd: v.optional(v.string()),
  })
),
```

Update shift creation loop:
- Use job-type-specific times if provided
- Otherwise fall back to service defaults

#### 3. Frontend Changes (`src/app/dashboard/services/page.tsx`)

Update job type form to include:
- Checkboxes for "Works Day Shifts" / "Works Night Shifts"
- Time inputs for custom shift times (optional)
- Show/hide based on checkboxes

New UI for adding job type:
```
┌─────────────────────────────────────────────────────┐
│ Job Type: [NP Dropdown ▼]   Headcount: [5]          │
│                                                     │
│ ☑ Day Shifts    Start: [07:00]  End: [19:00]       │
│ ☐ Night Shifts  Start: [19:00]  End: [07:00]       │
│                                                     │
│ Required Skills: [✓ Critical Care] [✓ Cardiac]     │
│                                                     │
│ [Add Job Type]                                      │
└─────────────────────────────────────────────────────┘
```

---

## Migration Strategy (Backwards Compatible)

1. **Schema addition is non-breaking** - new fields are optional
2. **Existing services continue to work** - null values fall back to service defaults
3. **New UI optional** - can toggle "Use custom shift times" checkbox

### Data Migration
- No migration needed for existing data
- New fields default to null (use service defaults)
- Existing shifts remain unchanged

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Breaking existing services | New fields are optional, existing data unchanged |
| Complex UI | Progressive disclosure - show advanced options only when needed |
| Database migration | No migration - additive schema change |
| Query performance | No new indexes needed - existing indexes sufficient |

---

## Implementation Order

### Phase 1: Backend (Non-Breaking)
1. [ ] Update schema - add optional fields to `service_job_types`
2. [ ] Update `create` mutation - accept new args, use them when creating shifts
3. [ ] Update `getWithDetails` query - return job-type-specific shift info
4. [ ] Test with existing data - verify backwards compatibility

### Phase 2: Frontend
5. [ ] Update job type form - add shift configuration options
6. [ ] Add "custom shift times" toggle per job type
7. [ ] Wire up new form fields to mutation
8. [ ] Update service detail display to show per-job-type shifts

### Phase 3: Polish
9. [ ] Add validation (shift end after start, etc.)
10. [ ] Add help text explaining the options
11. [ ] Test full workflow end-to-end

---

## Files to Modify

| File | Changes |
|------|---------|
| `convex/schema.ts` | Add fields to `service_job_types` |
| `convex/services.ts` | Update `create` and `getWithDetails` |
| `src/app/dashboard/services/page.tsx` | Update form and display |

---

## Approval Checklist

- [ ] Schema changes reviewed
- [ ] Backwards compatibility confirmed
- [ ] No data migration required
- [ ] UI changes scoped
- [ ] Ready to implement

---

**Ready for implementation?** Exit plan mode to proceed.
