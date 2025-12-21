"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { Id } from "../../../convex/_generated/dataModel";
import {
  ServiceWizardState,
  getDefaultWizardState,
  ShiftConfig,
} from "./types";
import Step1ServiceBasics from "./steps/Step1ServiceBasics";
import Step2RoleSelection from "./steps/Step2RoleSelection";
import Step3OperatingSchedule from "./steps/Step3OperatingSchedule";
import Step4ShiftConfiguration from "./steps/Step4ShiftConfiguration";

interface ServiceWizardProps {
  isOpen: boolean;
  onClose: () => void;
  departmentIdParam?: string;
}

export default function ServiceWizard({
  isOpen,
  onClose,
  departmentIdParam,
}: ServiceWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [wizardState, setWizardState] = useState<ServiceWizardState>(
    getDefaultWizardState(departmentIdParam)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createService = useMutation(api.services.create);

  const updateWizardState = (updates: Partial<ServiceWizardState>) => {
    setWizardState((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    // Validation per step
    if (currentStep === 1) {
      if (!wizardState.hospitalId || !wizardState.departmentId) {
        toast.error("Please select hospital and department");
        return;
      }
      if (!wizardState.name || !wizardState.shortCode) {
        toast.error("Please enter service name and short code");
        return;
      }
    }

    if (currentStep === 2) {
      if (wizardState.selectedJobTypeIds.length === 0) {
        toast.error("Please select at least one job type");
        return;
      }
    }

    if (currentStep === 3) {
      if (!wizardState.operatesDays && !wizardState.operatesNights) {
        toast.error("Service must operate during at least one shift type");
        return;
      }
    }

    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleClose = () => {
    setCurrentStep(1);
    setWizardState(getDefaultWizardState(departmentIdParam));
    onClose();
  };

  const transformShiftConfigToMutationArgs = () => {
    const jobTypes: any[] = [];

    Object.entries(wizardState.jobTypeConfigs).forEach(
      ([jobTypeId, config]) => {
        const shifts = config.shifts;
        const skillIds = config.skillIds;

        // Calculate per-shift headcounts
        const weekdayAmHeadcount = shifts.Weekday_AM?.enabled
          ? shifts.Weekday_AM.positions
          : undefined;
        const weekdayPmHeadcount = shifts.Weekday_PM?.enabled
          ? shifts.Weekday_PM.positions
          : undefined;
        const weekendAmHeadcount = shifts.Weekend_AM?.enabled
          ? shifts.Weekend_AM.positions
          : undefined;
        const weekendPmHeadcount = shifts.Weekend_PM?.enabled
          ? shifts.Weekend_PM.positions
          : undefined;

        // Determine if this job type has custom shift times
        const hasCustomDayTimes =
          shifts.Weekday_AM?.customTimes || shifts.Weekend_AM?.customTimes;
        const hasCustomNightTimes =
          shifts.Weekday_PM?.customTimes || shifts.Weekend_PM?.customTimes;

        // Determine operating flags for this job type
        const operatesDays =
          shifts.Weekday_AM?.enabled || shifts.Weekend_AM?.enabled;
        const operatesNights =
          shifts.Weekday_PM?.enabled || shifts.Weekend_PM?.enabled;

        jobTypes.push({
          jobTypeId: jobTypeId as Id<"job_types">,
          skillIds: skillIds as Id<"skills">[],
          headcount: 1, // Default, will be overridden by per-shift headcounts
          weekdayAmHeadcount,
          weekdayPmHeadcount,
          weekendAmHeadcount,
          weekendPmHeadcount,
          // Only include custom shift config if there are custom times
          ...(hasCustomDayTimes && {
            dayShiftStart:
              shifts.Weekday_AM?.customTimes?.startTime ||
              shifts.Weekend_AM?.customTimes?.startTime,
            dayShiftEnd:
              shifts.Weekday_AM?.customTimes?.endTime ||
              shifts.Weekend_AM?.customTimes?.endTime,
          }),
          ...(hasCustomNightTimes && {
            nightShiftStart:
              shifts.Weekday_PM?.customTimes?.startTime ||
              shifts.Weekend_PM?.customTimes?.startTime,
            nightShiftEnd:
              shifts.Weekday_PM?.customTimes?.endTime ||
              shifts.Weekend_PM?.customTimes?.endTime,
          }),
          ...(hasCustomDayTimes ||
            hasCustomNightTimes ||
            operatesDays !== wizardState.operatesDays ||
            operatesNights !== wizardState.operatesNights
            ? {
                operatesDays,
                operatesNights,
              }
            : {}),
        });
      }
    );

    return jobTypes;
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const jobTypes = transformShiftConfigToMutationArgs();

      const result = await createService({
        departmentId: wizardState.departmentId as Id<"departments">,
        name: wizardState.name,
        shortCode: wizardState.shortCode,
        unitId: wizardState.unitId
          ? (wizardState.unitId as Id<"units">)
          : undefined,
        // Service Type fields
        serviceType: wizardState.serviceType,
        admitCapacity: wizardState.admitCapacity,
        feederSource: wizardState.feederSource,
        linkedDownstreamServiceId: wizardState.linkedDownstreamServiceId
          ? (wizardState.linkedDownstreamServiceId as Id<"services">)
          : undefined,
        // Capacity fields
        dayCapacity: wizardState.dayCapacity,
        nightCapacity: wizardState.nightCapacity,
        weekendCapacity: wizardState.weekendCapacity,
        operatesDays: wizardState.operatesDays,
        operatesNights: wizardState.operatesNights,
        operatesWeekends: wizardState.operatesWeekends,
        jobTypes,
        shiftConfig: {
          dayShiftStart: wizardState.dayShiftStart,
          dayShiftEnd: wizardState.dayShiftEnd,
          nightShiftStart: wizardState.nightShiftStart,
          nightShiftEnd: wizardState.nightShiftEnd,
        },
      });

      toast.success(
        `Service created with ${result.shiftsCreated} shifts and ${result.positionsCreated} positions`
      );
      handleClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to create service");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const stepComponents = [
    <Step1ServiceBasics
      key="step1"
      wizardState={wizardState}
      updateWizardState={updateWizardState}
      onNext={handleNext}
      onBack={handleBack}
    />,
    <Step2RoleSelection
      key="step2"
      wizardState={wizardState}
      updateWizardState={updateWizardState}
      onNext={handleNext}
      onBack={handleBack}
    />,
    <Step3OperatingSchedule
      key="step3"
      wizardState={wizardState}
      updateWizardState={updateWizardState}
      onNext={handleNext}
      onBack={handleBack}
    />,
    <Step4ShiftConfiguration
      key="step4"
      wizardState={wizardState}
      updateWizardState={updateWizardState}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
    />,
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-2xl font-semibold">Create Service</h2>
            <p className="text-sm text-slate-400 mt-1">
              Step {currentStep} of 4
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white text-2xl"
            disabled={isSubmitting}
          >
            &times;
          </button>
        </div>

        {/* Progress Indicator */}
        <div className="px-6 py-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step <= currentStep
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {step}
                </div>
                {step < 4 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      step < currentStep ? "bg-emerald-600" : "bg-slate-700"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-400">
            <span>Basics</span>
            <span>Roles</span>
            <span>Schedule</span>
            <span>Shifts</span>
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {stepComponents[currentStep - 1]}
        </div>
      </div>
    </div>
  );
}
