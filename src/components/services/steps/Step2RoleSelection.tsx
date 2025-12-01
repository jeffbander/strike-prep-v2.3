"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { WizardStepProps, initializeJobTypeConfigs } from "../types";

export default function Step2RoleSelection({
  wizardState,
  updateWizardState,
  onNext,
  onBack,
}: WizardStepProps) {
  const jobTypes = useQuery(api.jobTypes.list, {});

  const handleToggleJobType = (jobTypeId: string) => {
    const currentSelected = wizardState.selectedJobTypeIds;
    const newSelected = currentSelected.includes(jobTypeId)
      ? currentSelected.filter((id) => id !== jobTypeId)
      : [...currentSelected, jobTypeId];

    // Initialize job type configs when selection changes
    const newConfigs = initializeJobTypeConfigs(
      newSelected,
      wizardState.jobTypeConfigs,
      wizardState
    );

    updateWizardState({
      selectedJobTypeIds: newSelected,
      jobTypeConfigs: newConfigs,
    });
  };

  const isJobTypeSelected = (jobTypeId: string) => {
    return wizardState.selectedJobTypeIds.includes(jobTypeId);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-2">Select Job Types</h3>
        <p className="text-slate-400 text-sm">
          Which roles will work in this service? Select all that apply.
        </p>
      </div>

      {/* Job Type Selection Grid */}
      <div className="space-y-2">
        {jobTypes === undefined ? (
          <div className="text-slate-400">Loading job types...</div>
        ) : jobTypes.length === 0 ? (
          <div className="text-slate-400 p-4 bg-slate-700/50 rounded-lg text-center">
            No job types available. Please create job types first.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {jobTypes.map((jobType) => (
              <label
                key={jobType._id}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  isJobTypeSelected(jobType._id)
                    ? "bg-emerald-600/20 border-emerald-600"
                    : "bg-slate-700/50 border-slate-600 hover:border-slate-500"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isJobTypeSelected(jobType._id)}
                  onChange={() => handleToggleJobType(jobType._id)}
                  className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-800"
                />
                <div className="flex-1">
                  <div className="font-medium text-white">{jobType.name}</div>
                  <div className="text-sm text-slate-400 font-mono">
                    {jobType.code}
                  </div>
                  {jobType.description && (
                    <div className="text-xs text-slate-500 mt-1">
                      {jobType.description}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Selected Count */}
      {wizardState.selectedJobTypeIds.length > 0 && (
        <div className="p-3 bg-emerald-600/10 border border-emerald-600/30 rounded-lg">
          <p className="text-sm text-emerald-400">
            {wizardState.selectedJobTypeIds.length} job type
            {wizardState.selectedJobTypeIds.length !== 1 ? "s" : ""} selected
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between gap-2 pt-4 border-t border-slate-700">
        <button
          onClick={onBack}
          className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors font-medium"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors font-medium"
        >
          Next: Set Schedule →
        </button>
      </div>
    </div>
  );
}
