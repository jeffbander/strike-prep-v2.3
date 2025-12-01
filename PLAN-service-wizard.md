# Service Creation Wizard - Implementation Plan

## Overview
Redesign the service creation UX to use a wizard-based interface similar to the shift editing modal shown in the screenshot. This will make service creation more intuitive and reduce cognitive load.

## Current State Analysis

### Current Flow Issues
1. **Single Large Form**: All configuration in one overwhelming form
2. **Complex Job Type Addition**: Adding multiple job types with custom shifts is confusing
3. **No Clear Progression**: User doesn't know where they are in the process
4. **Shift Configuration Buried**: Shift times and headcount are scattered across the form

### Current Data Model (Schema)
```
services
├── Basic Info (name, shortCode, department, unit, capacity)
├── Shift Times (dayStart, dayEnd, nightStart, nightEnd)
└── Operating Schedule (operatesDays, operatesNights, operatesWeekends)

service_job_types (per role)
├── jobTypeId (NP, PA, RN, etc.)
├── Per-job-type shift overrides (optional)
├── headcount (default)
└── Per-shift headcounts (weekdayAm, weekdayPm, weekendAm, weekendPm)

service_job_type_skills
└── skillIds (per job type)

shifts (auto-generated)
├── shiftType (Weekday_AM, Weekday_PM, Weekend_AM, Weekend_PM)
├── positionsNeeded
└── startTime, endTime

job_positions (auto-generated)
└── One per headcount per shift
```

## New UX Design

### Wizard Steps

#### Step 1: Service Basics
**Goal**: Establish service identity and location

```
┌─────────────────────────────────────────┐
│ Create Service - Step 1 of 4           │
│ Service Information                     │
├─────────────────────────────────────────┤
│                                         │
│ Hospital: [Dropdown]                    │
│ Department: [Dropdown]                  │
│ Unit (Optional): [Dropdown]             │
│                                         │
│ Service Name: [Text Input]              │
│ Short Code: [Text Input - Max 6 chars] │
│                                         │
│         [Cancel]  [Next: Select Roles →]│
└─────────────────────────────────────────┘
```

#### Step 2: Role Selection
**Goal**: Select which job types (roles) this service needs

```
┌─────────────────────────────────────────┐
│ Create Service - Step 2 of 4           │
│ Select Job Types                        │
├─────────────────────────────────────────┤
│ Which roles will work in this service? │
│                                         │
│ ☐ Nurse Practitioner (NP)              │
│ ☐ Physician Assistant (PA)             │
│ ☐ Registered Nurse (RN)                │
│ ☐ Medical Doctor (MD)                  │
│ ☐ [other job types...]                 │
│                                         │
│ [← Back]              [Next: Schedule →]│
└─────────────────────────────────────────┘
```

#### Step 3: Operating Schedule
**Goal**: Define which shift types the service operates

```
┌─────────────────────────────────────────┐
│ Create Service - Step 3 of 4           │
│ Operating Schedule                      │
├─────────────────────────────────────────┤
│ When does this service operate?         │
│                                         │
│ ☑ Day Shifts    07:00 - 19:00          │
│ ☑ Night Shifts  19:00 - 07:00          │
│ ☐ Weekend Coverage                      │
│                                         │
│ [Edit Default Times...]                 │
│                                         │
│ Capacity (Optional)                     │
│ Day: [10] Night: [8] Weekend: [6]      │
│                                         │
│ [← Back]        [Next: Configure Shifts →]│
└─────────────────────────────────────────┘
```

#### Step 4: Shift Configuration (MOST IMPORTANT)
**Goal**: Configure staffing for each role on each shift type

**UI Pattern** (similar to screenshot):
```
┌──────────────────────────────────────────────────────────┐
│ Create Service - Step 4 of 4                            │
│ Staffing Configuration                                   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ┌─ Nurse Practitioner (NP) ────────────────────────┐   │
│ │                                                    │   │
│ │ Required Skills: [Multi-select]                   │   │
│ │ ☑ ACLS  ☑ Critical Care  ☐ Pediatrics            │   │
│ │                                                    │   │
│ │ Shift Configuration                               │   │
│ │                                                    │   │
│ │ ● Weekday AM  07:00 - 19:00                       │   │
│ │   Positions: [4]  Capacity: [30]  ☐ Deactivate   │   │
│ │                                                    │   │
│ │ ● Weekday PM  19:00 - 07:00                       │   │
│ │   Positions: [2]  Capacity: [20]  ☐ Deactivate   │   │
│ │                                                    │   │
│ │ + Add Custom Shift                                │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ ┌─ Physician Assistant (PA) ───────────────────────┐   │
│ │                                                    │   │
│ │ Required Skills: [Multi-select]                   │   │
│ │ ☑ ACLS                                            │   │
│ │                                                    │   │
│ │ Shift Configuration                               │   │
│ │                                                    │   │
│ │ ○ Weekday AM  (Not operating)                     │   │
│ │ ○ Weekday PM  (Not operating)                     │   │
│ │                                                    │   │
│ │ ● Weekend AM  06:00 - 23:00  [Custom]            │   │
│ │   Positions: [3]  Capacity: [20]  ☐ Deactivate   │   │
│ │                                                    │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ [← Back]                       [Create Service]         │
└──────────────────────────────────────────────────────────┘
```

### Key Features in Step 4

1. **Per-Role Accordion**: Each selected role gets its own card/section
2. **Skill Selection**: Multi-select checkboxes per role
3. **Shift List with Visual Indicators**:
   - Colored dots (● Yellow=Weekday AM, ● Blue=Weekday PM, ● Orange=Weekend AM, ● Purple=Weekend PM)
   - Time ranges displayed
   - Inactive shifts shown grayed out
4. **Inline Editing**:
   - Number inputs for positions
   - Optional capacity per shift
   - Checkbox to deactivate individual shifts
5. **Custom Shifts**: Ability to add shifts with custom times per role
6. **Visual Hierarchy**: Clear separation between roles

## Component Architecture

### New Components to Create

```
src/components/services/
├── ServiceWizard.tsx                 # Main wizard container
├── steps/
│   ├── Step1ServiceBasics.tsx       # Hospital, department, name, code
│   ├── Step2RoleSelection.tsx       # Multi-select job types
│   ├── Step3OperatingSchedule.tsx   # Day/Night/Weekend + times
│   └── Step4ShiftConfiguration.tsx  # Per-role shift staffing
├── ShiftEditor.tsx                   # Reusable shift configuration component
└── types.ts                          # TypeScript interfaces for wizard state
```

### Data Flow

```
WizardState = {
  // Step 1
  hospitalId: string
  departmentId: string
  unitId?: string
  name: string
  shortCode: string

  // Step 2
  selectedJobTypeIds: string[]

  // Step 3
  operatesDays: boolean
  operatesNights: boolean
  operatesWeekends: boolean
  dayShiftStart: string
  dayShiftEnd: string
  nightShiftStart: string
  nightShiftEnd: string
  dayCapacity?: number
  nightCapacity?: number
  weekendCapacity?: number

  // Step 4
  jobTypeConfigs: {
    [jobTypeId: string]: {
      skillIds: string[]
      shifts: {
        [shiftType: string]: {  // "Weekday_AM", etc.
          enabled: boolean
          positions: number
          capacity?: number
          customTimes?: {
            startTime: string
            endTime: string
          }
        }
      }
    }
  }
}
```

### Backend Changes

**Minimal changes needed** - the existing `services.create` mutation already supports:
- Per-job-type shift configuration
- Per-shift-type headcount
- Custom shift times per job type

We just need to transform wizard state → mutation args properly.

## Implementation Steps

### Phase 1: Create Wizard Infrastructure
1. Create `ServiceWizard.tsx` with step navigation
2. Create `types.ts` for wizard state types
3. Add wizard open/close to services page

### Phase 2: Implement Step Components
1. `Step1ServiceBasics.tsx` - Simple form (reuse existing form elements)
2. `Step2RoleSelection.tsx` - Checkbox list of job types
3. `Step3OperatingSchedule.tsx` - Schedule checkboxes + time inputs
4. `Step4ShiftConfiguration.tsx` - Complex shift configuration UI

### Phase 3: Shift Configuration UI
1. Create `ShiftEditor.tsx` component (the most complex part)
   - Per-role sections with expand/collapse
   - Shift list with colored indicators
   - Inline position/capacity inputs
   - Custom shift time editing
2. Add validation and default value logic

### Phase 4: Integration
1. Transform wizard state → mutation args
2. Call existing `services.create` mutation
3. Handle success/error states
4. Replace old form with wizard trigger

### Phase 5: Polish
1. Add progress indicator (Step X of 4)
2. Add form validation per step
3. Add ability to go back and edit previous steps
4. Add keyboard navigation
5. Add loading states

## UI/UX Improvements

### Visual Design (matching screenshot)
- Dark slate background (#1e293b, #334155)
- Colored shift indicators:
  - 🟡 Yellow (Weekday AM)
  - 🔵 Indigo (Weekday PM)
  - 🟠 Orange (Weekend AM)
  - 🟣 Purple (Weekend PM)
- Rounded cards with subtle borders
- Clear visual hierarchy
- Consistent spacing

### User Experience
1. **Progressive Disclosure**: Only show complexity when needed
2. **Smart Defaults**:
   - Pre-fill shift times based on Step 3
   - Default to 1 position per shift
   - Enable all shifts for all roles by default
3. **Validation Feedback**: Real-time validation with helpful messages
4. **Undo/Redo**: Back button preserves all previous choices
5. **Summary Before Create**: Show final summary before submission

## Success Metrics

1. **Reduced Confusion**: Step-by-step reduces cognitive load
2. **Flexibility**: Supports complex scenarios (custom shifts per role)
3. **Speed**: Common case (same shifts for all roles) is fast
4. **Clarity**: User always knows:
   - Where they are (step indicator)
   - What they need to do (clear labels)
   - What will be created (preview in step 4)

## Example User Flow

**Scenario**: Test Hospital Cardiology needs NPs (days+nights) and PAs (weekends only)

1. **Step 1**: Select Test Hospital → Cardiology → Name: "Cardiac ICU" → Code: "CICU"
2. **Step 2**: Check ☑ NP, ☑ PA
3. **Step 3**: Check ☑ Days, ☑ Nights, ☑ Weekends → Set default times
4. **Step 4**:
   - **NP Section**:
     - Skills: ACLS, Critical Care
     - Weekday AM: 4 positions, 30 capacity
     - Weekday PM: 2 positions, 20 capacity
     - Weekend shifts: Deactivate both ☑
   - **PA Section**:
     - Skills: ACLS
     - Weekday AM: Deactivate ☑
     - Weekday PM: Deactivate ☑
     - Weekend AM: Custom time 6:00-23:00, 3 positions, 20 capacity
     - Weekend PM: Deactivate ☑
5. **Create** → System generates 3 shifts (NP weekday AM, NP weekday PM, PA weekend AM custom) with correct positions

## Files to Modify

### Create New Files
- `src/components/services/ServiceWizard.tsx`
- `src/components/services/steps/Step1ServiceBasics.tsx`
- `src/components/services/steps/Step2RoleSelection.tsx`
- `src/components/services/steps/Step3OperatingSchedule.tsx`
- `src/components/services/steps/Step4ShiftConfiguration.tsx`
- `src/components/services/ShiftEditor.tsx`
- `src/components/services/types.ts`

### Modify Existing Files
- `src/app/dashboard/services/page.tsx`:
  - Add wizard open state
  - Replace create form with wizard trigger
  - Keep existing edit modal (edit is different from create)

### No Changes Needed
- `convex/services.ts` (backend already supports all features)
- `convex/schema.ts` (schema is perfect as-is)

## Future Enhancements (Out of Scope)

1. **Service Templates**: Save common configurations as templates
2. **Clone Service**: Copy configuration from existing service
3. **Bulk Edit**: Update multiple services at once
4. **Schedule Visualization**: Calendar view of all shifts
5. **Conflict Detection**: Warn about overlapping shifts
