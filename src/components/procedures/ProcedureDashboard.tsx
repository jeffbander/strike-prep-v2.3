"use client";

import { useState } from "react";
import { Id } from "../../../convex/_generated/dataModel";

interface ServiceStats {
  count: number;
  willAdmit: number;
  sameDayDischarge: number;
  ccuDays: number;
  floorDays: number;
  riskModified: number;
}

interface Patient {
  _id: Id<"procedure_patients">;
  mrn: string;
  initials: string;
  visitDate: string;
  procedureText: string;
  procedureCategory: string;
  serviceType: "EP" | "Cath" | "Structural";
  willAdmit: boolean;
  icuDays: number;
  floorDays: number;
  totalLOS: number;
  riskFactors: string[];
  riskModified: boolean;
  reasoning: string;
  provider?: string;
  age?: number;
  ef?: number;
  creatinine?: number;
  hemoglobin?: number;
}

interface DashboardData {
  dateRange: { start: string; end: string };
  summary: {
    totalProcedures: number;
    willAdmit: number;
    sameDayDischarge: number;
    riskModified: number;
    ccuBedDays: number;
    floorBedDays: number;
  };
  byService: {
    EP: ServiceStats;
    Cath: ServiceStats;
    Structural: ServiceStats;
  };
  patients: Patient[];
}

interface ProcedureDashboardProps {
  data: DashboardData | null | undefined;
  isLoading: boolean;
}

const SERVICE_COLORS = {
  EP: { bg: "bg-purple-600/20", text: "text-purple-400", border: "border-purple-500" },
  Cath: { bg: "bg-blue-600/20", text: "text-blue-400", border: "border-blue-500" },
  Structural: { bg: "bg-amber-600/20", text: "text-amber-400", border: "border-amber-500" },
};

const RISK_FACTOR_LABELS: Record<string, string> = {
  age_gt_85: "Age >85",
  ef_lt_30: "EF <30%",
  cr_gt_1_5: "Cr >1.5",
  hgb_lt_10: "Hgb <10",
};

export default function ProcedureDashboard({ data, isLoading }: ProcedureDashboardProps) {
  const [selectedService, setSelectedService] = useState<"all" | "EP" | "Cath" | "Structural">("all");
  const [expandedPatient, setExpandedPatient] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!data || data.patients.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-12 text-center">
        <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <h2 className="text-xl font-semibold text-white mb-2">No Procedures Found</h2>
        <p className="text-slate-400">Import procedure data or select a different date.</p>
      </div>
    );
  }

  const filteredPatients = selectedService === "all"
    ? data.patients
    : data.patients.filter((p) => p.serviceType === selectedService);

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr + "T00:00:00");
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-4">
        <div className="bg-slate-800 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Total Procedures</p>
          <p className="text-3xl font-bold text-white">{data.summary.totalProcedures}</p>
        </div>
        <div className="bg-slate-800 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Will Admit</p>
          <p className="text-3xl font-bold text-orange-400">{data.summary.willAdmit}</p>
          <p className="text-xs text-slate-500">
            {data.summary.totalProcedures > 0
              ? `${Math.round((data.summary.willAdmit / data.summary.totalProcedures) * 100)}%`
              : "0%"}
          </p>
        </div>
        <div className="bg-slate-800 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Same-Day</p>
          <p className="text-3xl font-bold text-emerald-400">{data.summary.sameDayDischarge}</p>
          <p className="text-xs text-slate-500">
            {data.summary.totalProcedures > 0
              ? `${Math.round((data.summary.sameDayDischarge / data.summary.totalProcedures) * 100)}%`
              : "0%"}
          </p>
        </div>
        <div className="bg-slate-800 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Risk-Modified</p>
          <p className="text-3xl font-bold text-red-400">{data.summary.riskModified}</p>
          <p className="text-xs text-slate-500">Escalated to admit</p>
        </div>
        <div className="bg-slate-800 rounded-lg p-4">
          <p className="text-slate-400 text-sm">CCU Bed Days</p>
          <p className="text-3xl font-bold text-red-300">{data.summary.ccuBedDays}</p>
        </div>
        <div className="bg-slate-800 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Floor Bed Days</p>
          <p className="text-3xl font-bold text-blue-300">{data.summary.floorBedDays}</p>
        </div>
      </div>

      {/* Service Breakdown */}
      <div className="grid grid-cols-3 gap-4">
        {(["EP", "Cath", "Structural"] as const).map((service) => {
          const stats = data.byService[service];
          const colors = SERVICE_COLORS[service];
          const isSelected = selectedService === service;

          return (
            <button
              key={service}
              onClick={() => setSelectedService(isSelected ? "all" : service)}
              className={`${colors.bg} rounded-lg p-4 text-left transition-all ${
                isSelected ? `ring-2 ${colors.border}` : "hover:ring-1 hover:ring-slate-600"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-lg font-semibold ${colors.text}`}>
                  {service === "EP" ? "EP Lab" : service === "Cath" ? "Cath Lab" : "Structural"}
                </h3>
                <span className="text-2xl font-bold text-white">{stats.count}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-slate-400">Admits:</span>
                  <span className="ml-1 text-orange-400">{stats.willAdmit}</span>
                </div>
                <div>
                  <span className="text-slate-400">Same-Day:</span>
                  <span className="ml-1 text-emerald-400">{stats.sameDayDischarge}</span>
                </div>
                <div>
                  <span className="text-slate-400">CCU Days:</span>
                  <span className="ml-1 text-red-300">{stats.ccuDays}</span>
                </div>
                <div>
                  <span className="text-slate-400">Floor Days:</span>
                  <span className="ml-1 text-blue-300">{stats.floorDays}</span>
                </div>
              </div>
              {stats.riskModified > 0 && (
                <div className="mt-2 text-xs text-red-400">
                  {stats.riskModified} risk-modified
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Patient Table */}
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Procedures {selectedService !== "all" && `- ${selectedService}`}
            </h2>
            <p className="text-sm text-slate-400">{filteredPatients.length} patients</p>
          </div>
          {selectedService !== "all" && (
            <button
              onClick={() => setSelectedService("all")}
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
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Procedure</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Service</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Disposition</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-300 uppercase">ICU</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-300 uppercase">Floor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Risk Factors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredPatients.map((patient) => {
                const colors = SERVICE_COLORS[patient.serviceType];
                const isExpanded = expandedPatient === patient._id;

                return (
                  <>
                    <tr
                      key={patient._id}
                      className="hover:bg-slate-700/50 cursor-pointer"
                      onClick={() => setExpandedPatient(isExpanded ? null : patient._id)}
                    >
                      <td className="px-4 py-3 text-slate-300 text-sm">
                        {formatDate(patient.visitDate)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-white">{patient.initials}</span>
                        <span className="ml-2 text-slate-500 text-xs font-mono">{patient.mrn}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate">
                        {patient.procedureText}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
                          {patient.serviceType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            patient.willAdmit
                              ? "bg-orange-900/50 text-orange-300"
                              : "bg-emerald-900/50 text-emerald-300"
                          }`}
                        >
                          {patient.willAdmit ? "Admit" : "Same-Day"}
                        </span>
                        {patient.riskModified && (
                          <span className="ml-1 text-red-400 text-xs" title="Risk-modified to admit">
                            *
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {patient.icuDays > 0 ? (
                          <span className="text-red-300 font-medium">{patient.icuDays}</span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {patient.floorDays > 0 ? (
                          <span className="text-blue-300 font-medium">{patient.floorDays}</span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {patient.riskFactors.length > 0 ? (
                            patient.riskFactors.map((rf) => (
                              <span
                                key={rf}
                                className="px-1.5 py-0.5 bg-red-900/30 text-red-300 rounded text-xs"
                              >
                                {RISK_FACTOR_LABELS[rf] || rf}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${patient._id}-detail`} className="bg-slate-900/50">
                        <td colSpan={8} className="px-4 py-4">
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-slate-400">Category</p>
                              <p className="text-white">{patient.procedureCategory.replace(/_/g, " ")}</p>
                            </div>
                            {patient.provider && (
                              <div>
                                <p className="text-slate-400">Provider</p>
                                <p className="text-white">{patient.provider}</p>
                              </div>
                            )}
                            {patient.age && (
                              <div>
                                <p className="text-slate-400">Age</p>
                                <p className="text-white">{patient.age} years</p>
                              </div>
                            )}
                            {patient.ef !== undefined && (
                              <div>
                                <p className="text-slate-400">EF</p>
                                <p className="text-white">{patient.ef}%</p>
                              </div>
                            )}
                            {patient.creatinine !== undefined && (
                              <div>
                                <p className="text-slate-400">Creatinine</p>
                                <p className="text-white">{patient.creatinine} mg/dL</p>
                              </div>
                            )}
                            {patient.hemoglobin !== undefined && (
                              <div>
                                <p className="text-slate-400">Hemoglobin</p>
                                <p className="text-white">{patient.hemoglobin} g/dL</p>
                              </div>
                            )}
                          </div>
                          {patient.reasoning && (
                            <div className="mt-3 p-3 bg-slate-800 rounded">
                              <p className="text-slate-400 text-xs mb-1">AI Reasoning</p>
                              <p className="text-slate-300 text-sm">{patient.reasoning}</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
