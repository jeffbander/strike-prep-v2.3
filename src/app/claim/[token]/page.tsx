"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";

type PositionData = {
  positionId: Id<"scenario_positions">;
  date: string;
  shiftType: string;
  shiftStart: string;
  shiftEnd: string;
  serviceName: string;
  serviceCode: string;
  hospitalName: string;
  departmentName: string;
  skillMatch: "Perfect" | "Good" | "Partial";
  isHomeHospital: boolean;
};

export default function ClaimPage() {
  const params = useParams();
  const token = params.token as string;

  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<{
    success: boolean;
    message: string;
    errors: string[];
  } | null>(null);

  // Fetch claim data
  const claimData = useQuery(api.claimTokens.getClaimData, { token });
  const myAssignments = useQuery(api.claimTokens.getMyAssignments, { token });
  const claimPositions = useMutation(api.claimTokens.claimPositions);
  const unclaimPosition = useMutation(api.claimTokens.unclaimPosition);

  const handleTogglePosition = (positionId: string) => {
    setSelectedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(positionId)) {
        next.delete(positionId);
      } else {
        next.add(positionId);
      }
      return next;
    });
  };

  const handleSelectAllForDate = (date: string, positions: PositionData[]) => {
    setSelectedPositions((prev) => {
      const next = new Set(prev);
      const allSelected = positions.every((p) => prev.has(p.positionId));
      if (allSelected) {
        positions.forEach((p) => next.delete(p.positionId));
      } else {
        positions.forEach((p) => next.add(p.positionId));
      }
      return next;
    });
  };

  const handleClaim = async () => {
    if (selectedPositions.size === 0) return;

    setClaiming(true);
    setClaimResult(null);

    try {
      const result = await claimPositions({
        token,
        positionIds: Array.from(selectedPositions) as Id<"scenario_positions">[],
      });

      setClaimResult({
        success: result.success,
        message: result.message,
        errors: result.errors,
      });

      if (result.success) {
        setSelectedPositions(new Set());
      }
    } catch (error: any) {
      setClaimResult({
        success: false,
        message: error.message || "Failed to claim shifts",
        errors: [],
      });
    } finally {
      setClaiming(false);
    }
  };

  const handleUnclaim = async (assignmentId: Id<"scenario_assignments">) => {
    try {
      await unclaimPosition({ token, assignmentId });
    } catch (error: any) {
      alert(error.message || "Failed to cancel shift");
    }
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "EEEE, MMM d");
    } catch {
      return dateStr;
    }
  };

  // Group positions by date for easier display
  const positionsByDate = useMemo(() => {
    if (!claimData?.data?.positionsByDate) return {};
    return claimData.data.positionsByDate;
  }, [claimData]);

  // Loading state
  if (claimData === undefined) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Error state
  if (claimData.error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Unable to Load</h1>
          <p className="text-slate-400">{claimData.error}</p>
        </div>
      </div>
    );
  }

  const data = claimData.data!;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-slate-800 rounded-xl p-6 mb-6 shadow-xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{data.scenarioName}</h1>
              <p className="text-slate-400">
                {formatDate(data.scenarioStartDate)} - {formatDate(data.scenarioEndDate)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="font-medium">{data.providerName}</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">{data.providerJobType}</span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-800 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-emerald-400">{data.totalAvailable}</div>
            <div className="text-sm text-slate-400">Available Shifts</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-blue-400">{data.alreadyAssigned}</div>
            <div className="text-sm text-slate-400">Your Shifts</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-purple-400">{selectedPositions.size}</div>
            <div className="text-sm text-slate-400">Selected</div>
          </div>
        </div>

        {/* Claim Result Message */}
        {claimResult && (
          <div className={`mb-6 p-4 rounded-lg ${claimResult.success ? "bg-emerald-500/20 border border-emerald-500/30" : "bg-red-500/20 border border-red-500/30"}`}>
            <div className="flex items-center gap-2">
              {claimResult.success ? (
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span className={claimResult.success ? "text-emerald-300" : "text-red-300"}>
                {claimResult.message}
              </span>
            </div>
            {claimResult.errors.length > 0 && (
              <ul className="mt-2 text-sm text-red-400 list-disc list-inside">
                {claimResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* My Current Assignments */}
        {myAssignments && !myAssignments.error && myAssignments.assignments.length > 0 && (
          <div className="bg-slate-800 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Your Claimed Shifts
            </h2>
            <div className="space-y-2">
              {myAssignments.assignments.map((assignment) => (
                <div
                  key={assignment.assignmentId}
                  className="flex items-center justify-between bg-slate-700/50 rounded-lg p-3"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-sm">
                      <span className="text-white font-medium">{formatDate(assignment.date)}</span>
                      <span className="text-slate-400 mx-2">|</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        assignment.shiftType === "AM" ? "bg-amber-500/20 text-amber-300" : "bg-indigo-500/20 text-indigo-300"
                      }`}>
                        {assignment.shiftType}
                      </span>
                      <span className="text-slate-400 ml-2">
                        {assignment.shiftStart} - {assignment.shiftEnd}
                      </span>
                    </div>
                    <div className="text-sm text-slate-400">
                      {assignment.serviceName} @ {assignment.hospitalName}
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnclaim(assignment.assignmentId)}
                    className="px-3 py-1 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available Shifts */}
        {data.totalAvailable === 0 ? (
          <div className="bg-slate-800 rounded-xl p-8 text-center">
            <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">No Available Shifts</h2>
            <p className="text-slate-400">There are no open shifts matching your skills at this time.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Available Shifts</h2>
              {selectedPositions.size > 0 && (
                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {claiming ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Claiming...
                    </>
                  ) : (
                    <>
                      Claim {selectedPositions.size} Shift{selectedPositions.size > 1 ? "s" : ""}
                    </>
                  )}
                </button>
              )}
            </div>

            {Object.entries(positionsByDate).map(([date, positions]) => (
              <div key={date} className="bg-slate-800 rounded-xl overflow-hidden">
                {/* Date Header */}
                <div
                  className="bg-slate-700/50 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-700/70 transition-colors"
                  onClick={() => handleSelectAllForDate(date, positions as PositionData[])}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={(positions as PositionData[]).every((p) => selectedPositions.has(p.positionId))}
                      onChange={() => handleSelectAllForDate(date, positions as PositionData[])}
                      className="w-4 h-4 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-white font-medium">{formatDate(date)}</span>
                    <span className="text-slate-400 text-sm">
                      {(positions as PositionData[]).length} shift{(positions as PositionData[]).length > 1 ? "s" : ""} available
                    </span>
                  </div>
                </div>

                {/* Positions */}
                <div className="divide-y divide-slate-700/50">
                  {(positions as PositionData[]).map((position) => (
                    <div
                      key={position.positionId}
                      className={`p-4 flex items-center gap-4 hover:bg-slate-700/30 transition-colors cursor-pointer ${
                        selectedPositions.has(position.positionId) ? "bg-emerald-500/10" : ""
                      }`}
                      onClick={() => handleTogglePosition(position.positionId)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPositions.has(position.positionId)}
                        onChange={() => handleTogglePosition(position.positionId)}
                        className="w-4 h-4 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500"
                      />

                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            position.shiftType === "AM" ? "bg-amber-500/20 text-amber-300" : "bg-indigo-500/20 text-indigo-300"
                          }`}>
                            {position.shiftType}
                          </span>
                          <span className="text-white">{position.shiftStart} - {position.shiftEnd}</span>
                          <span className="text-slate-500">|</span>
                          <span className="text-slate-300 font-medium">{position.serviceName}</span>
                          <span className="text-slate-500 text-sm">({position.serviceCode})</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <span>{position.hospitalName}</span>
                          {position.isHomeHospital && (
                            <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-xs rounded">Home</span>
                          )}
                          <span className="text-slate-600">|</span>
                          <span>{position.departmentName}</span>
                        </div>
                      </div>

                      <div className={`px-2 py-1 rounded text-xs ${
                        position.skillMatch === "Perfect" ? "bg-emerald-500/20 text-emerald-300" :
                        position.skillMatch === "Good" ? "bg-blue-500/20 text-blue-300" :
                        "bg-amber-500/20 text-amber-300"
                      }`}>
                        {position.skillMatch} Match
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-slate-500">
          <p>This link is unique to you. Do not share it with others.</p>
          <p className="mt-1">Link expires: {formatDate(data.scenarioEndDate)}</p>
        </div>
      </div>
    </div>
  );
}
