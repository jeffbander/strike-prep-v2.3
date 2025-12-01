"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { WizardStepProps, ShiftType, ShiftConfig } from "../types";
import ShiftEditor from "../ShiftEditor";

interface Step4Props extends WizardStepProps {
  onSubmit: () => void;
  isSubmitting: boolean;
}

export default function Step4ShiftConfiguration({
  wizardState,
  updateWizardState,
  onBack,
  onSubmit,
  isSubmitting,
}: Step4Props) {
  const jobTypes = useQuery(api.jobTypes.list, {});
  const skills = useQuery(api.skills.list, {});

  const selectedJobTypes =
    jobTypes?.filter((jt) =>
      wizardState.selectedJobTypeIds.includes(jt._id)
    ) || [];

  const handleSkillToggle = (jobTypeId: string, skillId: string) => {
    const currentConfig = wizardState.jobTypeConfigs[jobTypeId];
    if (!currentConfig) return;

    const currentSkills = currentConfig.skillIds;
    const newSkills = currentSkills.includes(skillId)
      ? currentSkills.filter((id) => id !== skillId)
      : [...currentSkills, skillId];

    updateWizardState({
      jobTypeConfigs: {
        ...wizardState.jobTypeConfigs,
        [jobTypeId]: {
          ...currentConfig,
          skillIds: newSkills,
        },
      },
    });
  };

  const handleShiftChange = (
    jobTypeId: string,
    shiftType: ShiftType,
    config: ShiftConfig
  ) => {
    const currentConfig = wizardState.jobTypeConfigs[jobTypeId];
    if (!currentConfig) return;

    updateWizardState({
      jobTypeConfigs: {
        ...wizardState.jobTypeConfigs,
        [jobTypeId]: {
          ...currentConfig,
          shifts: {
            ...currentConfig.shifts,
            [shiftType]: config,
          },
        },
      },
    });
  };

  // Calculate summary stats
  const calculateSummary = () => {
    let totalShifts = 0;
    let totalPositions = 0;

    Object.values(wizardState.jobTypeConfigs).forEach((config) => {
      Object.values(config.shifts).forEach((shift) => {
        if (shift?.enabled) {
          totalShifts++;
          totalPositions += shift.positions;
        }
      });
    });

    return { totalShifts, totalPositions };
  };

  const summary = calculateSummary();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-2">Staffing Configuration</h3>
        <p className="text-slate-400 text-sm">
          Configure how many positions are needed for each role on each shift.
          You can deactivate specific shifts or set custom times per role.
        </p>
      </div>

      {/* Summary Card */}
      {summary.totalShifts > 0 && (
        <div className="p-4 bg-emerald-600/10 border border-emerald-600/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-400">
                Service Summary
              </p>
              <p className="text-xs text-slate-400 mt-1">
                This configuration will create:
              </p>
            </div>
            <div className="flex gap-6 text-right">
              <div>
                <p className="text-2xl font-bold text-emerald-400">
                  {summary.totalShifts}
                </p>
                <p className="text-xs text-slate-400">
                  Shift{summary.totalShifts !== 1 ? "s" : ""}
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-400">
                  {summary.totalPositions}
                </p>
                <p className="text-xs text-slate-400">
                  Position{summary.totalPositions !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job Type Configuration */}
      <div className="space-y-4">
        {selectedJobTypes.map((jobType) => {
          const config = wizardState.jobTypeConfigs[jobType._id];
          if (!config) return null;

          return (
            <div key={jobType._id} className="space-y-3">
              {/* Skills Selection */}
              <div className="bg-slate-700/50 rounded-lg p-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Required Skills for {jobType.name}
                </label>
                <div className="flex flex-wrap gap-2">
                  {skills === undefined ? (
                    <span className="text-sm text-slate-400">
                      Loading skills...
                    </span>
                  ) : skills.length === 0 ? (
                    <span className="text-sm text-slate-400">
                      No skills available
                    </span>
                  ) : (
                    skills
                      .filter((s) => s.isActive)
                      .map((skill) => (
                        <label
                          key={skill._id}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-all ${
                            config.skillIds.includes(skill._id)
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-600 text-slate-300 hover:bg-slate-500"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={config.skillIds.includes(skill._id)}
                            onChange={() =>
                              handleSkillToggle(jobType._id, skill._id)
                            }
                            className="sr-only"
                          />
                          <span className="text-sm">{skill.name}</span>
                        </label>
                      ))
                  )}
                </div>
                {config.skillIds.length === 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    No skills selected - providers with any skills can be
                    matched
                  </p>
                )}
              </div>

              {/* Shift Configuration */}
              <ShiftEditor
                jobTypeName={jobType.name}
                jobTypeCode={jobType.code}
                shiftConfig={config.shifts}
                onShiftChange={(shiftType, shiftConfig) =>
                  handleShiftChange(jobType._id, shiftType, shiftConfig)
                }
                defaultDayStart={wizardState.dayShiftStart}
                defaultDayEnd={wizardState.dayShiftEnd}
                defaultNightStart={wizardState.nightShiftStart}
                defaultNightEnd={wizardState.nightShiftEnd}
              />
            </div>
          );
        })}
      </div>

      {summary.totalShifts === 0 && (
        <div className="p-4 bg-amber-600/10 border border-amber-600/30 rounded-lg">
          <p className="text-sm text-amber-400">
            No shifts are currently enabled. Please activate at least one shift
            to create the service.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between gap-2 pt-4 border-t border-slate-700">
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors font-medium disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          onClick={onSubmit}
          disabled={isSubmitting || summary.totalShifts === 0}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Creating Service..." : "Create Service"}
        </button>
      </div>
    </div>
  );
}
