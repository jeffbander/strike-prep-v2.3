"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import * as XLSX from "xlsx";

interface LaborPoolExportProps {
  departmentId: Id<"departments">;
  departmentName: string;
}

export default function LaborPoolExport({ departmentId, departmentName }: LaborPoolExportProps) {
  const exportData = useQuery(api.laborPool.getLaborPoolExportData, { departmentId });

  const handleDownload = () => {
    if (!exportData) return;

    const workbook = XLSX.utils.book_new();

    // Sheet 1: Services & Staffing Data (consolidated)
    const headers = [
      "Service",
      "Short Code",
      "Role",
      ...exportData.shiftTypes,
      "Day Capacity",
      "Night Capacity",
      "Weekend Capacity",
      "Skills",
      // Service configuration columns
      "Service Type",
      "Admit Capacity",
      "Feeder Source",
      "Linked Downstream",
      "Day Shift Start",
      "Day Shift End",
      "Night Shift Start",
      "Night Shift End",
      "Unit",
    ];

    const dataRows = exportData.rows.map((row) => [
      row.serviceName,
      row.serviceShortCode,
      row.roleCode,
      ...exportData.shiftTypes.map((st) => row.headcounts[st] ?? 0),
      row.capacities.day ?? "",
      row.capacities.night ?? "",
      row.capacities.weekend ?? "",
      row.skills.join(", "),
      // Service config (only on first row per service)
      row.serviceType ?? "",
      row.admitCapacity ?? "",
      row.feederSource ?? "",
      row.linkedDownstreamService ?? "",
      row.dayShiftStart ?? "",
      row.dayShiftEnd ?? "",
      row.nightShiftStart ?? "",
      row.nightShiftEnd ?? "",
      row.unitName ?? "",
    ]);

    const servicesSheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

    // Set column widths
    servicesSheet["!cols"] = [
      { wch: 25 }, // Service
      { wch: 12 }, // Short Code
      { wch: 8 },  // Role
      ...exportData.shiftTypes.map(() => ({ wch: 12 })),
      { wch: 12 }, // Day Capacity
      { wch: 14 }, // Night Capacity
      { wch: 16 }, // Weekend Capacity
      { wch: 30 }, // Skills
      // Service config columns
      { wch: 12 }, // Service Type
      { wch: 14 }, // Admit Capacity
      { wch: 12 }, // Feeder Source
      { wch: 16 }, // Linked Downstream
      { wch: 14 }, // Day Shift Start
      { wch: 14 }, // Day Shift End
      { wch: 14 }, // Night Shift Start
      { wch: 14 }, // Night Shift End
      { wch: 15 }, // Unit
    ];

    XLSX.utils.book_append_sheet(workbook, servicesSheet, "Services");

    // Sheet 2: Reference (available roles and skills)
    const rolesHeader = ["Available Roles", "Code"];
    const rolesData = exportData.availableRoles.map((r) => [r.name, r.code]);

    const skillsHeader = ["Available Skills", "Category"];
    const skillsData = exportData.availableSkills.map((s) => [s.name, s.category]);

    // Combine roles and skills with spacing
    const referenceData = [
      rolesHeader,
      ...rolesData,
      [], // Empty row
      [], // Empty row
      skillsHeader,
      ...skillsData,
    ];

    const referenceSheet = XLSX.utils.aoa_to_sheet(referenceData);
    referenceSheet["!cols"] = [{ wch: 30 }, { wch: 15 }];

    XLSX.utils.book_append_sheet(workbook, referenceSheet, "Reference");

    // Generate filename with date
    const date = new Date().toISOString().split("T")[0];
    const filename = `${departmentName.replace(/[^a-zA-Z0-9]/g, "_")}_Services_${date}.xlsx`;

    // Trigger download
    XLSX.writeFile(workbook, filename);
  };

  const isLoading = exportData === undefined;
  const isEmpty = exportData?.rows.length === 0;

  return (
    <button
      onClick={handleDownload}
      disabled={isLoading}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-sm transition-colors flex items-center gap-2"
      title={isEmpty ? "No services to export" : "Download services and staffing as Excel"}
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        />
      </svg>
      {isLoading ? "Loading..." : "Export Services"}
    </button>
  );
}
