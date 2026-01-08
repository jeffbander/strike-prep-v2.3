"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import Link from "next/link";
import CensusImport from "@/components/census/CensusImport";

export default function CensusPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const hospitals = useQuery(api.hospitals.list, {});
  const healthSystems = useQuery(api.healthSystems.list, {});

  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("");
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedPatientMrn, setSelectedPatientMrn] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const generatePredictions = useAction(api.censusAI.generatePredictions);

  const isSuperAdmin = currentUser?.role === "super_admin";
  const needsHospitalSelection = isSuperAdmin || !currentUser?.hospitalId;

  // Determine effective hospital ID
  const effectiveHospitalId = (selectedHospitalId || currentUser?.hospitalId) as Id<"hospitals"> | undefined;

  // Query census data when hospital is selected
  const censusSummary = useQuery(
    api.census.getCensusSummaryByUnit,
    effectiveHospitalId ? { hospitalId: effectiveHospitalId } : "skip"
  );

  const latestImport = useQuery(
    api.census.getLatestImport,
    effectiveHospitalId ? { hospitalId: effectiveHospitalId } : "skip"
  );

  const patients = useQuery(
    api.census.getPatientsByDate,
    effectiveHospitalId && latestImport?.uploadDate
      ? {
          hospitalId: effectiveHospitalId,
          censusDate: latestImport.uploadDate,
          unitName: selectedUnitFilter || undefined,
        }
      : "skip"
  );

  const patientHistory = useQuery(
    api.census.getPatientHistory,
    effectiveHospitalId && selectedPatientMrn
      ? { hospitalId: effectiveHospitalId, mrn: selectedPatientMrn }
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

  // Calculate predicted discharges (patients with projected days <= 2)
  const predictedDischarges = patients?.filter(
    (p) => p.projectedDischargeDays && p.projectedDischargeDays <= 2
  ).length || 0;

  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const handleRegeneratePredictions = async () => {
    if (!latestImport?._id) return;

    setIsRegenerating(true);
    try {
      const result = await generatePredictions({ importId: latestImport._id });
      if (result.errors.length > 0) {
        console.error("Prediction errors:", result.errors);
        alert(`Processed ${result.processed} patients with ${result.errors.length} errors:\n${result.errors.slice(0, 3).join('\n')}`);
      } else {
        alert(`Successfully regenerated predictions for ${result.processed} patients`);
      }
    } catch (error: unknown) {
      console.error("Failed to regenerate predictions:", error);
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "object" && error !== null) {
        errorMessage = JSON.stringify(error, null, 2);
      } else {
        errorMessage = String(error);
      }
      alert(`Failed to regenerate predictions:\n${errorMessage}`);
    } finally {
      setIsRegenerating(false);
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
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">Patient Census</h1>
            {latestImport && (
              <p className="text-slate-400 text-sm mt-1">
                Census date: {formatDate(latestImport.uploadDate)} • Imported{" "}
                {formatDateTime(latestImport.importedAt)}
              </p>
            )}
          </div>
          <div className="flex gap-3 items-center">
            {/* Hospital Selector */}
            {needsHospitalSelection && (
              <select
                value={selectedHospitalId}
                onChange={(e) => {
                  setSelectedHospitalId(e.target.value);
                  setSelectedUnitFilter("");
                }}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
              >
                <option value="">Select Hospital...</option>
                {availableHospitals?.map((h) => (
                  <option key={h._id} value={h._id}>
                    {h.name}
                  </option>
                ))}
              </select>
            )}
            {effectiveHospitalId && latestImport && (
              <button
                onClick={handleRegeneratePredictions}
                disabled={isRegenerating}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
              >
                {isRegenerating ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                )}
                {isRegenerating ? "Regenerating..." : "Regenerate Predictions"}
              </button>
            )}
            {effectiveHospitalId && (
              <button
                onClick={() => setIsImportOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                Import Census
              </button>
            )}
          </div>
        </div>

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
            <p className="text-slate-400">Choose a hospital from the dropdown above to view census data.</p>
          </div>
        )}

        {/* Loading State */}
        {effectiveHospitalId && censusSummary === undefined && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* No Data State */}
        {effectiveHospitalId && censusSummary && censusSummary.totalPatients === 0 && (
          <div className="bg-slate-800 rounded-lg p-12 text-center">
            <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h2 className="text-xl font-semibold mb-2">No Census Data</h2>
            <p className="text-slate-400 mb-4">Import a census Excel file to get started.</p>
            <button
              onClick={() => setIsImportOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors inline-flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              Import Census
            </button>
          </div>
        )}

        {/* Census Dashboard */}
        {effectiveHospitalId && censusSummary && censusSummary.totalPatients > 0 && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Total Patients</p>
                    <p className="text-3xl font-bold">{censusSummary.totalPatients}</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-red-600/20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">ICU Patients</p>
                    <p className="text-3xl font-bold text-red-400">{censusSummary.icuPatients}</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Floor Patients</p>
                    <p className="text-3xl font-bold text-blue-400">{censusSummary.floorPatients}</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Predicted Discharges</p>
                    <p className="text-3xl font-bold text-emerald-400">{predictedDischarges}</p>
                    <p className="text-xs text-slate-500">within 2 days</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Unit Breakdown */}
            <div className="bg-slate-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Census by Unit</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {censusSummary.units.map((unit) => (
                  <button
                    key={unit.unitName}
                    onClick={() =>
                      setSelectedUnitFilter(
                        selectedUnitFilter === unit.unitName ? "" : unit.unitName
                      )
                    }
                    className={`p-4 rounded-lg text-left transition-colors ${
                      selectedUnitFilter === unit.unitName
                        ? "bg-emerald-600/30 border-2 border-emerald-500"
                        : "bg-slate-700/50 hover:bg-slate-700 border-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          unit.unitType === "icu"
                            ? "bg-red-900/50 text-red-300"
                            : "bg-blue-900/50 text-blue-300"
                        }`}
                      >
                        {unit.unitType.toUpperCase()}
                      </span>
                      <span className="text-2xl font-bold">{unit.patientCount}</span>
                    </div>
                    <p className="text-white font-medium truncate">{unit.unitName}</p>
                    {unit.avgProjectedDays > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        Avg {unit.avgProjectedDays} days to discharge
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Patient Table */}
            <div className="bg-slate-800 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    Patients {selectedUnitFilter && `- ${selectedUnitFilter}`}
                  </h2>
                  <p className="text-sm text-slate-400">{patients?.length || 0} patients</p>
                </div>
                {selectedUnitFilter && (
                  <button
                    onClick={() => setSelectedUnitFilter("")}
                    className="text-sm text-slate-400 hover:text-white"
                  >
                    Clear filter
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                        Initials
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                        MRN
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                        Unit
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                        Admit Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                        Primary Diagnosis
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                        Clinical Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                        Pending Procedures
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">
                        Projected Days
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {patients === undefined ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                          Loading...
                        </td>
                      </tr>
                    ) : patients.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                          No patients found
                        </td>
                      </tr>
                    ) : (
                      patients.map((patient) => (
                        <tr
                          key={patient._id}
                          className="hover:bg-slate-700/50 cursor-pointer"
                          onClick={() =>
                            setSelectedPatientMrn(
                              selectedPatientMrn === patient.mrn ? null : patient.mrn
                            )
                          }
                        >
                          <td className="px-4 py-3">
                            <span className="font-medium text-white">{patient.initials}</span>
                          </td>
                          <td className="px-4 py-3 font-mono text-sm text-slate-300">
                            {patient.mrn}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                patient.unitType === "icu"
                                  ? "bg-red-900/50 text-red-300"
                                  : "bg-blue-900/50 text-blue-300"
                              }`}
                            >
                              {patient.currentUnitName}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {formatDate(patient.admissionDate)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate">
                            {patient.primaryDiagnosis || (
                              <span className="text-slate-500 italic">No diagnosis</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate">
                            {patient.clinicalStatus || (
                              <span className="text-slate-500 italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate">
                            {patient.pendingProcedures || (
                              <span className="text-slate-500 italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {patient.projectedDischargeDays ? (
                              <span
                                className={`px-2 py-1 rounded text-sm font-medium ${
                                  patient.projectedDischargeDays <= 2
                                    ? "bg-emerald-900/50 text-emerald-300"
                                    : patient.projectedDischargeDays <= 7
                                    ? "bg-yellow-900/50 text-yellow-300"
                                    : "bg-slate-700 text-slate-300"
                                }`}
                              >
                                {patient.projectedDischargeDays} days
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Patient Detail Panel */}
            {selectedPatientMrn && patients && (
              <div className="bg-slate-800 rounded-lg p-6">
                {(() => {
                  const patient = patients.find((p) => p.mrn === selectedPatientMrn);
                  if (!patient) return null;

                  return (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold">
                          Patient Detail - {patient.initials}
                        </h2>
                        <button
                          onClick={() => setSelectedPatientMrn(null)}
                          className="text-slate-400 hover:text-white"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div>
                          <p className="text-slate-400 text-sm">MRN</p>
                          <p className="font-mono">{patient.mrn}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm">Current Unit</p>
                          <p>{patient.currentUnitName}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm">Admission Date</p>
                          <p>{formatDate(patient.admissionDate)}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-sm">Attending</p>
                          <p>{patient.attendingDoctor || "—"}</p>
                        </div>
                      </div>

                      {patient.primaryDiagnosis && (
                        <div className="mb-4">
                          <p className="text-slate-400 text-sm mb-1">Primary Diagnosis</p>
                          <p className="bg-slate-700/50 rounded p-3">{patient.primaryDiagnosis}</p>
                        </div>
                      )}

                      {patient.clinicalStatus && (
                        <div className="mb-4">
                          <p className="text-slate-400 text-sm mb-1">Clinical Status</p>
                          <p className="bg-slate-700/50 rounded p-3">{patient.clinicalStatus}</p>
                        </div>
                      )}

                      {patient.dispositionConsiderations && (
                        <div className="mb-4">
                          <p className="text-slate-400 text-sm mb-1">Disposition Considerations</p>
                          <p className="bg-slate-700/50 rounded p-3">
                            {patient.dispositionConsiderations}
                          </p>
                        </div>
                      )}

                      {patient.pendingProcedures && (
                        <div className="mb-4">
                          <p className="text-slate-400 text-sm mb-1">Pending Procedures</p>
                          <p className="bg-slate-700/50 rounded p-3">
                            {patient.pendingProcedures}
                          </p>
                        </div>
                      )}

                      {/* Transfer History */}
                      {patientHistory && patientHistory.length > 0 && (
                        <div>
                          <p className="text-slate-400 text-sm mb-2">Transfer History</p>
                          <div className="space-y-2">
                            {patientHistory.map((history, i) => (
                              <div
                                key={history._id}
                                className="flex items-center gap-3 text-sm bg-slate-700/30 rounded p-2"
                              >
                                <div
                                  className={`w-2 h-2 rounded-full ${
                                    i === 0 ? "bg-emerald-400" : "bg-slate-500"
                                  }`}
                                />
                                <span className="text-slate-400">
                                  {formatDate(history.transferDate)}
                                </span>
                                {history.fromUnitName ? (
                                  <>
                                    <span className="text-slate-300">{history.fromUnitName}</span>
                                    <svg
                                      className="w-4 h-4 text-slate-500"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                                      />
                                    </svg>
                                    <span className="text-white font-medium">
                                      {history.toUnitName}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-emerald-400">Admitted to</span>
                                    <span className="text-white font-medium">
                                      {history.toUnitName}
                                    </span>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* Import Modal */}
        {effectiveHospitalId && (
          <CensusImport
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
