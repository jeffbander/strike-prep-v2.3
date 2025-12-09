"use client";

import { useState, Suspense } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import Link from "next/link";
import { Id } from "../../../../convex/_generated/dataModel";
import ScenarioWizard from "@/components/scenarios/ScenarioWizard";

function ScenariosPageContent() {
  const scenarios = useQuery(api.scenarios.list, {});
  const currentUser = useQuery(api.users.getCurrentUser);
  const cancelScenario = useMutation(api.scenarios.cancel);
  const activateScenario = useMutation(api.scenarios.activate);
  const deleteScenario = useMutation(api.scenarios.deleteScenario);

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const handleActivate = async (scenarioId: Id<"strike_scenarios">) => {
    try {
      await activateScenario({ scenarioId });
      toast.success("Scenario activated");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCancel = async (scenarioId: Id<"strike_scenarios">) => {
    if (!confirm("Are you sure you want to cancel this scenario?")) return;
    try {
      await cancelScenario({ scenarioId });
      toast.success("Scenario cancelled");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (scenarioId: Id<"strike_scenarios">) => {
    if (!confirm("Are you sure you want to delete this scenario? This cannot be undone.")) return;
    try {
      await deleteScenario({ scenarioId });
      toast.success("Scenario deleted");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Draft":
        return "bg-slate-600";
      case "Active":
        return "bg-emerald-600";
      case "Completed":
        return "bg-blue-600";
      case "Cancelled":
        return "bg-red-600";
      default:
        return "bg-slate-600";
    }
  };

  const getCoverageColor = (percent: number) => {
    if (percent >= 90) return "bg-emerald-500";
    if (percent >= 70) return "bg-yellow-500";
    if (percent >= 50) return "bg-orange-500";
    return "bg-red-500";
  };

  const filteredScenarios = scenarios?.filter((s) => {
    if (filter === "all") return true;
    return s.status === filter;
  });

  return (
    <div className="p-8 text-white">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Strike Scenarios</h1>
            <p className="text-slate-400 mt-1">
              Plan and manage strike coverage scenarios
            </p>
          </div>
          <button
            onClick={() => setIsWizardOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors font-medium"
          >
            + Create Scenario
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {["all", "Draft", "Active", "Completed", "Cancelled"].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === status
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {status === "all" ? "All" : status}
            </button>
          ))}
        </div>

        {/* Scenarios List */}
        <div className="space-y-4">
          {scenarios === undefined ? (
            <div className="text-slate-400">Loading...</div>
          ) : filteredScenarios?.length === 0 ? (
            <div className="bg-slate-800 rounded-lg p-8 text-center">
              <p className="text-slate-400 mb-4">
                {filter === "all"
                  ? "No strike scenarios found"
                  : `No ${filter.toLowerCase()} scenarios`}
              </p>
              {filter === "all" && (
                <button
                  onClick={() => setIsWizardOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  Create Your First Scenario
                </button>
              )}
            </div>
          ) : (
            filteredScenarios?.map((scenario) => (
              <div key={scenario._id} className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold">{scenario.name}</h3>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                          scenario.status
                        )}`}
                      >
                        {scenario.status}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm">
                      {new Date(scenario.startDate).toLocaleDateString()} -{" "}
                      {new Date(scenario.endDate).toLocaleDateString()}
                      <span className="mx-2">|</span>
                      {scenario.stats.totalDays ||
                        Math.ceil(
                          (new Date(scenario.endDate).getTime() -
                            new Date(scenario.startDate).getTime()) /
                            (1000 * 60 * 60 * 24)
                        ) + 1}{" "}
                      days
                    </p>
                    {scenario.description && (
                      <p className="text-slate-500 text-sm mt-1">
                        {scenario.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/scenarios/${scenario._id}`}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
                    >
                      View Details
                    </Link>
                    {scenario.status === "Draft" && (
                      <>
                        <button
                          onClick={() => handleActivate(scenario._id)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded text-sm transition-colors"
                        >
                          Activate
                        </button>
                        <button
                          onClick={() => handleDelete(scenario._id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {scenario.status === "Active" && (
                      <button
                        onClick={() => handleCancel(scenario._id)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 rounded text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {/* Affected Job Types */}
                <div className="mb-4">
                  <p className="text-sm text-slate-400 mb-2">Affected Job Types:</p>
                  <div className="flex flex-wrap gap-2">
                    {scenario.affectedJobTypeDetails?.map((jt: any) => (
                      <span
                        key={jt.code}
                        className="px-3 py-1 bg-slate-700 rounded-full text-sm"
                      >
                        {jt.name} ({jt.code}) - {jt.reductionPercent}% reduction
                      </span>
                    ))}
                  </div>
                </div>

                {/* Coverage Stats */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Total Positions</p>
                    <p className="text-2xl font-bold">{scenario.stats.totalPositions}</p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Filled</p>
                    <p className="text-2xl font-bold text-emerald-400">
                      {scenario.stats.filledPositions}
                    </p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Open</p>
                    <p className="text-2xl font-bold text-amber-400">
                      {scenario.stats.openPositions}
                    </p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">Coverage</p>
                    <div className="flex items-center gap-2">
                      <p className="text-2xl font-bold">
                        {scenario.stats.coveragePercent}%
                      </p>
                      <div className="flex-1 h-2 bg-slate-600 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getCoverageColor(
                            scenario.stats.coveragePercent
                          )} transition-all`}
                          style={{ width: `${scenario.stats.coveragePercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Scenario Creation Wizard */}
        <ScenarioWizard
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          healthSystemId={currentUser?.healthSystemId}
        />
      </div>
    </div>
  );
}

export default function ScenariosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white p-8">Loading...</div>}>
      <ScenariosPageContent />
    </Suspense>
  );
}
