"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import * as XLSX from "xlsx";

interface ProviderExportProps {
  healthSystemId?: Id<"health_systems">;
  hospitalId?: Id<"hospitals">;
  departmentId?: Id<"departments">;
  scopeName: string;
}

export default function ProviderExport({
  healthSystemId,
  hospitalId,
  departmentId,
  scopeName,
}: ProviderExportProps) {
  const exportData = useQuery(api.providers.getProviderExportData, {
    healthSystemId,
    hospitalId,
    departmentId,
  });

  const handleDownload = () => {
    if (!exportData) return;

    const workbook = XLSX.utils.book_new();

    // Sheet 1: Provider Data
    const headers = [
      "Role",
      "Last Name",
      "First Name",
      "Life # (Employee ID)",
      "Employee Cell #",
      "Email",
      "Current Schedule (days)",
      "Current Schedule [Time]",
      "Home Site",
      "Home Department",
      "Supervising MD/Collaborating MD",
      "Specialty Certification",
      "Previous Experience",
      "Has Visa",
      "Skills",
    ];

    const dataRows = exportData.rows.map((row) => [
      row.role,
      row.lastName,
      row.firstName,
      row.employeeId,
      row.cellPhone,
      row.email,
      row.currentScheduleDays,
      row.currentScheduleTime,
      row.homeSite,
      row.homeDepartment,
      row.supervisingPhysician,
      row.specialtyCertification,
      row.previousExperience,
      row.hasVisa,
      row.skills,
    ]);

    const providerSheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

    // Set column widths
    providerSheet["!cols"] = [
      { wch: 8 },   // Role
      { wch: 15 },  // Last Name
      { wch: 15 },  // First Name
      { wch: 15 },  // Employee ID
      { wch: 15 },  // Cell Phone
      { wch: 30 },  // Email
      { wch: 20 },  // Schedule Days
      { wch: 20 },  // Schedule Time
      { wch: 10 },  // Home Site
      { wch: 20 },  // Home Department
      { wch: 25 },  // Supervising MD
      { wch: 25 },  // Certification
      { wch: 25 },  // Experience
      { wch: 10 },  // Has Visa
      { wch: 40 },  // Skills
    ];

    XLSX.utils.book_append_sheet(workbook, providerSheet, "Providers");

    // Sheet 2: Reference (roles, hospitals, departments, skills)
    const rolesHeader = ["Available Roles", "Code"];
    const rolesData = exportData.availableRoles.map((r) => [r.name, r.code]);

    const hospitalsHeader = ["Available Hospitals (Home Site)", "Short Code"];
    const hospitalsData = exportData.availableHospitals.map((h) => [h.name, h.shortCode]);

    const skillsHeader = ["Available Skills", "Category"];
    const skillsData = exportData.availableSkills.map((s) => [s.name, s.category || ""]);

    // Combine with spacing
    const referenceData = [
      rolesHeader,
      ...rolesData,
      [],
      hospitalsHeader,
      ...hospitalsData,
      [],
      skillsHeader,
      ...skillsData,
    ];

    const referenceSheet = XLSX.utils.aoa_to_sheet(referenceData);
    referenceSheet["!cols"] = [{ wch: 35 }, { wch: 15 }];

    XLSX.utils.book_append_sheet(workbook, referenceSheet, "Reference");

    // Sheet 3: Departments by Hospital
    const deptsByHospital = new Map<string, string[]>();
    for (const dept of exportData.availableDepartments) {
      const existing = deptsByHospital.get(dept.hospitalShortCode) || [];
      existing.push(dept.name);
      deptsByHospital.set(dept.hospitalShortCode, existing);
    }

    const deptData: (string | undefined)[][] = [["Hospital", "Departments"]];
    for (const [hospital, depts] of deptsByHospital) {
      deptData.push([hospital, depts.join(", ")]);
    }

    const deptSheet = XLSX.utils.aoa_to_sheet(deptData);
    deptSheet["!cols"] = [{ wch: 15 }, { wch: 80 }];

    XLSX.utils.book_append_sheet(workbook, deptSheet, "Departments");

    // Generate filename with date
    const date = new Date().toISOString().split("T")[0];
    const filename = `Providers_${scopeName.replace(/[^a-zA-Z0-9]/g, "_")}_${date}.xlsx`;

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
      title={isEmpty ? "No providers to export" : "Download providers as Excel"}
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
      {isLoading ? "Loading..." : "Export Providers"}
    </button>
  );
}
