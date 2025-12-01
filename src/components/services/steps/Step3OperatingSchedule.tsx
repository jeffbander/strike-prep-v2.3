"use client";

import { WizardStepProps, initializeJobTypeConfigs } from "../types";
import { useState } from "react";

export default function Step3OperatingSchedule({
  wizardState,
  updateWizardState,
  onNext,
  onBack,
}: WizardStepProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleScheduleChange = (field: string, value: boolean) => {
    const updates: any = { [field]: value };

    // Re-initialize job type configs when schedule changes
    const newConfigs = initializeJobTypeConfigs(
      wizardState.selectedJobTypeIds,
      wizardState.jobTypeConfigs,
      { ...wizardState, ...updates }
    );

    updateWizardState({ ...updates, jobTypeConfigs: newConfigs });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-2">Operating Schedule</h3>
        <p className="text-slate-400 text-sm">
          When does this service operate? These will be the default shift times.
        </p>
      </div>

      {/* Operating Hours Checkboxes */}
      <div className="space-y-4">
        <label className="flex items-start gap-3 p-4 rounded-lg border-2 border-slate-600 cursor-pointer hover:border-slate-500 transition-all">
          <input
            type="checkbox"
            checked={wizardState.operatesDays}
            onChange={(e) => handleScheduleChange("operatesDays", e.target.checked)}
            className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-800 mt-0.5"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 bg-yellow-500 rounded-full"></span>
              <span className="font-medium text-white">Day Shifts</span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Weekday daytime operations (typically 7 AM - 7 PM)
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 p-4 rounded-lg border-2 border-slate-600 cursor-pointer hover:border-slate-500 transition-all">
          <input
            type="checkbox"
            checked={wizardState.operatesNights}
            onChange={(e) => handleScheduleChange("operatesNights", e.target.checked)}
            className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-800 mt-0.5"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 bg-indigo-500 rounded-full"></span>
              <span className="font-medium text-white">Night Shifts</span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Weekday nighttime operations (typically 7 PM - 7 AM)
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 p-4 rounded-lg border-2 border-slate-600 cursor-pointer hover:border-slate-500 transition-all">
          <input
            type="checkbox"
            checked={wizardState.operatesWeekends}
            onChange={(e) => handleScheduleChange("operatesWeekends", e.target.checked)}
            className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-800 mt-0.5"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 bg-orange-500 rounded-full"></span>
              <span className="inline-block w-3 h-3 bg-purple-500 rounded-full -ml-1"></span>
              <span className="font-medium text-white">Weekend Coverage</span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Saturday and Sunday operations (uses day/night shift times)
            </p>
          </div>
        </label>
      </div>

      {/* Advanced: Shift Times & Capacity */}
      <div className="border-t border-slate-700 pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-2"
        >
          {showAdvanced ? "▼" : "▶"} Advanced: Edit default shift times and capacity
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            {/* Default Shift Times */}
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-3">
                Default Shift Times
              </h4>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Day Start
                  </label>
                  <input
                    type="time"
                    value={wizardState.dayShiftStart}
                    onChange={(e) =>
                      updateWizardState({ dayShiftStart: e.target.value })
                    }
                    disabled={!wizardState.operatesDays}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500 text-white disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Day End
                  </label>
                  <input
                    type="time"
                    value={wizardState.dayShiftEnd}
                    onChange={(e) =>
                      updateWizardState({ dayShiftEnd: e.target.value })
                    }
                    disabled={!wizardState.operatesDays}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500 text-white disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Night Start
                  </label>
                  <input
                    type="time"
                    value={wizardState.nightShiftStart}
                    onChange={(e) =>
                      updateWizardState({ nightShiftStart: e.target.value })
                    }
                    disabled={!wizardState.operatesNights}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500 text-white disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Night End
                  </label>
                  <input
                    type="time"
                    value={wizardState.nightShiftEnd}
                    onChange={(e) =>
                      updateWizardState({ nightShiftEnd: e.target.value })
                    }
                    disabled={!wizardState.operatesNights}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500 text-white disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            {/* Capacity */}
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-3">
                Patient Capacity (Optional)
              </h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Day Capacity
                  </label>
                  <input
                    type="number"
                    value={wizardState.dayCapacity || ""}
                    onChange={(e) =>
                      updateWizardState({
                        dayCapacity: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="e.g., 30"
                    min={1}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500 text-white placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Night Capacity
                  </label>
                  <input
                    type="number"
                    value={wizardState.nightCapacity || ""}
                    onChange={(e) =>
                      updateWizardState({
                        nightCapacity: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="e.g., 20"
                    min={1}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500 text-white placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Weekend Capacity
                  </label>
                  <input
                    type="number"
                    value={wizardState.weekendCapacity || ""}
                    onChange={(e) =>
                      updateWizardState({
                        weekendCapacity: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="e.g., 20"
                    min={1}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500 text-white placeholder-slate-500"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Maximum number of patients that can be admitted per shift type
              </p>
            </div>
          </div>
        )}
      </div>

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
          Next: Configure Shifts →
        </button>
      </div>
    </div>
  );
}
