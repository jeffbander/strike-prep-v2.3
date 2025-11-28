"use client";

import { useState } from "react";
import { useQuery, useMutation, useConvex } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import Link from "next/link";
import { Id } from "../../../../convex/_generated/dataModel";

export default function MatchingPage() {
  const convex = useConvex();
  const currentUser = useQuery(api.users.getCurrentUser);
  const hospitals = useQuery(api.hospitals.list, {});
  const departments = useQuery(api.departments.list, {});
  const services = useQuery(api.services.list, {});
  const jobTypes = useQuery(api.jobTypes.list, {});
  const skills = useQuery(api.skills.list, {});

  const openPositions = useQuery(api.matching.getOpenPositions, {});
  const coverageStats = useQuery(api.matching.getCoverageStats, {});
  const assignments = useQuery(api.matching.getAssignments, {});

  const createAssignment = useMutation(api.matching.createAssignment);
  const cancelAssignment = useMutation(api.matching.cancelAssignment);
  const confirmAssignment = useMutation(api.matching.confirmAssignment);

  const [selectedPosition, setSelectedPosition] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [selectedHospitalFilter, setSelectedHospitalFilter] = useState("");
  const [selectedServiceFilter, setSelectedServiceFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"positions" | "assignments">("positions");

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    position: any;
    provider: any;
    matchData: any;
  } | null>(null);

  const handleFindMatches = async (position: any) => {
    setSelectedPosition(position);
    setIsLoadingMatches(true);
    try {
      const result = await convex.query(api.matching.findMatchesForPosition, {
        jobPositionId: position._id as Id<"job_positions">
      });
      setMatches(result);
    } catch (error: any) {
      toast.error(error.message);
    }
    setIsLoadingMatches(false);
  };

  const openConfirmModal = (position: any, provider: any, matchData: any) => {
    setConfirmModal({ isOpen: true, position, provider, matchData });
  };

  const handleConfirmAssignment = async () => {
    if (!confirmModal) return;

    try {
      await createAssignment({
        jobPositionId: confirmModal.position._id as Id<"job_positions">,
        providerId: confirmModal.provider._id as Id<"providers">,
      });
      toast.success("Provider assigned successfully");
      setSelectedPosition(null);
      setMatches([]);
      setConfirmModal(null);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCancelAssignment = async (assignmentId: string) => {
    try {
      await cancelAssignment({ assignmentId: assignmentId as Id<"assignments"> });
      toast.success("Assignment cancelled");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleConfirmExistingAssignment = async (assignmentId: string) => {
    try {
      await confirmAssignment({ assignmentId: assignmentId as Id<"assignments"> });
      toast.success("Assignment confirmed");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getServiceName = (serviceId: string) =>
    services?.find((s) => s._id === serviceId)?.name || "Unknown";
  const getHospitalName = (hospitalId: string) =>
    hospitals?.find((h) => h._id === hospitalId)?.name || "Unknown";
  const getDepartmentName = (departmentId: string) =>
    departments?.find((d) => d._id === departmentId)?.name || "Unknown";
  const getJobTypeName = (jobTypeId: string) =>
    jobTypes?.find((jt) => jt._id === jobTypeId)?.code || "Unknown";

  const filteredPositions = openPositions?.filter((p) => {
    if (selectedHospitalFilter) {
      const service = services?.find((s) => s._id === p.serviceId);
      const dept = departments?.find((d) => d._id === service?.departmentId);
      if (dept?.hospitalId !== selectedHospitalFilter) return false;
    }
    if (selectedServiceFilter && p.serviceId !== selectedServiceFilter) return false;
    return true;
  });

  const coveragePercent = coverageStats
    ? coverageStats.totalPositions > 0
      ? Math.round((coverageStats.filled / coverageStats.totalPositions) * 100)
      : 0
    : 0;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <Link
              href="/dashboard"
              className="text-slate-400 hover:text-white text-sm mb-1 inline-block"
            >
              &larr; Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Provider Matching</h1>
          </div>
          <Link
            href="/dashboard/coverage"
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm"
          >
            View Coverage Dashboard
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        {/* Coverage Stats Bar */}
        {coverageStats && (
          <div className="bg-slate-800 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-8">
                <div>
                  <p className="text-slate-400 text-xs uppercase tracking-wider">Coverage</p>
                  <p className={`text-3xl font-bold ${coveragePercent >= 80 ? "text-emerald-400" : coveragePercent >= 60 ? "text-amber-400" : "text-red-400"}`}>
                    {coveragePercent}%
                  </p>
                </div>
                <div className="flex gap-6">
                  <div>
                    <p className="text-slate-400 text-xs">Total</p>
                    <p className="text-xl font-semibold">{coverageStats.totalPositions}</p>
                  </div>
                  <div>
                    <p className="text-emerald-400 text-xs">Filled</p>
                    <p className="text-xl font-semibold text-emerald-400">{coverageStats.filled}</p>
                  </div>
                  <div>
                    <p className="text-amber-400 text-xs">Open</p>
                    <p className="text-xl font-semibold text-amber-400">{coverageStats.open}</p>
                  </div>
                </div>
              </div>
              <div className="w-64 h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${coveragePercent >= 80 ? "bg-emerald-500" : coveragePercent >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${coveragePercent}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab("positions")}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === "positions"
                ? "bg-emerald-600"
                : "bg-slate-800 hover:bg-slate-700"
            }`}
          >
            Open Positions ({openPositions?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("assignments")}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === "assignments"
                ? "bg-emerald-600"
                : "bg-slate-800 hover:bg-slate-700"
            }`}
          >
            Current Assignments ({assignments?.length || 0})
          </button>
        </div>

        {activeTab === "positions" && (
          <div className="flex gap-4">
            {/* Left Panel - Positions List */}
            <div className={`${selectedPosition ? "w-1/2" : "w-full"} transition-all`}>
              {/* Filters */}
              <div className="flex gap-4 mb-4">
                <select
                  value={selectedHospitalFilter}
                  onChange={(e) => {
                    setSelectedHospitalFilter(e.target.value);
                    setSelectedServiceFilter("");
                  }}
                  className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
                >
                  <option value="">All Hospitals</option>
                  {hospitals?.map((h) => (
                    <option key={h._id} value={h._id}>
                      {h.name}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedServiceFilter}
                  onChange={(e) => setSelectedServiceFilter(e.target.value)}
                  className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
                >
                  <option value="">All Services</option>
                  {services?.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Positions List */}
              <div className="bg-slate-800 rounded-lg overflow-hidden">
                <div className="max-h-[calc(100vh-340px)] overflow-y-auto">
                  {filteredPositions === undefined ? (
                    <div className="p-8 text-center text-slate-400">Loading...</div>
                  ) : filteredPositions.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                      No open positions. Create services to generate job positions.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-700">
                      {filteredPositions.map((position) => (
                        <div
                          key={position._id}
                          onClick={() => handleFindMatches(position)}
                          className={`p-4 cursor-pointer transition-colors ${
                            selectedPosition?._id === position._id
                              ? "bg-emerald-600/20 border-l-4 border-emerald-500"
                              : "hover:bg-slate-700/50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-mono text-sm text-emerald-400">
                                {position.jobCode}
                              </p>
                              <p className="font-medium mt-1">
                                {getServiceName(position.serviceId)}
                              </p>
                              <div className="flex gap-2 mt-2">
                                <span className="px-2 py-0.5 bg-slate-700 rounded text-xs">
                                  Pos #{position.positionNumber}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-xs ${
                                    position.shift?.shiftType === "Day"
                                      ? "bg-amber-600/50"
                                      : "bg-indigo-600/50"
                                  }`}
                                >
                                  {position.shift?.shiftType || "Unknown"}
                                </span>
                              </div>
                            </div>
                            <svg
                              className="w-5 h-5 text-slate-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Panel - Matches */}
            {selectedPosition && (
              <div className="w-1/2 bg-slate-800 rounded-lg p-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-lg font-semibold">Available Matches</h2>
                    <p className="text-sm text-slate-400">
                      For position: {selectedPosition.jobCode}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedPosition(null);
                      setMatches([]);
                    }}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="max-h-[calc(100vh-400px)] overflow-y-auto">
                  {isLoadingMatches ? (
                    <div className="flex items-center justify-center py-8">
                      <svg
                        className="animate-spin h-8 w-8 text-emerald-500"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    </div>
                  ) : matches.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <p>No matching providers found</p>
                      <p className="text-sm mt-2">Try adjusting skill requirements</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {matches.map((match) => (
                        <div
                          key={match.providerId}
                          className="p-4 bg-slate-700/50 rounded-lg"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold">
                                  {match.provider.firstName} {match.provider.lastName}
                                </p>
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  match.matchQuality === "Perfect" ? "bg-emerald-600/50" :
                                  match.matchQuality === "Good" ? "bg-blue-600/50" : "bg-amber-600/50"
                                }`}>
                                  {match.matchQuality} (Score: {match.score})
                                </span>
                              </div>
                              <p className="text-sm text-slate-400 mt-1">
                                {match.provider.jobType} &bull; {match.provider.homeHospital} &bull; {match.provider.homeDepartment}
                              </p>
                              <div className="flex flex-wrap gap-2 mt-2">
                                <span className="px-2 py-0.5 bg-slate-600 rounded text-xs">
                                  {match.matchedSkills.length}/{match.matchedSkills.length + match.missingSkills.length} required skills
                                </span>
                                {match.missingSkills.length > 0 && (
                                  <span className="px-2 py-0.5 bg-red-600/50 rounded text-xs">
                                    Missing: {match.missingSkills.join(", ")}
                                  </span>
                                )}
                                {match.extraSkills.length > 0 && (
                                  <span className="px-2 py-0.5 bg-purple-600/50 rounded text-xs">
                                    Extra: {match.extraSkills.join(", ")}
                                  </span>
                                )}
                                {match.currentAssignments > 0 && (
                                  <span className="px-2 py-0.5 bg-amber-600/50 rounded text-xs">
                                    {match.currentAssignments} current assignment(s)
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                openConfirmModal(selectedPosition, { ...match.provider, _id: match.providerId }, match)
                              }
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors text-sm whitespace-nowrap"
                            >
                              Assign
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "assignments" && (
          <div className="bg-slate-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                    Provider
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                    Position
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                    Service
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {assignments === undefined ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      Loading...
                    </td>
                  </tr>
                ) : assignments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No assignments yet. Match providers to open positions.
                    </td>
                  </tr>
                ) : (
                  assignments.map((assignment) => (
                    <tr key={assignment._id} className="hover:bg-slate-700/50">
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {assignment.provider?.firstName} {assignment.provider?.lastName}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-emerald-400">
                        {assignment.jobPosition?.jobCode}
                      </td>
                      <td className="px-4 py-3">
                        {assignment.jobPosition
                          ? getServiceName(assignment.jobPosition.serviceId)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            assignment.status === "assigned"
                              ? "bg-emerald-600"
                              : assignment.status === "confirmed"
                              ? "bg-blue-600"
                              : "bg-red-600"
                          }`}
                        >
                          {assignment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {assignment.status === "Active" && (
                            <button
                              onClick={() => handleConfirmExistingAssignment(assignment._id)}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
                            >
                              Confirm
                            </button>
                          )}
                          {assignment.status !== "Cancelled" && (
                            <button
                              onClick={() => handleCancelAssignment(assignment._id)}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmModal?.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg">
            <h2 className="text-xl font-semibold mb-4">Confirm Assignment</h2>

            <div className="space-y-4">
              <div className="bg-slate-700/50 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-1">Position</p>
                <p className="font-mono text-emerald-400">
                  {confirmModal.position.jobCode}
                </p>
                <p className="text-sm text-slate-400 mt-2">
                  {getServiceName(confirmModal.position.serviceId)} &bull;{" "}
                  {confirmModal.position.shift?.shiftType || "Unknown"} Shift
                </p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-1">Provider</p>
                <p className="font-semibold">
                  {confirmModal.provider.firstName} {confirmModal.provider.lastName}
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  {confirmModal.provider.jobType} &bull; {confirmModal.provider.homeHospital} &bull; {confirmModal.provider.homeDepartment}
                </p>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-2">Match Details</p>
                <div className="flex flex-wrap gap-3">
                  <span className={`px-2 py-1 rounded text-sm ${
                    confirmModal.matchData.matchQuality === "Perfect" ? "bg-emerald-600/50" :
                    confirmModal.matchData.matchQuality === "Good" ? "bg-blue-600/50" : "bg-amber-600/50"
                  }`}>
                    {confirmModal.matchData.matchQuality} (Score: {confirmModal.matchData.score})
                  </span>
                  <span className="px-2 py-1 bg-slate-600 rounded text-sm">
                    {confirmModal.matchData.matchedSkills?.length || 0}/{(confirmModal.matchData.matchedSkills?.length || 0) + (confirmModal.matchData.missingSkills?.length || 0)} skills
                  </span>
                  {confirmModal.matchData.missingSkills?.length > 0 && (
                    <span className="px-2 py-1 bg-red-600/50 rounded text-sm">
                      Missing: {confirmModal.matchData.missingSkills.join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAssignment}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
