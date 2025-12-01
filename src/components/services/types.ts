import { Id } from "../../../convex/_generated/dataModel";

/**
 * Configuration for a single shift within a job type
 */
export interface ShiftConfig {
  enabled: boolean;
  positions: number;
  capacity?: number;
  customTimes?: {
    startTime: string;
    endTime: string;
  };
}

/**
 * Configuration for a job type within a service
 */
export interface JobTypeConfig {
  skillIds: string[];
  shifts: {
    Weekday_AM?: ShiftConfig;
    Weekday_PM?: ShiftConfig;
    Weekend_AM?: ShiftConfig;
    Weekend_PM?: ShiftConfig;
  };
}

/**
 * Complete wizard state for service creation
 */
export interface ServiceWizardState {
  // Step 1: Service Basics
  hospitalId: string;
  departmentId: string;
  unitId?: string;
  name: string;
  shortCode: string;

  // Step 2: Role Selection
  selectedJobTypeIds: string[];

  // Step 3: Operating Schedule
  operatesDays: boolean;
  operatesNights: boolean;
  operatesWeekends: boolean;
  dayShiftStart: string;
  dayShiftEnd: string;
  nightShiftStart: string;
  nightShiftEnd: string;
  dayCapacity?: number;
  nightCapacity?: number;
  weekendCapacity?: number;

  // Step 4: Shift Configuration
  jobTypeConfigs: {
    [jobTypeId: string]: JobTypeConfig;
  };
}

/**
 * Props for wizard step components
 */
export interface WizardStepProps {
  wizardState: ServiceWizardState;
  updateWizardState: (updates: Partial<ServiceWizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

/**
 * Shift type definitions with display properties
 */
export const SHIFT_TYPES = {
  Weekday_AM: {
    label: "Weekday AM",
    color: "bg-yellow-500",
    dotColor: "bg-yellow-500",
  },
  Weekday_PM: {
    label: "Weekday PM",
    color: "bg-indigo-500",
    dotColor: "bg-indigo-500",
  },
  Weekend_AM: {
    label: "Weekend AM",
    color: "bg-orange-500",
    dotColor: "bg-orange-500",
  },
  Weekend_PM: {
    label: "Weekend PM",
    color: "bg-purple-500",
    dotColor: "bg-purple-500",
  },
} as const;

export type ShiftType = keyof typeof SHIFT_TYPES;

/**
 * Helper to get default wizard state
 */
export function getDefaultWizardState(
  departmentId?: string
): ServiceWizardState {
  return {
    hospitalId: "",
    departmentId: departmentId || "",
    unitId: undefined,
    name: "",
    shortCode: "",
    selectedJobTypeIds: [],
    operatesDays: true,
    operatesNights: true,
    operatesWeekends: false,
    dayShiftStart: "07:00",
    dayShiftEnd: "19:00",
    nightShiftStart: "19:00",
    nightShiftEnd: "07:00",
    dayCapacity: undefined,
    nightCapacity: undefined,
    weekendCapacity: undefined,
    jobTypeConfigs: {},
  };
}

/**
 * Helper to initialize job type configs when roles are selected
 */
export function initializeJobTypeConfigs(
  selectedJobTypeIds: string[],
  existingConfigs: { [key: string]: JobTypeConfig },
  wizardState: ServiceWizardState
): { [key: string]: JobTypeConfig } {
  const newConfigs: { [key: string]: JobTypeConfig } = {};

  selectedJobTypeIds.forEach((jobTypeId) => {
    // Keep existing config if already present
    if (existingConfigs[jobTypeId]) {
      newConfigs[jobTypeId] = existingConfigs[jobTypeId];
    } else {
      // Initialize new config with defaults based on service operating schedule
      newConfigs[jobTypeId] = {
        skillIds: [],
        shifts: {
          ...(wizardState.operatesDays && {
            Weekday_AM: {
              enabled: true,
              positions: 1,
              capacity: wizardState.dayCapacity,
            },
          }),
          ...(wizardState.operatesNights && {
            Weekday_PM: {
              enabled: true,
              positions: 1,
              capacity: wizardState.nightCapacity,
            },
          }),
          ...(wizardState.operatesWeekends &&
            wizardState.operatesDays && {
              Weekend_AM: {
                enabled: true,
                positions: 1,
                capacity: wizardState.weekendCapacity,
              },
            }),
          ...(wizardState.operatesWeekends &&
            wizardState.operatesNights && {
              Weekend_PM: {
                enabled: true,
                positions: 1,
                capacity: wizardState.weekendCapacity,
              },
            }),
        },
      };
    }
  });

  return newConfigs;
}
