"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { Id } from "../../../convex/_generated/dataModel";

interface ScenarioWizardProps {
  isOpen: boolean;
  onClose: () => void;
  healthSystemId?: Id<"health_systems">;
}

interface AffectedJobType {
  jobTypeId: Id<"job_types">;
  reductionPercent: number;
}

interface WizardState {
  // Step 1
  selectedHealthSystemId: Id<"health_systems"> | null;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  hospitalId: Id<"hospitals"> | null;
  // Step 2
  affectedJobTypes: AffectedJobType[];
}

const getDefaultState = (): WizardState => ({
  selectedHealthSystemId: null,
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  hospitalId: null,
  affectedJobTypes: [],
});

export default function ScenarioWizard({
  isOpen,
  onClose,
  healthSystemId: propHealthSystemId,
}: ScenarioWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [state, setState] = useState<WizardState>(getDefaultState());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get current user to check role
  const currentUser = useQuery(api.users.getCurrentUser);

  // For super_admin, get all health systems to select from
  const healthSystems = useQuery(
    api.healthSystems.list
  );

  // Determine the effective health system ID
  // - If prop is provided (health_system_admin), use that
  // - If super_admin selected one, use that
  // - Otherwise, undefined
  const effectiveHealthSystemId = propHealthSystemId || state.selectedHealthSystemId;
  const isSuperAdmin = currentUser?.role === "super_admin";
  const needsHealthSystemSelection = isSuperAdmin && !propHealthSystemId;

  const createScenario = useMutation(api.scenarios.create);
  const hospitals = useQuery(
    api.hospitals.list,
    effectiveHealthSystemId ? { healthSystemId: effectiveHealthSystemId } : "skip"
  );
  const jobTypes = useQuery(
    api.jobTypes.list,
    effectiveHealthSystemId ? { healthSystemId: effectiveHealthSystemId } : "skip"
  );

  const handleClose = () => {
    setCurrentStep(1);
    setState(getDefaultState());
    onClose();
  };

  const handleNext = () => {
    // Validation
    if (currentStep === 1) {
      if (needsHealthSystemSelection && !state.selectedHealthSystemId) {
        toast.error("Please select a health system");
        return;
      }
      if (!state.name) {
        toast.error("Please enter a scenario name");
        return;
      }
      if (!state.startDate || !state.endDate) {
        toast.error("Please select start and end dates");
        return;
      }
      if (new Date(state.startDate) > new Date(state.endDate)) {
        toast.error("Start date must be before end date");
        return;
      }
    }
    if (currentStep === 2) {
      if (state.affectedJobTypes.length === 0) {
        toast.error("Please select at least one job type affected by the strike");
        return;
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, 3));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleJobTypeToggle = (jobTypeId: Id<"job_types">) => {
    const existing = state.affectedJobTypes.find((jt) => jt.jobTypeId === jobTypeId);
    if (existing) {
      setState({
        ...state,
        affectedJobTypes: state.affectedJobTypes.filter(
          (jt) => jt.jobTypeId !== jobTypeId
        ),
      });
    } else {
      setState({
        ...state,
        affectedJobTypes: [
          ...state.affectedJobTypes,
          { jobTypeId, reductionPercent: 100 },
        ],
      });
    }
  };

  const handleReductionChange = (
    jobTypeId: Id<"job_types">,
    reductionPercent: number
  ) => {
    setState({
      ...state,
      affectedJobTypes: state.affectedJobTypes.map((jt) =>
        jt.jobTypeId === jobTypeId ? { ...jt, reductionPercent } : jt
      ),
    });
  };

  const handleSubmit = async () => {
    if (!effectiveHealthSystemId) {
      toast.error("Health system not found");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createScenario({
        healthSystemId: effectiveHealthSystemId,
        hospitalId: state.hospitalId || undefined,
        name: state.name,
        description: state.description || undefined,
        startDate: state.startDate,
        endDate: state.endDate,
        affectedJobTypes: state.affectedJobTypes,
      });

      toast.success(
        `Scenario created with ${result.totalPositions} positions across ${result.affectedServices} services`
      );
      handleClose();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate days in range for preview
  const getDaysInRange = () => {
    if (!state.startDate || !state.endDate) return 0;
    const start = new Date(state.startDate);
    const end = new Date(state.endDate);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Create Strike Scenario</h2>
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Progress */}
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step === currentStep
                      ? "bg-emerald-600 text-white"
                      : step < currentStep
                      ? "bg-emerald-600/50 text-white"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {step}
                </div>
                {step < 3 && (
                  <div
                    className={`w-12 h-0.5 ${
                      step < currentStep ? "bg-emerald-600" : "bg-slate-700"
                    }`}
                  />
                )}
              </div>
            ))}
            <span className="ml-4 text-slate-400 text-sm">
              {currentStep === 1 && "Scenario Basics"}
              {currentStep === 2 && "Affected Job Types"}
              {currentStep === 3 && "Review & Create"}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Basics */}
          {currentStep === 1 && (
            <div className="space-y-6">
              {/* Health System Selector for Super Admin */}
              {needsHealthSystemSelection && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Health System *
                  </label>
                  <select
                    value={state.selectedHealthSystemId || ""}
                    onChange={(e) =>
                      setState({
                        ...state,
                        selectedHealthSystemId: e.target.value
                          ? (e.target.value as Id<"health_systems">)
                          : null,
                        // Reset hospital selection when health system changes
                        hospitalId: null,
                      })
                    }
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select a health system...</option>
                    {healthSystems?.map((hs) => (
                      <option key={hs._id} value={hs._id}>
                        {hs.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    As a Super Admin, select which health system this scenario applies to
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">
                  Scenario Name *
                </label>
                <input
                  type="text"
                  value={state.name}
                  onChange={(e) => setState({ ...state, name: e.target.value })}
                  placeholder="e.g., January 2025 NP Strike"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Description
                </label>
                <textarea
                  value={state.description}
                  onChange={(e) => setState({ ...state, description: e.target.value })}
                  placeholder="Optional description or notes about this scenario..."
                  rows={3}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={state.startDate}
                    onChange={(e) => setState({ ...state, startDate: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={state.endDate}
                    onChange={(e) => setState({ ...state, endDate: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {state.startDate && state.endDate && (
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <p className="text-sm text-slate-300">
                    Scenario covers <span className="font-bold text-white">{getDaysInRange()} days</span>
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">
                  Scope (Optional)
                </label>
                <select
                  value={state.hospitalId || ""}
                  onChange={(e) =>
                    setState({
                      ...state,
                      hospitalId: e.target.value
                        ? (e.target.value as Id<"hospitals">)
                        : null,
                    })
                  }
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">All Hospitals in Health System</option>
                  {hospitals?.map((h) => (
                    <option key={h._id} value={h._id}>
                      {h.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Leave empty to include all hospitals
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Job Types */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <p className="text-slate-400 mb-4">
                Select which job types are affected by the strike and set their
                capacity reduction percentage.
              </p>

              <div className="space-y-3">
                {jobTypes?.map((jt) => {
                  const selected = state.affectedJobTypes.find(
                    (ajt) => ajt.jobTypeId === jt._id
                  );
                  return (
                    <div
                      key={jt._id}
                      className={`border rounded-lg p-4 transition-colors ${
                        selected
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-slate-600 bg-slate-700/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={() => handleJobTypeToggle(jt._id)}
                            className="w-5 h-5 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500 bg-slate-600"
                          />
                          <div>
                            <span className="font-medium">{jt.name}</span>
                            <span className="ml-2 text-slate-400 text-sm">
                              ({jt.code})
                            </span>
                          </div>
                        </label>
                      </div>

                      {selected && (
                        <div className="mt-3 pl-8">
                          <label className="block text-sm text-slate-400 mb-2">
                            Capacity Reduction: {selected.reductionPercent}%
                          </label>
                          <div className="flex items-center gap-4">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="25"
                              value={selected.reductionPercent}
                              onChange={(e) =>
                                handleReductionChange(jt._id, parseInt(e.target.value))
                              }
                              className="flex-1 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex gap-2">
                              {[25, 50, 75, 100].map((val) => (
                                <button
                                  key={val}
                                  onClick={() => handleReductionChange(jt._id, val)}
                                  className={`px-2 py-1 text-xs rounded ${
                                    selected.reductionPercent === val
                                      ? "bg-emerald-600"
                                      : "bg-slate-600 hover:bg-slate-500"
                                  }`}
                                >
                                  {val}%
                                </button>
                              ))}
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 mt-2">
                            {selected.reductionPercent === 100
                              ? "Full strike - all positions need coverage"
                              : selected.reductionPercent === 0
                              ? "No reduction - normal staffing"
                              : `${selected.reductionPercent}% reduction - partial coverage needed`}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="font-medium mb-3">Scenario Summary</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Name:</dt>
                    <dd className="font-medium">{state.name}</dd>
                  </div>
                  {needsHealthSystemSelection && (
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Health System:</dt>
                      <dd className="font-medium">
                        {healthSystems?.find((hs) => hs._id === state.selectedHealthSystemId)?.name}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Date Range:</dt>
                    <dd className="font-medium">
                      {state.startDate} to {state.endDate} ({getDaysInRange()} days)
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Scope:</dt>
                    <dd className="font-medium">
                      {state.hospitalId
                        ? hospitals?.find((h) => h._id === state.hospitalId)?.name
                        : "All Hospitals"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="font-medium mb-3">Affected Job Types</h3>
                <div className="space-y-2">
                  {state.affectedJobTypes.map((ajt) => {
                    const jt = jobTypes?.find((j) => j._id === ajt.jobTypeId);
                    return (
                      <div key={ajt.jobTypeId} className="flex items-center justify-between text-sm">
                        <span>
                          {jt?.name} ({jt?.code})
                        </span>
                        <span className="text-amber-400 font-medium">
                          {ajt.reductionPercent}% reduction
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-4">
                <p className="text-sm text-amber-200">
                  <strong>Note:</strong> Creating this scenario will generate positions
                  for all affected services across {getDaysInRange()} days. You can
                  then manage provider availability and start matching.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex justify-between">
          <button
            onClick={currentStep === 1 ? handleClose : handleBack}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            {currentStep === 1 ? "Cancel" : "Back"}
          </button>
          {currentStep < 3 ? (
            <button
              onClick={handleNext}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors font-medium"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Creating..." : "Create Scenario"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
