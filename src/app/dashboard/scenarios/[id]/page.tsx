"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Id } from "../../../../../convex/_generated/dataModel";

export default function ScenarioDetailPage() {
  const params = useParams();
  const router = useRouter();
  const scenarioId = params.id as Id<"strike_scenarios">;

  const scenario = useQuery(api.scenarios.get, { scenarioId });
  const calendarView = useQuery(api.scenarios.getCalendarView, { scenarioId });
  const openPositions = useQuery(api.scenarios.getOpenPositions, { scenarioId });

  const activateScenario = useMutation(api.scenarios.activate);
  const completeScenario = useMutation(api.scenarios.complete);
  const cancelScenario = useMutation(api.scenarios.cancel);

  const [viewMode, setViewMode] = useState<"dashboard" | "grid">("dashboard");

  const handleActivate = async () => {
    try {
      await activateScenario({ scenarioId });
      toast.success("Scenario activated");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleComplete = async () => {
    if (!confirm("Mark this scenario as completed?")) return;
    try {
      await completeScenario({ scenarioId });
      toast.success("Scenario marked as completed");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this scenario?")) return;
    try {
      await cancelScenario({ scenarioId });
      toast.success("Scenario cancelled");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Draft": return "bg-slate-600";
      case "Active": return "bg-emerald-600";
      case "Completed": return "bg-blue-600";
      case "Cancelled": return "bg-red-600";
      default: return "bg-slate-600";
    }
  };

  const getCoverageColor = (percent: number) => {
    if (percent >= 90) return "text-emerald-400";
    if (percent >= 70) return "text-yellow-400";
    if (percent >= 50) return "text-orange-400";
    return "text-red-400";
  };

  const getCoverageBgColor = (percent: number) => {
    if (percent >= 90) return "bg-emerald-500";
    if (percent >= 70) return "bg-yellow-500";
    if (percent >= 50) return "bg-orange-500";
    return "bg-red-500";
  };

  if (!scenario) {
    return (
      <div className="p-8 text-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-slate-400">Loading scenario...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 text-white">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <Link
              href="/dashboard/scenarios"
              className="text-slate-400 hover:text-white text-sm mb-2 inline-block"
            >
              &larr; Back to Scenarios
            </Link>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{scenario.name}</h1>
              <span className={`px-3 py-1 rounded text-sm font-medium ${getStatusColor(scenario.status)}`}>
                {scenario.status}
              </span>
            </div>
            <p className="text-slate-400">
              {new Date(scenario.startDate).toLocaleDateString()} -{" "}
              {new Date(scenario.endDate).toLocaleDateString()}
              <span className="mx-2">|</span>
              {scenario.stats.totalDays} days
              {scenario.hospital && (
                <>
                  <span className="mx-2">|</span>
                  {scenario.hospital.name}
                </>
              )}
            </p>
            {scenario.description && (
              <p className="text-slate-500 mt-2">{scenario.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {scenario.status === "Draft" && (
              <button
                onClick={handleActivate}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Activate Scenario
              </button>
            )}
            {scenario.status === "Active" && (
              <>
                <Link
                  href={`/dashboard/scenarios/${scenarioId}/match`}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Match Providers
                </Link>
                <button
                  onClick={handleComplete}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors"
                >
                  Mark Complete
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Affected Job Types */}
        <div className="bg-slate-800 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-slate-400 mb-3">Affected Job Types</h3>
          <div className="flex flex-wrap gap-2">
            {scenario.affectedJobTypeDetails?.map((jt: any) => (
              <span
                key={jt.code}
                className="px-3 py-1.5 bg-amber-600/20 border border-amber-600/50 text-amber-300 rounded-full text-sm"
              >
                {jt.name} ({jt.code}) - {jt.reductionPercent}% reduction
              </span>
            ))}
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setViewMode("dashboard")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === "dashboard"
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Dashboard View
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === "grid"
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Grid View
          </button>
        </div>

        {/* Dashboard View */}
        {viewMode === "dashboard" && (
          <div className="space-y-6">
            {/* Overall Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800 rounded-lg p-6">
                <p className="text-slate-400 text-sm mb-2">Total Positions</p>
                <p className="text-4xl font-bold">{scenario.stats.totalPositions}</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-6">
                <p className="text-slate-400 text-sm mb-2">Filled</p>
                <p className="text-4xl font-bold text-emerald-400">
                  {scenario.stats.filledPositions}
                </p>
              </div>
              <div className="bg-slate-800 rounded-lg p-6">
                <p className="text-slate-400 text-sm mb-2">Open</p>
                <p className="text-4xl font-bold text-amber-400">
                  {scenario.stats.openPositions}
                </p>
              </div>
              <div className="bg-slate-800 rounded-lg p-6">
                <p className="text-slate-400 text-sm mb-2">Coverage</p>
                <div className="flex items-center gap-3">
                  <p className={`text-4xl font-bold ${getCoverageColor(scenario.stats.coveragePercent)}`}>
                    {scenario.stats.coveragePercent}%
                  </p>
                  <div className="flex-1">
                    <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getCoverageBgColor(scenario.stats.coveragePercent)} transition-all`}
                        style={{ width: `${scenario.stats.coveragePercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Coverage by Date */}
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="font-medium mb-4">Coverage by Date</h3>
              <div className="space-y-2">
                {scenario.coverageByDate?.map((day: any) => (
                  <div key={day.date} className="flex items-center gap-4">
                    <span className="w-24 text-sm text-slate-400">
                      {new Date(day.date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <div className="flex-1 h-6 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getCoverageBgColor(day.coveragePercent)} transition-all`}
                        style={{ width: `${day.coveragePercent}%` }}
                      />
                    </div>
                    <span className={`w-16 text-right text-sm font-medium ${getCoverageColor(day.coveragePercent)}`}>
                      {day.filled}/{day.total}
                    </span>
                    <span className="w-12 text-right text-sm text-slate-400">
                      {day.coveragePercent}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Coverage Gaps */}
            {openPositions && openPositions.length > 0 && (
              <div className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">Open Positions ({openPositions.length})</h3>
                  {scenario.status === "Active" && (
                    <Link
                      href={`/dashboard/scenarios/${scenarioId}/match`}
                      className="text-sm text-emerald-400 hover:text-emerald-300"
                    >
                      Match Providers &rarr;
                    </Link>
                  )}
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {openPositions.slice(0, 20).map((pos: any) => (
                    <div
                      key={pos._id}
                      className="flex items-center justify-between bg-slate-700/50 rounded px-4 py-2 text-sm"
                    >
                      <div>
                        <span className="font-medium">{pos.serviceName}</span>
                        <span className="text-slate-400 ml-2">({pos.departmentName})</span>
                      </div>
                      <div className="flex items-center gap-4 text-slate-400">
                        <span>{new Date(pos.date).toLocaleDateString()}</span>
                        <span className={pos.shiftType === "AM" ? "text-yellow-400" : "text-blue-400"}>
                          {pos.shiftType}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-600 rounded text-xs">
                          {pos.jobTypeCode}
                        </span>
                      </div>
                    </div>
                  ))}
                  {openPositions.length > 20 && (
                    <p className="text-center text-slate-500 text-sm py-2">
                      + {openPositions.length - 20} more positions
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grid View */}
        {viewMode === "grid" && calendarView && (
          <div className="bg-slate-800 rounded-lg p-6 overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr>
                  <th className="text-left text-sm font-medium text-slate-400 pb-4 pr-4 sticky left-0 bg-slate-800">
                    Service
                  </th>
                  <th className="text-left text-sm font-medium text-slate-400 pb-4 pr-2 sticky left-0 bg-slate-800">
                    Shift
                  </th>
                  {calendarView.dates.map((date) => (
                    <th
                      key={date}
                      className="text-center text-xs font-medium text-slate-400 pb-4 px-2 min-w-[60px]"
                    >
                      <div>{new Date(date).toLocaleDateString("en-US", { weekday: "short" })}</div>
                      <div>{new Date(date).getDate()}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendarView.grid.map((service: any) => (
                  <>
                    {/* AM Row */}
                    <tr key={`${service.serviceId}-am`}>
                      <td className="text-sm py-2 pr-4 sticky left-0 bg-slate-800">
                        <div className="font-medium">{service.serviceName}</div>
                        <div className="text-xs text-slate-500">{service.departmentName}</div>
                      </td>
                      <td className="text-sm py-2 pr-2 sticky left-0 bg-slate-800">
                        <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs">
                          AM
                        </span>
                      </td>
                      {service.dates.map((day: any) => (
                        <td key={`${service.serviceId}-${day.date}-am`} className="text-center py-2 px-1">
                          {day.am.total > 0 ? (
                            <div
                              className={`inline-flex items-center justify-center w-10 h-8 rounded text-xs font-medium ${
                                day.am.coveragePercent >= 100
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : day.am.coveragePercent >= 50
                                  ? "bg-yellow-500/20 text-yellow-400"
                                  : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {day.am.filled}/{day.am.total}
                            </div>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                    {/* PM Row */}
                    <tr key={`${service.serviceId}-pm`} className="border-b border-slate-700">
                      <td className="text-sm py-2 pr-4 sticky left-0 bg-slate-800"></td>
                      <td className="text-sm py-2 pr-2 sticky left-0 bg-slate-800">
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">
                          PM
                        </span>
                      </td>
                      {service.dates.map((day: any) => (
                        <td key={`${service.serviceId}-${day.date}-pm`} className="text-center py-2 px-1">
                          {day.pm.total > 0 ? (
                            <div
                              className={`inline-flex items-center justify-center w-10 h-8 rounded text-xs font-medium ${
                                day.pm.coveragePercent >= 100
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : day.pm.coveragePercent >= 50
                                  ? "bg-yellow-500/20 text-yellow-400"
                                  : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {day.pm.filled}/{day.pm.total}
                            </div>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
