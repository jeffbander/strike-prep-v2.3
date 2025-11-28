"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import * as XLSX from "xlsx";

interface ExcelExportProps {
  hospitalId?: Id<"hospitals">;
  departmentId?: Id<"departments">;
}

export function ExcelExport({ hospitalId, departmentId }: ExcelExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<"coverage" | "providers">("coverage");

  const coverageData = useQuery(api.exports.getCoverageExportData, {
    hospitalId,
    departmentId,
  });

  const providersData = useQuery(api.exports.getProvidersExportData, {
    hospitalId,
    departmentId,
  });

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const workbook = XLSX.utils.book_new();

      if (exportType === "coverage" && coverageData) {
        // Summary Sheet
        const summaryData = [
          ["Coverage Report Summary"],
          [""],
          ["Metric", "Value"],
          ["Total Positions", coverageData.summary.total],
          ["Open Positions", coverageData.summary.open],
          ["Assigned Positions", coverageData.summary.assigned],
          ["Confirmed Positions", coverageData.summary.confirmed],
          ["Filled (Assigned + Confirmed)", coverageData.summary.filled],
          ["Coverage Rate", `${coverageData.summary.coveragePercent}%`],
          [""],
          ["Exported At", coverageData.summary.exportedAt],
          ["Exported By", coverageData.summary.exportedBy],
        ];
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

        // By Hospital Sheet
        if (coverageData.byHospital.length > 0) {
          const hospitalHeaders = [
            "Hospital Name",
            "Hospital Code",
            "Total",
            "Open",
            "Assigned",
            "Confirmed",
          ];
          const hospitalRows = coverageData.byHospital.map((h: any) => [
            h.hospitalName,
            h.hospitalCode,
            h.total,
            h.open,
            h.assigned,
            h.confirmed,
          ]);
          const hospitalSheet = XLSX.utils.aoa_to_sheet([
            hospitalHeaders,
            ...hospitalRows,
          ]);
          XLSX.utils.book_append_sheet(workbook, hospitalSheet, "By Hospital");
        }

        // By Department Sheet
        if (coverageData.byDepartment.length > 0) {
          const deptHeaders = [
            "Hospital Code",
            "Department Name",
            "Total",
            "Open",
            "Assigned",
            "Confirmed",
          ];
          const deptRows = coverageData.byDepartment.map((d: any) => [
            d.hospitalCode,
            d.departmentName,
            d.total,
            d.open,
            d.assigned,
            d.confirmed,
          ]);
          const deptSheet = XLSX.utils.aoa_to_sheet([deptHeaders, ...deptRows]);
          XLSX.utils.book_append_sheet(workbook, deptSheet, "By Department");
        }

        // Detailed Positions Sheet
        const positionHeaders = [
          "Job Code",
          "Status",
          "Hospital",
          "Hospital Code",
          "Department",
          "Service",
          "Service Code",
          "Job Type",
          "Job Type Code",
          "Shift Type",
          "Shift Start",
          "Shift End",
          "Position #",
          "Provider First Name",
          "Provider Last Name",
          "Provider Employee ID",
          "Provider Phone",
          "Assignment Status",
          "Assigned At",
        ];
        const positionRows = coverageData.positions.map((p: any) => [
          p.jobCode,
          p.status,
          p.hospitalName,
          p.hospitalCode,
          p.departmentName,
          p.serviceName,
          p.serviceCode,
          p.jobTypeName,
          p.jobTypeCode,
          p.shiftType,
          p.shiftStart,
          p.shiftEnd,
          p.positionNumber,
          p.providerFirstName,
          p.providerLastName,
          p.providerEmployeeId,
          p.providerPhone,
          p.assignmentStatus,
          p.assignedAt,
        ]);
        const positionsSheet = XLSX.utils.aoa_to_sheet([
          positionHeaders,
          ...positionRows,
        ]);
        XLSX.utils.book_append_sheet(workbook, positionsSheet, "All Positions");

        // Download
        const fileName = `coverage_report_${new Date().toISOString().split("T")[0]}.xlsx`;
        XLSX.writeFile(workbook, fileName);
      } else if (exportType === "providers" && providersData) {
        // Summary Sheet
        const summaryData = [
          ["Providers Report Summary"],
          [""],
          ["Metric", "Value"],
          ["Total Providers", providersData.total],
          ["Active Providers", providersData.active],
          ["Currently Assigned", providersData.assigned],
          [""],
          ["Exported At", new Date().toISOString()],
        ];
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

        // Providers Sheet
        const providerHeaders = [
          "First Name",
          "Last Name",
          "Employee ID",
          "Email",
          "Phone",
          "Job Type",
          "Home Hospital",
          "Home Department",
          "Supervising MD",
          "Certification",
          "Experience",
          "Skills",
          "Active",
          "Current Assignment",
        ];
        const providerRows = providersData.providers.map((p: any) => [
          p.firstName,
          p.lastName,
          p.employeeId,
          p.email,
          p.phone,
          p.jobType,
          p.homeHospital,
          p.homeDepartment,
          p.supervisingMD,
          p.certification,
          p.experience,
          p.skills,
          p.isActive,
          p.currentAssignment,
        ]);
        const providersSheet = XLSX.utils.aoa_to_sheet([
          providerHeaders,
          ...providerRows,
        ]);
        XLSX.utils.book_append_sheet(workbook, providersSheet, "Providers");

        // Download
        const fileName = `providers_report_${new Date().toISOString().split("T")[0]}.xlsx`;
        XLSX.writeFile(workbook, fileName);
      }
    } catch (error) {
      console.error("Export failed:", error);
    }

    setIsExporting(false);
  };

  const isLoading =
    exportType === "coverage" ? !coverageData : !providersData;

  return (
    <div className="bg-slate-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">Export Data</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-2">
            Export Type
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="exportType"
                value="coverage"
                checked={exportType === "coverage"}
                onChange={() => setExportType("coverage")}
                className="text-emerald-500"
              />
              <span>Coverage Report</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="exportType"
                value="providers"
                checked={exportType === "providers"}
                onChange={() => setExportType("providers")}
                className="text-emerald-500"
              />
              <span>Providers Report</span>
            </label>
          </div>
        </div>

        <div className="text-sm text-slate-400">
          {exportType === "coverage" ? (
            <p>
              Export includes: Summary statistics, coverage by hospital,
              coverage by department, and detailed position list with provider
              assignments.
            </p>
          ) : (
            <p>
              Export includes: Provider summary and complete provider list with
              skills, assignments, and contact information.
            </p>
          )}
        </div>

        <button
          onClick={handleExport}
          disabled={isExporting || isLoading}
          className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isExporting ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
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
              Exporting...
            </>
          ) : isLoading ? (
            "Loading data..."
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Download Excel Report
            </>
          )}
        </button>
      </div>
    </div>
  );
}
