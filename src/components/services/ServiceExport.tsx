"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";

interface ServiceExportProps {
  departmentId?: Id<"departments">;
  hospitalId?: Id<"hospitals">;
  departmentName?: string;
}

export default function ServiceExport({
  departmentId,
  hospitalId,
  departmentName,
}: ServiceExportProps) {
  const exportData = useQuery(api.exports.getServicesExportData, {
    departmentId,
    hospitalId,
  });

  const handleExport = () => {
    if (!exportData?.services || exportData.services.length === 0) {
      toast.error("No services to export");
      return;
    }

    // Define CSV headers matching all service attributes
    const headers = [
      "Name",
      "Short Code",
      "Hospital Code",
      "Hospital Name",
      "Department Name",
      "Unit Name",
      "Service Type",
      "Admit Capacity",
      "Feeder Source",
      "Linked Downstream Service",
      "Day Capacity",
      "Night Capacity",
      "Weekend Capacity",
      "Day Shift Start",
      "Day Shift End",
      "Night Shift Start",
      "Night Shift End",
      "Operates Days",
      "Operates Nights",
      "Operates Weekends",
      "Is Active",
      "Job Types",
    ];

    // Convert services to CSV rows
    const rows = exportData.services.map((service) => [
      service.name,
      service.shortCode,
      service.hospitalCode,
      service.hospitalName,
      service.departmentName,
      service.unitName,
      service.serviceType,
      service.admitCapacity,
      service.feederSource,
      service.linkedDownstreamServiceCode,
      service.dayCapacity,
      service.nightCapacity,
      service.weekendCapacity,
      service.dayShiftStart,
      service.dayShiftEnd,
      service.nightShiftStart,
      service.nightShiftEnd,
      service.operatesDays,
      service.operatesNights,
      service.operatesWeekends,
      service.isActive,
      service.jobTypes,
    ]);

    // Escape CSV values
    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Build CSV content
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map(escapeCSV).join(",")),
    ].join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `services_${departmentName || "all"}_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${exportData.services.length} services`);
  };

  return (
    <button
      onClick={handleExport}
      disabled={!exportData}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-sm transition-colors flex items-center gap-2"
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
      Export Services
    </button>
  );
}
