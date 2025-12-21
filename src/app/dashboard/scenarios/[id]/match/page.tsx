"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { ScenarioMatchingGrid } from "@/components/scenarios/ScenarioMatchingGrid";
import { LayoutGrid, List, Users, CheckCircle, Clock, AlertCircle } from "lucide-react";

type ViewMode = "grid" | "list";

export default function ScenarioMatchPage() {
  const params = useParams();
  const scenarioId = params.id as Id<"strike_scenarios">;

  const scenario = useQuery(api.scenarios.get, { scenarioId });
  const openPositions = useQuery(api.scenarios.getOpenPositions, { scenarioId });
  const assignments = useQuery(api.scenarioMatching.getAssignments, { scenarioId });

  const createAssignment = useMutation(api.scenarioMatching.createAssignment);
  const confirmAssignment = useMutation(api.scenarioMatching.confirmAssignment);
  const cancelAssignment = useMutation(api.scenarioMatching.cancelAssignment);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedPositionId, setSelectedPositionId] = useState<Id<"scenario_positions"> | null>(null);
  const [filterDate, setFilterDate] = useState<string>("");
  const [filterShift, setFilterShift] = useState<string>("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAssignment, setPendingAssignment] = useState<{
    positionId: Id<"scenario_positions">;
    providerId: Id<"providers">;
    providerName: string;
  } | null>(null);

  const matches = useQuery(
    api.scenarioMatching.findMatchesForPosition,
    selectedPositionId ? { scenarioPositionId: selectedPositionId } : "skip"
  );

  const handleSelectPosition = (positionId: Id<"scenario_positions">) => {
    setSelectedPositionId(positionId);
  };

  const handleAssign = (providerId: Id<"providers">, providerName: string) => {
    if (!selectedPositionId) return;
    setPendingAssignment({
      positionId: selectedPositionId,
      providerId,
      providerName,
    });
    setShowConfirmModal(true);
  };

  const confirmPendingAssignment = async () => {
    if (!pendingAssignment) return;
    try {
      await createAssignment({
        scenarioPositionId: pendingAssignment.positionId,
        providerId: pendingAssignment.providerId,
      });
      toast.success(`Assigned ${pendingAssignment.providerName}`);
      setSelectedPositionId(null);
      setShowConfirmModal(false);
      setPendingAssignment(null);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleConfirmAssignment = async (assignmentId: Id<"scenario_assignments">) => {
    try {
      await confirmAssignment({ assignmentId });
      toast.success("Assignment confirmed");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCancelAssignment = async (assignmentId: Id<"scenario_assignments">) => {
    if (!confirm("Cancel this assignment?")) return;
    try {
      await cancelAssignment({ assignmentId });
      toast.success("Assignment cancelled");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getMatchQualityColor = (quality: string) => {
    switch (quality) {
      case "Perfect": return "bg-emerald-500";
      case "Good": return "bg-yellow-500";
      case "Partial": return "bg-orange-500";
      default: return "bg-slate-500";
    }
  };

  // Get unique dates for filtering
  const uniqueDates = [...new Set(openPositions?.map((p) => p.date) || [])].sort();

  // Filter positions
  let filteredPositions = openPositions || [];
  if (filterDate) {
    filteredPositions = filteredPositions.filter((p) => p.date === filterDate);
  }
  if (filterShift) {
    filteredPositions = filteredPositions.filter((p) => p.shiftType === filterShift);
  }

  // Calculate stats
  const totalPositions = openPositions?.length || 0;
  const assignedCount = assignments?.filter((a) => a.status === "Active" || a.status === "Confirmed").length || 0;
  const confirmedCount = assignments?.filter((a) => a.status === "Confirmed").length || 0;
  const pendingCount = assignments?.filter((a) => a.status === "Active").length || 0;

  if (!scenario) {
    return (
      <div className="p-8 text-white">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="max-w-full mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href={`/dashboard/scenarios/${scenarioId}`}
                className="text-slate-400 hover:text-white text-sm mb-1 inline-block"
              >
                &larr; Back to Scenario
              </Link>
              <h1 className="text-2xl font-bold">{scenario.name}</h1>
              <p className="text-slate-400 text-sm mt-1">
                {new Date(scenario.startDate).toLocaleDateString()} - {new Date(scenario.endDate).toLocaleDateString()}
              </p>
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-700 rounded-lg p-1">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-colors ${
                    viewMode === "grid"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Grid
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-2 transition-colors ${
                    viewMode === "list"
                      ? "bg-emerald-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <List className="h-4 w-4" />
                  List
                </button>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-slate-400" />
              <span className="text-slate-400 text-sm">Open:</span>
              <span className="text-lg font-semibold text-amber-400">{totalPositions}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-slate-400" />
              <span className="text-slate-400 text-sm">Pending:</span>
              <span className="text-lg font-semibold text-blue-400">{pendingCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-slate-400" />
              <span className="text-slate-400 text-sm">Confirmed:</span>
              <span className="text-lg font-semibold text-emerald-400">{confirmedCount}</span>
            </div>
            <div className="h-3 flex-1 max-w-xs bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{
                  width: `${totalPositions > 0 ? (assignedCount / (totalPositions + assignedCount)) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {viewMode === "grid" ? (
        <div className="h-[calc(100vh-180px)]">
          <ScenarioMatchingGrid scenarioId={scenarioId} />
        </div>
      ) : (
        <div className="max-w-7xl mx-auto p-4">
          <div className="grid grid-cols-3 gap-6">
            {/* Left Panel: Open Positions */}
            <div className="col-span-1 bg-slate-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-medium">Open Positions</h2>
                <span className="text-sm text-slate-400">
                  {filteredPositions.length} positions
                </span>
              </div>

              {/* Filters */}
              <div className="space-y-2 mb-4">
                <select
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm"
                >
                  <option value="">All Dates</option>
                  {uniqueDates.map((date) => (
                    <option key={date} value={date}>
                      {new Date(date).toLocaleDateString()}
                    </option>
                  ))}
                </select>
                <select
                  value={filterShift}
                  onChange={(e) => setFilterShift(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm"
                >
                  <option value="">All Shifts</option>
                  <option value="AM">AM Shift</option>
                  <option value="PM">PM Shift</option>
                </select>
              </div>

              {/* Position List */}
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {filteredPositions.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">
                    No open positions
                  </p>
                ) : (
                  filteredPositions.map((position) => (
                    <button
                      key={position._id}
                      onClick={() => handleSelectPosition(position._id)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedPositionId === position._id
                          ? "bg-emerald-600"
                          : "bg-slate-700 hover:bg-slate-600"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{position.serviceName}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            position.shiftType === "AM"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-blue-500/20 text-blue-400"
                          }`}
                        >
                          {position.shiftType}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {new Date(position.date).toLocaleDateString()} | {position.jobTypeCode}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Middle Panel: Matching Providers */}
            <div className="col-span-1 bg-slate-800 rounded-lg p-4">
              <h2 className="font-medium mb-4">
                {selectedPositionId ? "Matching Providers" : "Select a Position"}
              </h2>

              {!selectedPositionId ? (
                <p className="text-slate-500 text-sm text-center py-8">
                  Select an open position to see matching providers
                </p>
              ) : matches?.error ? (
                <p className="text-red-400 text-sm">{matches.error}</p>
              ) : matches?.matches.length === 0 ? (
                <p className="text-amber-400 text-sm text-center py-8">
                  No available providers found for this position
                </p>
              ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  {matches?.matches.map((match: any) => (
                    <div
                      key={match.providerId}
                      className="bg-slate-700 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-medium">{match.providerName}</span>
                          {match.isPreferred && (
                            <span className="ml-2 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                              Preferred
                            </span>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${getMatchQualityColor(
                            match.matchQuality
                          )}`}
                        >
                          {match.matchQuality}
                        </span>
                      </div>

                      <div className="text-xs text-slate-400 mb-2">
                        {match.jobTypeName} | {match.currentAssignmentCount} shifts assigned
                        {match.isHomeDepartment && " | Home Dept"}
                      </div>

                      {match.matchedSkills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {match.matchedSkills.map((skill: string) => (
                            <span
                              key={skill}
                              className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}

                      {match.missingSkills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {match.missingSkills.map((skill: string) => (
                            <span
                              key={skill}
                              className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded text-xs"
                            >
                              Missing: {skill}
                            </span>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={() => handleAssign(match.providerId, match.providerName)}
                        className="w-full mt-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded text-sm transition-colors"
                      >
                        Assign Provider
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Panel: Current Assignments */}
            <div className="col-span-1 bg-slate-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-medium">Assignments</h2>
                <span className="text-sm text-slate-400">
                  {assignments?.length || 0} assigned
                </span>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {!assignments || assignments.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-8">
                    No assignments yet
                  </p>
                ) : (
                  assignments.map((assignment: any) => (
                    <div
                      key={assignment._id}
                      className="bg-slate-700 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">
                          {assignment.providerName}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            assignment.status === "Confirmed"
                              ? "bg-emerald-500"
                              : assignment.status === "Active"
                              ? "bg-blue-500"
                              : "bg-red-500"
                          }`}
                        >
                          {assignment.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mb-2">
                        {assignment.serviceName} | {assignment.position?.date} |{" "}
                        {assignment.position?.shiftType}
                      </div>
                      {assignment.status === "Active" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleConfirmAssignment(assignment._id)}
                            className="flex-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-xs"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => handleCancelAssignment(assignment._id)}
                            className="flex-1 px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      {assignment.status === "Confirmed" && (
                        <button
                          onClick={() => handleCancelAssignment(assignment._id)}
                          className="w-full px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs"
                        >
                          Cancel Assignment
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Assignment Modal */}
      {showConfirmModal && pendingAssignment && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Confirm Assignment</h3>
            <p className="text-slate-300 mb-6">
              Assign <strong>{pendingAssignment.providerName}</strong> to this
              position?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setPendingAssignment(null);
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={confirmPendingAssignment}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
