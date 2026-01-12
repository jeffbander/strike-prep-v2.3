"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import Link from "next/link";
import ProcedureImport from "@/components/procedures/ProcedureImport";

export default function ProceduresPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const hospitals = useQuery(api.hospitals.list, {});

  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("");
  const [isImportOpen, setIsImportOpen] = useState(false);

  const isSuperAdmin = currentUser?.role === "super_admin";
  const needsHospitalSelection = isSuperAdmin || !currentUser?.hospitalId;

  // Determine effective hospital ID
  const effectiveHospitalId = (selectedHospitalId || currentUser?.hospitalId) as Id<"hospitals"> | undefined;

  // Query procedure data
  const latestImport = useQuery(
    api.procedures.getLatestImport,
    effectiveHospitalId ? { hospitalId: effectiveHospitalId } : "skip"
  );

  const procedureSummary = useQuery(
    api.procedures.getProcedureSummary,
    effectiveHospitalId
      ? { hospitalId: effectiveHospitalId }
      : "skip"
  );

  const patients = useQuery(
    api.procedures.getPatientsByImport,
    latestImport ? { importId: latestImport._id } : "skip"
  );

  // Filter hospitals based on user's health system
  const availableHospitals = hospitals?.filter((h) => {
    if (isSuperAdmin) return true;
    if (currentUser?.healthSystemId) {
      return h.healthSystemId === currentUser.healthSystemId;
    }
    return false;
  });

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

  // Format procedure category for display
  const formatCategory = (cat: string) => {
    const map: Record<string, string> = {
      TAVR: "TAVR",
      VT_ABLATION: "VT Ablation",
      PCI: "PCI",
      AFIB_ABLATION: "AFib Ablation",
      AFLUTTER_ABLATION: "Flutter Ablation",
      SVT_ABLATION: "SVT Ablation",
      PVI: "PVI",
      WATCHMAN: "Watchman",
      PPM: "Pacemaker",
      ICD: "ICD",
      CRTD: "CRT-D",
      CRTP: "CRT-P",
      DIAGNOSTIC_CATH: "Diagnostic Cath",
      EP_STUDY: "EP Study",
      TEE: "TEE",
      CARDIOVERSION: "Cardioversion",
      LOOP_RECORDER: "Loop Recorder",
      LEAD_EXTRACTION: "Lead Extraction",
      GENERATOR_CHANGE: "Generator Change",
      UNKNOWN: "Other",
    };
    return map[cat] || cat;
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
            <h1 className="text-3xl font-bold">Procedure Schedule</h1>
            {latestImport && (
              <p className="text-slate-400 text-sm mt-1">
                Procedure date: {formatDate(latestImport.procedureDate)} • Imported{" "}
                {formatDateTime(latestImport.importedAt)}
              </p>
            )}
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

        {/* Loading State */}
        {effectiveHospitalId && procedureSummary === undefined && latestImport === undefined && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* No Data State */}
        {effectiveHospitalId && latestImport === null && (
          <div className="bg-slate-800 rounded-lg p-12 text-center">
            <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h2 className="text-xl font-semibold mb-2">No Procedure Data</h2>
            <p className="text-slate-400 mb-4">Import a procedure schedule CSV to get started.</p>
            <button
              onClick={() => setIsImportOpen(true)}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors inline-flex items-center gap-2"
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
          </div>
        )}

        {/* Procedure Dashboard */}
        {effectiveHospitalId && procedureSummary && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-5 gap-4">
              <div className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-violet-600/20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Total Procedures</p>
                    <p className="text-3xl font-bold">{procedureSummary.totalPatients}</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-red-600/20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Will Admit</p>
                    <p className="text-3xl font-bold text-red-400">{procedureSummary.willAdmit}</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-emerald-600/20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Same-Day</p>
                    <p className="text-3xl font-bold text-emerald-400">{procedureSummary.sameDayDischarge}</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">CCU Days</p>
                    <p className="text-3xl font-bold text-blue-400">{procedureSummary.bedCountsByUnit.CCU}</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-amber-600/20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Floor Days</p>
                    <p className="text-3xl font-bold text-amber-400">{procedureSummary.bedCountsByUnit.N07E}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Procedure Categories */}
            <div className="bg-slate-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">By Procedure Type</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Object.entries(procedureSummary.byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, count]) => (
                    <div
                      key={category}
                      className="bg-slate-700/50 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium">{formatCategory(category)}</span>
                        <span className="text-2xl font-bold text-violet-400">{count}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Patient Table */}
            <div className="bg-slate-800 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700">
                <h2 className="text-lg font-semibold">Procedure Patients</h2>
                <p className="text-sm text-slate-400">{patients?.length || 0} procedures</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Patient</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">MRN</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Visit Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Procedure</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Category</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-300 uppercase">Admit?</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">LOS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {patients === undefined ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                          Loading...
                        </td>
                      </tr>
                    ) : patients.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                          No procedures found
                        </td>
                      </tr>
                    ) : (
                      patients.map((patient) => (
                        <tr key={patient._id} className="hover:bg-slate-700/50">
                          <td className="px-4 py-3">
                            <span className="font-medium text-white">{patient.initials}</span>
                            {patient.age && <span className="text-slate-400 ml-1">({patient.age}y)</span>}
                          </td>
                          <td className="px-4 py-3 font-mono text-sm text-slate-300">{patient.mrn}</td>
                          <td className="px-4 py-3 text-slate-300">{patient.visitDate}</td>
                          <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate">
                            {patient.procedureText || <span className="text-slate-500 italic">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-violet-900/50 text-violet-300">
                              {formatCategory(patient.procedureCategory)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {patient.willAdmit ? (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-900/50 text-red-300">
                                Yes
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/50 text-emerald-300">
                                No
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {patient.willAdmit ? (
                              <div className="text-sm">
                                <span className="text-white font-medium">{patient.totalLOS}d</span>
                                <span className="text-slate-400 ml-1">
                                  ({patient.icuDays > 0 && `${patient.icuDays} CCU`}
                                  {patient.icuDays > 0 && patient.floorDays > 0 && " + "}
                                  {patient.floorDays > 0 && `${patient.floorDays} floor`})
                                </span>
                              </div>
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
          </div>
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
