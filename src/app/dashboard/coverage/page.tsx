"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import Link from "next/link";
import { Id } from "../../../../convex/_generated/dataModel";
import { ExcelExport } from "../../../components/exports/ExcelExport";

export default function CoverageDashboardPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const hospitals = useQuery(api.hospitals.list, {});
  const departments = useQuery(api.departments.list, {});

  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");

  // Get coverage stats based on selection
  const coverageStats = useQuery(api.matching.getCoverageStats, {});

  // Get export data for detailed stats
  const exportData = useQuery(api.exports.getCoverageExportData, {
    hospitalId: selectedHospitalId ? (selectedHospitalId as Id<"hospitals">) : undefined,
    departmentId: selectedDepartmentId ? (selectedDepartmentId as Id<"departments">) : undefined,
  });

  const filteredDepartments = selectedHospitalId
    ? departments?.filter((d) => d.hospitalId === selectedHospitalId)
    : departments;

  // Calculate coverage percentage
  const coveragePercent = coverageStats
    ? coverageStats.totalPositions > 0
      ? Math.round((coverageStats.filled / coverageStats.totalPositions) * 100)
      : 0
    : 0;

  // Progress bar color based on coverage
  const getProgressColor = (percent: number) => {
    if (percent >= 80) return "bg-emerald-500";
    if (percent >= 60) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/dashboard"
              className="text-slate-400 hover:text-white text-sm mb-2 inline-block"
            >
              &larr; Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">Coverage Dashboard</h1>
            <p className="text-slate-400">
              Real-time coverage metrics and analytics
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-8">
          <select
            value={selectedHospitalId}
            onChange={(e) => {
              setSelectedHospitalId(e.target.value);
              setSelectedDepartmentId("");
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
            value={selectedDepartmentId}
            onChange={(e) => setSelectedDepartmentId(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Departments</option>
            {filteredDepartments?.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Coverage Overview Card */}
          <div className="lg:col-span-2 bg-slate-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Coverage Overview</h2>
            {coverageStats ? (
              <div className="space-y-6">
                {/* Main Coverage Ring */}
                <div className="flex items-center gap-8">
                  <div className="relative w-40 h-40">
                    <svg className="w-40 h-40 transform -rotate-90">
                      <circle
                        cx="80"
                        cy="80"
                        r="70"
                        fill="none"
                        stroke="#334155"
                        strokeWidth="12"
                      />
                      <circle
                        cx="80"
                        cy="80"
                        r="70"
                        fill="none"
                        stroke={coveragePercent >= 80 ? "#10b981" : coveragePercent >= 60 ? "#f59e0b" : "#ef4444"}
                        strokeWidth="12"
                        strokeDasharray={`${coveragePercent * 4.4} 440`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <p className="text-3xl font-bold">{coveragePercent}%</p>
                        <p className="text-sm text-slate-400">Coverage</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Total Positions</span>
                      <span className="text-2xl font-bold">{coverageStats.totalPositions}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-400">Filled</span>
                      <span className="text-2xl font-bold text-emerald-400">{coverageStats.filled}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-amber-400">Open</span>
                      <span className="text-2xl font-bold text-amber-400">{coverageStats.open}</span>
                    </div>
                  </div>
                </div>

                {/* Status Breakdown Bar */}
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-400">Position Status Breakdown</span>
                  </div>
                  <div className="h-4 bg-slate-700 rounded-full overflow-hidden flex">
                    {coverageStats.totalPositions > 0 && (
                      <>
                        <div
                          className="bg-blue-500 h-full"
                          style={{
                            width: `${((coverageStats.confirmed || 0) / coverageStats.totalPositions) * 100}%`,
                          }}
                          title={`Confirmed: ${coverageStats.confirmed || 0}`}
                        />
                        <div
                          className="bg-emerald-500 h-full"
                          style={{
                            width: `${((coverageStats.assigned || 0) / coverageStats.totalPositions) * 100}%`,
                          }}
                          title={`Assigned: ${coverageStats.assigned || 0}`}
                        />
                        <div
                          className="bg-amber-500 h-full"
                          style={{
                            width: `${(coverageStats.open / coverageStats.totalPositions) * 100}%`,
                          }}
                          title={`Open: ${coverageStats.open}`}
                        />
                      </>
                    )}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                      Confirmed ({coverageStats.confirmed || 0})
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-emerald-500 rounded-full"></span>
                      Assigned ({coverageStats.assigned || 0})
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
                      Open ({coverageStats.open})
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-slate-400">Loading...</p>
            )}
          </div>

          {/* Export Card */}
          <div>
            <ExcelExport
              hospitalId={selectedHospitalId ? (selectedHospitalId as Id<"hospitals">) : undefined}
              departmentId={selectedDepartmentId ? (selectedDepartmentId as Id<"departments">) : undefined}
            />
          </div>
        </div>

        {/* Coverage by Shift Type */}
        {exportData?.byShiftType && exportData.byShiftType.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Coverage by Shift Type</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {exportData.byShiftType.map((shift: any) => {
                const filled = shift.assigned + shift.confirmed;
                const percent = shift.total > 0 ? Math.round((filled / shift.total) * 100) : 0;
                const shiftDisplayNames: Record<string, string> = {
                  "Weekday_AM": "Weekday Day",
                  "Weekday_PM": "Weekday Night",
                  "Weekend_AM": "Weekend Day",
                  "Weekend_PM": "Weekend Night",
                  "day": "Day Shift",
                  "night": "Night Shift",
                };
                const shiftDisplayName = shiftDisplayNames[shift.shiftType as string] || shift.shiftType;

                const shiftColors: Record<string, string> = {
                  "Weekday_AM": "bg-yellow-600/30 border-yellow-500",
                  "Weekday_PM": "bg-indigo-600/30 border-indigo-500",
                  "Weekend_AM": "bg-orange-600/30 border-orange-500",
                  "Weekend_PM": "bg-purple-600/30 border-purple-500",
                };
                const shiftColor = shiftColors[shift.shiftType as string] || "bg-slate-700 border-slate-600";

                return (
                  <div
                    key={shift.shiftType}
                    className={`${shiftColor} border rounded-lg p-4`}
                  >
                    <p className="font-medium mb-2">{shiftDisplayName}</p>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-3xl font-bold">{percent}%</p>
                        <p className="text-xs text-slate-400">
                          {filled} / {shift.total} positions
                        </p>
                      </div>
                      <div className="text-right text-xs">
                        <p className="text-emerald-400">{shift.assigned} assigned</p>
                        <p className="text-blue-400">{shift.confirmed} confirmed</p>
                        <p className="text-amber-400">{shift.open} open</p>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full mt-3 overflow-hidden">
                      <div
                        className={`h-full ${getProgressColor(percent)} transition-all`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Coverage by Hospital */}
        {exportData?.byHospital && exportData.byHospital.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Coverage by Hospital</h2>
            <div className="space-y-4">
              {exportData.byHospital.map((hospital: any) => {
                const percent = hospital.total > 0
                  ? Math.round(((hospital.assigned + hospital.confirmed) / hospital.total) * 100)
                  : 0;
                return (
                  <div key={hospital.hospitalCode} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{hospital.hospitalName}</span>
                        <span className="text-xs text-slate-500 font-mono">
                          ({hospital.hospitalCode})
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-slate-400">
                          {hospital.assigned + hospital.confirmed} / {hospital.total}
                        </span>
                        <span className={`font-bold ${percent >= 80 ? "text-emerald-400" : percent >= 60 ? "text-amber-400" : "text-red-400"}`}>
                          {percent}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getProgressColor(percent)} transition-all`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Coverage by Department */}
        {exportData?.byDepartment && exportData.byDepartment.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Coverage by Department</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                      Hospital
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                      Department
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">
                      Total
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">
                      Filled
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">
                      Open
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">
                      Coverage
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {exportData.byDepartment.map((dept: any, index: number) => {
                    const filled = dept.assigned + dept.confirmed;
                    const percent = dept.total > 0 ? Math.round((filled / dept.total) * 100) : 0;
                    return (
                      <tr key={index} className="hover:bg-slate-700/50">
                        <td className="px-4 py-3 text-sm font-mono">
                          {dept.hospitalCode}
                        </td>
                        <td className="px-4 py-3">{dept.departmentName}</td>
                        <td className="px-4 py-3 text-center">{dept.total}</td>
                        <td className="px-4 py-3 text-center text-emerald-400">
                          {filled}
                        </td>
                        <td className="px-4 py-3 text-center text-amber-400">
                          {dept.open}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`px-2 py-1 rounded text-xs font-bold ${
                              percent >= 80
                                ? "bg-emerald-600/50 text-emerald-300"
                                : percent >= 60
                                ? "bg-amber-600/50 text-amber-300"
                                : "bg-red-600/50 text-red-300"
                            }`}
                          >
                            {percent}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/dashboard/matching"
            className="bg-slate-800 hover:bg-slate-700 rounded-lg p-4 text-center transition-colors"
          >
            <p className="text-emerald-400 text-2xl mb-1">+</p>
            <p className="font-medium">Match Providers</p>
            <p className="text-sm text-slate-400">Fill open positions</p>
          </Link>
          <Link
            href="/dashboard/providers"
            className="bg-slate-800 hover:bg-slate-700 rounded-lg p-4 text-center transition-colors"
          >
            <p className="text-blue-400 text-2xl mb-1">&#128101;</p>
            <p className="font-medium">View Providers</p>
            <p className="text-sm text-slate-400">Manage provider pool</p>
          </Link>
          <Link
            href="/dashboard/services"
            className="bg-slate-800 hover:bg-slate-700 rounded-lg p-4 text-center transition-colors"
          >
            <p className="text-purple-400 text-2xl mb-1">&#9881;</p>
            <p className="font-medium">Configure Services</p>
            <p className="text-sm text-slate-400">Add or edit services</p>
          </Link>
          <Link
            href="/dashboard/units"
            className="bg-slate-800 hover:bg-slate-700 rounded-lg p-4 text-center transition-colors"
          >
            <p className="text-amber-400 text-2xl mb-1">&#127970;</p>
            <p className="font-medium">Manage Units</p>
            <p className="text-sm text-slate-400">Hospital floor units</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
