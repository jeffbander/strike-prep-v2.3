"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import Link from "next/link";
import ProcedureDashboard from "@/components/procedures/ProcedureDashboard";
import ProcedureImport from "@/components/procedures/ProcedureImport";

export default function ProceduresPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const hospitals = useQuery(api.hospitals.list, {});
  const clearAllProcedures = useMutation(api.procedures.clearAllProcedures);

  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Default to today
    return new Date().toISOString().split("T")[0];
  });
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const isSuperAdmin = currentUser?.role === "super_admin";
  const needsHospitalSelection = isSuperAdmin || !currentUser?.hospitalId;

  // Determine effective hospital ID
  const effectiveHospitalId = (selectedHospitalId || currentUser?.hospitalId) as Id<"hospitals"> | undefined;

  // Query dashboard data
  const dashboardData = useQuery(
    api.procedures.getProcedureDashboard,
    effectiveHospitalId && selectedDate
      ? { hospitalId: effectiveHospitalId, startDate: selectedDate }
      : "skip"
  );

  // Filter hospitals based on user's health system
  const availableHospitals = hospitals?.filter((h) => {
    if (isSuperAdmin) return true;
    if (currentUser?.healthSystemId) {
      return h.healthSystemId === currentUser.healthSystemId;
    }
    return false;
  });

  const formatDateDisplay = (dateStr: string) => {
    try {
      const date = new Date(dateStr + "T00:00:00");
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const handleClearAll = async () => {
    if (!effectiveHospitalId) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete ALL procedure data for this hospital?\n\nThis action cannot be undone."
    );

    if (!confirmed) return;

    setIsClearing(true);
    try {
      const result = await clearAllProcedures({ hospitalId: effectiveHospitalId });
      alert(`Cleared ${result.patientsDeleted} patients and ${result.importsDeleted} imports.`);
    } catch (error) {
      alert(`Failed to clear: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/dashboard"
              className="text-slate-400 hover:text-white text-sm mb-2 inline-block"
            >
              &larr; Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">Procedure Schedule</h1>
            <p className="text-slate-400 text-sm mt-1">
              View scheduled procedures by service with admission predictions
            </p>
          </div>
          <div className="flex gap-3 items-center">
            {/* Hospital Selector */}
            {needsHospitalSelection && (
              <select
                value={selectedHospitalId}
                onChange={(e) => setSelectedHospitalId(e.target.value)}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-violet-500"
              >
                <option value="">Select Hospital...</option>
                {availableHospitals?.map((h) => (
                  <option key={h._id} value={h._id}>
                    {h.name}
                  </option>
                ))}
              </select>
            )}

            {/* Date Picker */}
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-violet-500"
            />

            {/* Clear All Button */}
            {effectiveHospitalId && (
              <button
                onClick={handleClearAll}
                disabled={isClearing}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
              >
                {isClearing ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                )}
                {isClearing ? "Clearing..." : "Clear All"}
              </button>
            )}

            {/* Import Button */}
            {effectiveHospitalId && (
              <button
                onClick={() => setIsImportOpen(true)}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                Import Procedures
              </button>
            )}
          </div>
        </div>

        {/* Date Display */}
        {selectedDate && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-300">
              {formatDateDisplay(selectedDate)}
            </h2>
          </div>
        )}

        {/* No Hospital Selected */}
        {!effectiveHospitalId && (
          <div className="bg-slate-800 rounded-lg p-12 text-center">
            <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <h2 className="text-xl font-semibold mb-2">Select a Hospital</h2>
            <p className="text-slate-400">Choose a hospital from the dropdown above to view procedure data.</p>
          </div>
        )}

        {/* Dashboard */}
        {effectiveHospitalId && (
          <ProcedureDashboard
            data={dashboardData}
            isLoading={dashboardData === undefined}
          />
        )}

        {/* Import Modal */}
        {effectiveHospitalId && (
          <ProcedureImport
            hospitalId={effectiveHospitalId}
            isOpen={isImportOpen}
            onClose={() => setIsImportOpen(false)}
            onImportComplete={() => {
              // Data will auto-refresh via Convex queries
            }}
          />
        )}
      </div>
    </div>
  );
}
