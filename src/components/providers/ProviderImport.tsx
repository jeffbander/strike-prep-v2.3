"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ProviderImportProps {
  healthSystemId: Id<"health_systems">;
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedRow {
  role: string;
  lastName: string;
  firstName: string;
  employeeId: string;
  cellPhone: string;
  email: string;
  currentScheduleDays: string;
  currentScheduleTime: string;
  homeSite: string;
  homeDepartment: string;
  supervisingPhysician: string;
  specialtyCertification: string;
  previousExperience: string;
  hasVisa: boolean;
  skills: string[];
  errors: string[];
  isUpdate: boolean; // True if email exists in system
}

export default function ProviderImport({
  healthSystemId,
  isOpen,
  onClose,
}: ProviderImportProps) {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    errors: string[];
  } | null>(null);

  const exportData = useQuery(api.providers.getProviderExportData, {
    healthSystemId,
  });
  const bulkUpsert = useMutation(api.providers.bulkUpsertProviders);

  // Build validation sets from reference data
  const availableRoleCodes = new Set(
    exportData?.availableRoles.map((r) => r.code.toUpperCase()) ?? []
  );
  const availableHospitalCodes = new Set(
    exportData?.availableHospitals.map((h) => h.shortCode.toUpperCase()) ?? []
  );
  const availableSkillNames = new Set(
    exportData?.availableSkills.map((s) => s.name.toUpperCase()) ?? []
  );
  const existingEmails = new Set(exportData?.existingEmails ?? []);

  const parseFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });

          // Read first sheet
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const jsonData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

          if (jsonData.length < 2) {
            toast.error("File appears to be empty or has no data rows");
            return;
          }

          // Flexible header matching (case-insensitive, pattern-based)
          const headers = (jsonData[0] || []).map((h: unknown) =>
            String(h || "")
              .trim()
              .toLowerCase()
          );

          const findCol = (patterns: string[]) =>
            headers.findIndex((h) => patterns.some((p) => h.includes(p)));

          const roleColIdx = findCol(["role"]);
          const lastNameColIdx = findCol(["last name", "lastname"]);
          const firstNameColIdx = findCol(["first name", "firstname"]);
          const employeeIdColIdx = findCol(["life", "employee id", "employeeid"]);
          const cellPhoneColIdx = findCol(["cell", "phone"]);
          const emailColIdx = findCol(["email"]);
          const scheduleDaysColIdx = findCol(["schedule", "days"]);
          const scheduleTimeColIdx = findCol(["schedule", "time"]);
          const homeSiteColIdx = findCol(["home site", "site"]);
          const homeDeptColIdx = findCol(["home department", "department"]);
          const supervisingColIdx = findCol(["supervis", "collaborat", "md"]);
          const certificationColIdx = findCol(["certific", "specialty"]);
          const experienceColIdx = findCol(["experience"]);
          const visaColIdx = findCol(["visa"]);
          const skillsColIdx = findCol(["skill"]);

          // Parse data rows
          const rows: ParsedRow[] = [];
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;

            const email = String(row[emailColIdx] || "")
              .trim()
              .toLowerCase();
            if (!email) continue; // Email is required, skip empty rows

            const errors: string[] = [];

            // Required fields
            const role = String(row[roleColIdx] || "")
              .trim()
              .toUpperCase();
            const lastName = String(row[lastNameColIdx] || "").trim();
            const firstName = String(row[firstNameColIdx] || "").trim();
            const cellPhone = String(row[cellPhoneColIdx] || "").trim();
            const homeSite = String(row[homeSiteColIdx] || "")
              .trim()
              .toUpperCase();
            const homeDepartment = String(row[homeDeptColIdx] || "").trim();

            // Validate required fields
            if (!role) {
              errors.push("Missing role");
            } else if (!availableRoleCodes.has(role)) {
              errors.push(`Unknown role: ${role}`);
            }

            if (!lastName) errors.push("Missing last name");
            if (!firstName) errors.push("Missing first name");
            if (!cellPhone) errors.push("Missing cell phone");

            if (!homeSite) {
              errors.push("Missing home site");
            } else if (!availableHospitalCodes.has(homeSite)) {
              errors.push(`Unknown home site: ${homeSite}`);
            }

            if (!homeDepartment) errors.push("Missing home department");

            // Parse visa field (Yes/No/true/false/1/0)
            const visaRaw = String(row[visaColIdx] || "")
              .trim()
              .toLowerCase();
            const hasVisa = ["yes", "true", "1", "y"].includes(visaRaw);

            // Parse skills (comma-separated)
            const skillsStr =
              skillsColIdx >= 0 ? String(row[skillsColIdx] || "") : "";
            const skills = skillsStr
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);

            // Validate skills
            for (const skill of skills) {
              if (!availableSkillNames.has(skill.toUpperCase())) {
                errors.push(`Unknown skill: ${skill}`);
              }
            }

            const isUpdate = existingEmails.has(email);

            rows.push({
              role,
              lastName,
              firstName,
              employeeId: String(row[employeeIdColIdx] || "").trim(),
              cellPhone,
              email,
              currentScheduleDays: String(row[scheduleDaysColIdx] || "").trim(),
              currentScheduleTime: String(row[scheduleTimeColIdx] || "").trim(),
              homeSite,
              homeDepartment,
              supervisingPhysician: String(row[supervisingColIdx] || "").trim(),
              specialtyCertification: String(
                row[certificationColIdx] || ""
              ).trim(),
              previousExperience: String(row[experienceColIdx] || "").trim(),
              hasVisa,
              skills,
              errors,
              isUpdate,
            });
          }

          if (rows.length === 0) {
            toast.error("No valid data rows found in file");
            return;
          }

          setParsedRows(rows);
          setStep("preview");
        } catch (err) {
          console.error("Error parsing file:", err);
          toast.error("Failed to parse Excel file");
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [availableRoleCodes, availableHospitalCodes, availableSkillNames, existingEmails]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      parseFile(file);
    }
  };

  const downloadSampleTemplate = () => {
    const roleCodesList =
      exportData?.availableRoles.map((r) => r.code).join(", ") ||
      "MD, NP, PA, RN, FEL, RES";
    const hospitalCodesList =
      exportData?.availableHospitals.map((h) => h.shortCode).join(", ") ||
      "MSH, MSM, etc.";
    const skillsList =
      exportData?.availableSkills
        .map((s) => s.name)
        .slice(0, 10)
        .join(", ") || "BLS, ACLS, etc.";

    const wb = XLSX.utils.book_new();

    // Instructions sheet
    const instructionsData = [
      ["PROVIDER IMPORT TEMPLATE - INSTRUCTIONS"],
      [""],
      ["HOW TO USE THIS TEMPLATE:"],
      ["1. Go to the 'Template' sheet (tab at bottom)"],
      ["2. Delete the example rows and add your own data"],
      ["3. Keep the header row exactly as-is"],
      ["4. Save as .xlsx and upload"],
      [""],
      ["COLUMN DESCRIPTIONS:"],
      [""],
      [
        "Role (REQUIRED)",
        `The provider's role code. Must match: ${roleCodesList}`,
      ],
      ["Last Name (REQUIRED)", "Provider's last name"],
      ["First Name (REQUIRED)", "Provider's first name"],
      [
        "Life # (Employee ID)",
        "Optional employee ID from your HR system",
      ],
      ["Employee Cell # (REQUIRED)", "Provider's cell phone number"],
      [
        "Email (REQUIRED)",
        "Provider's email - THIS IS THE UNIQUE KEY. Existing emails will UPDATE the provider.",
      ],
      [
        "Current Schedule (days)",
        "Optional: Days they normally work (e.g., 'Mon-Fri')",
      ],
      [
        "Current Schedule [Time]",
        "Optional: Hours they normally work (e.g., '7am-3pm')",
      ],
      [
        "Home Site (REQUIRED)",
        `Hospital short code. Must match: ${hospitalCodesList}`,
      ],
      [
        "Home Department (REQUIRED)",
        "Department name within the home site (e.g., 'Internal Medicine')",
      ],
      [
        "Supervising MD",
        "Optional: For APPs - supervising or collaborating physician",
      ],
      [
        "Specialty Certification",
        "Optional: For NP/PA - any specialty certifications",
      ],
      ["Previous Experience", "Optional: Relevant prior experience"],
      [
        "Has Visa (REQUIRED)",
        "Yes/No - Fellows with visas can ONLY moonlight at home hospital",
      ],
      [
        "Skills",
        `Optional: Comma-separated skills. Must match: ${skillsList}...`,
      ],
      [""],
      ["IMPORTANT - EMAIL IS THE UNIQUE KEY:"],
      [
        "- If the email already exists in the system, that provider will be UPDATED",
      ],
      ["- If the email is new, a new provider will be CREATED"],
      ["- This allows you to re-upload the same file to update information"],
      [""],
      ["VISA RESTRICTION:"],
      [
        "- Fellows with visas (Has Visa = Yes AND Role = FEL) can ONLY be matched to shifts at their home hospital",
      ],
      ["- They will NOT appear as matches for other hospitals"],
      [""],
      ["AVAILABLE ROLE CODES:"],
      [roleCodesList],
      [""],
      ["AVAILABLE HOSPITAL CODES:"],
      [hospitalCodesList],
      [""],
      ["AVAILABLE SKILLS:"],
      [exportData?.availableSkills.map((s) => s.name).join(", ") || "None configured"],
    ];
    const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsData);
    instructionsSheet["!cols"] = [{ wch: 30 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, instructionsSheet, "Instructions");

    // Template sheet with example data
    const templateData = [
      [
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
      ],
      [
        "MD",
        "Smith",
        "John",
        "12345",
        "555-123-4567",
        "john.smith@hospital.org",
        "Mon-Fri",
        "7am-5pm",
        "MSH",
        "Internal Medicine",
        "",
        "",
        "10 years hospitalist",
        "No",
        "BLS, ACLS",
      ],
      [
        "NP",
        "Johnson",
        "Sarah",
        "12346",
        "555-234-5678",
        "sarah.johnson@hospital.org",
        "Mon-Thu",
        "7am-7pm",
        "MSH",
        "Cardiology",
        "Dr. Williams",
        "ACNP",
        "5 years cardiac",
        "No",
        "BLS, ACLS",
      ],
      [
        "FEL",
        "Kim",
        "David",
        "12347",
        "555-345-6789",
        "david.kim@hospital.org",
        "Varies",
        "Varies",
        "MSM",
        "Gastroenterology",
        "",
        "",
        "PGY-4",
        "Yes",
        "BLS",
      ],
      [
        "PA",
        "Garcia",
        "Maria",
        "12348",
        "555-456-7890",
        "maria.garcia@hospital.org",
        "Tue-Sat",
        "3pm-11pm",
        "MSH",
        "Surgery",
        "Dr. Brown",
        "Surgical PA",
        "",
        "No",
        "BLS",
      ],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      [
        "^^ DELETE ABOVE EXAMPLES ^^",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      [
        "vv ADD YOUR DATA BELOW vv",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
    ];
    const templateSheet = XLSX.utils.aoa_to_sheet(templateData);
    templateSheet["!cols"] = [
      { wch: 8 }, // Role
      { wch: 15 }, // Last Name
      { wch: 15 }, // First Name
      { wch: 15 }, // Employee ID
      { wch: 15 }, // Cell Phone
      { wch: 30 }, // Email
      { wch: 20 }, // Schedule Days
      { wch: 20 }, // Schedule Time
      { wch: 10 }, // Home Site
      { wch: 20 }, // Home Department
      { wch: 25 }, // Supervising MD
      { wch: 20 }, // Certification
      { wch: 20 }, // Experience
      { wch: 10 }, // Has Visa
      { wch: 20 }, // Skills
    ];
    XLSX.utils.book_append_sheet(wb, templateSheet, "Template");

    // Departments reference sheet
    if (exportData?.availableDepartments) {
      const deptsByHospital = new Map<string, string[]>();
      for (const dept of exportData.availableDepartments) {
        const existing = deptsByHospital.get(dept.hospitalShortCode) || [];
        existing.push(dept.name);
        deptsByHospital.set(dept.hospitalShortCode, existing);
      }

      const deptData: string[][] = [["Hospital", "Available Departments"]];
      for (const [hospital, depts] of deptsByHospital) {
        deptData.push([hospital, depts.join(", ")]);
      }

      const deptSheet = XLSX.utils.aoa_to_sheet(deptData);
      deptSheet["!cols"] = [{ wch: 15 }, { wch: 100 }];
      XLSX.utils.book_append_sheet(wb, deptSheet, "Departments Reference");
    }

    XLSX.writeFile(wb, "provider_import_template.xlsx");
  };

  const handleImport = async () => {
    const validRows = parsedRows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setIsImporting(true);
    try {
      const result = await bulkUpsert({
        healthSystemId,
        rows: validRows.map((r) => ({
          role: r.role,
          lastName: r.lastName,
          firstName: r.firstName,
          employeeId: r.employeeId || undefined,
          cellPhone: r.cellPhone,
          email: r.email,
          currentScheduleDays: r.currentScheduleDays || undefined,
          currentScheduleTime: r.currentScheduleTime || undefined,
          homeSite: r.homeSite,
          homeDepartment: r.homeDepartment,
          supervisingPhysician: r.supervisingPhysician || undefined,
          specialtyCertification: r.specialtyCertification || undefined,
          previousExperience: r.previousExperience || undefined,
          hasVisa: r.hasVisa,
          skills: r.skills,
        })),
      });

      setImportResult(result);
      setStep("result");
      toast.success("Import completed");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Import failed";
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setParsedRows([]);
    setStep("upload");
    setImportResult(null);
    onClose();
  };

  if (!isOpen) return null;

  const validRowCount = parsedRows.filter((r) => r.errors.length === 0).length;
  const errorRowCount = parsedRows.filter((r) => r.errors.length > 0).length;
  const newProviderCount = parsedRows.filter(
    (r) => !r.isUpdate && r.errors.length === 0
  ).length;
  const updateProviderCount = parsedRows.filter(
    (r) => r.isUpdate && r.errors.length === 0
  ).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Import Providers</h2>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {step === "upload" && (
            <div className="space-y-6">
              {/* Instructions Section */}
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  How to Import Providers
                </h3>
                <ol className="text-sm text-slate-300 space-y-2 ml-7 list-decimal">
                  <li>
                    <strong>Download the template</strong> - Click the button
                    below to get a pre-formatted Excel file with instructions
                  </li>
                  <li>
                    <strong>Fill in your data</strong> - Open the
                    &quot;Template&quot; sheet, delete the example rows, and add
                    your providers
                  </li>
                  <li>
                    <strong>Upload</strong> - Drag and drop your file below or
                    click to browse
                  </li>
                  <li>
                    <strong>Review &amp; Import</strong> - Check the preview for
                    errors, then confirm the import
                  </li>
                </ol>

                <div className="mt-4 pt-4 border-t border-slate-600">
                  <p className="text-xs text-slate-400 mb-2">
                    <strong>Email is the unique key:</strong> If a provider with
                    the same email already exists, their record will be UPDATED.
                    New emails will CREATE new providers.
                  </p>
                  <p className="text-xs text-amber-400/80 mb-3">
                    <strong>Visa Restriction:</strong> Fellows with visas (Has
                    Visa = Yes) can only be matched to shifts at their home
                    hospital.
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadSampleTemplate();
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-colors flex items-center gap-2"
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
                    Download Template with Instructions
                  </button>
                </div>
              </div>

              {/* File Drop Zone */}
              <div
                className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-emerald-500 hover:bg-slate-700/30 transition-colors cursor-pointer"
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => document.getElementById("provider-file-input")?.click()}
              >
                <input
                  id="provider-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <svg
                  className="w-12 h-12 mx-auto mb-4 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-lg mb-2">
                  Drop your completed Excel file here
                </p>
                <p className="text-sm text-slate-400">
                  or click to browse - Supports .xlsx, .xls, and .csv files
                </p>
              </div>

              {/* Quick Reference */}
              <div className="bg-slate-700/30 rounded-lg p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-2">
                  Required Columns:
                </h4>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
                    Role
                  </span>
                  <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
                    Last Name
                  </span>
                  <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
                    First Name
                  </span>
                  <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
                    Cell #
                  </span>
                  <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
                    Email
                  </span>
                  <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
                    Home Site
                  </span>
                  <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
                    Home Dept
                  </span>
                  <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
                    Has Visa
                  </span>
                </div>
                {exportData?.availableRoles &&
                  exportData.availableRoles.length > 0 && (
                    <p className="text-xs text-slate-400 mt-3">
                      <strong>Available Roles:</strong>{" "}
                      {exportData.availableRoles.map((r) => r.code).join(", ")}
                    </p>
                  )}
                {exportData?.availableHospitals &&
                  exportData.availableHospitals.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                      <strong>Available Sites:</strong>{" "}
                      {exportData.availableHospitals
                        .map((h) => h.shortCode)
                        .join(", ")}
                    </p>
                  )}
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-slate-700 rounded-lg p-4 grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-white">
                    {parsedRows.length}
                  </p>
                  <p className="text-sm text-slate-400">Total Rows</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-400">
                    {validRowCount}
                  </p>
                  <p className="text-sm text-slate-400">Valid</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-400">
                    {errorRowCount}
                  </p>
                  <p className="text-sm text-slate-400">Errors</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-400">
                    {newProviderCount} new / {updateProviderCount} update
                  </p>
                  <p className="text-sm text-slate-400">Providers</p>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Role</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Email</th>
                      <th className="px-3 py-2 text-left">Cell</th>
                      <th className="px-3 py-2 text-left">Home Site</th>
                      <th className="px-3 py-2 text-left">Department</th>
                      <th className="px-3 py-2 text-center">Visa</th>
                      <th className="px-3 py-2 text-left">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={
                          row.errors.length > 0
                            ? "bg-red-900/20"
                            : row.isUpdate
                            ? "bg-blue-900/20"
                            : "bg-emerald-900/20"
                        }
                      >
                        <td className="px-3 py-2">
                          {row.errors.length > 0 ? (
                            <span className="text-red-400">Error</span>
                          ) : row.isUpdate ? (
                            <span className="text-blue-400">Update</span>
                          ) : (
                            <span className="text-emerald-400">New</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono">{row.role}</td>
                        <td className="px-3 py-2">
                          {row.lastName}, {row.firstName}
                        </td>
                        <td className="px-3 py-2 text-slate-400 text-xs">
                          {row.email}
                        </td>
                        <td className="px-3 py-2 text-slate-400 text-xs">
                          {row.cellPhone}
                        </td>
                        <td className="px-3 py-2 font-mono">{row.homeSite}</td>
                        <td className="px-3 py-2 text-xs max-w-[120px] truncate">
                          {row.homeDepartment}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.hasVisa ? (
                            <span className="text-amber-400">Yes</span>
                          ) : (
                            <span className="text-slate-500">No</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-red-400 text-xs max-w-[200px]">
                          {row.errors.join("; ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === "result" && importResult && (
            <div className="space-y-4">
              <div className="bg-emerald-900/30 border border-emerald-700 rounded-lg p-4 text-center">
                <svg
                  className="w-12 h-12 mx-auto mb-2 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-xl font-semibold text-emerald-400">
                  Import Complete
                </p>
              </div>

              <div className="bg-slate-700 rounded-lg p-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-400">Providers Created</p>
                  <p className="text-2xl font-bold">{importResult.created}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Providers Updated</p>
                  <p className="text-2xl font-bold">{importResult.updated}</p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
                  <p className="font-semibold text-red-400 mb-2">
                    {importResult.errors.length} Errors:
                  </p>
                  <ul className="text-sm text-red-300 space-y-1 max-h-40 overflow-auto">
                    {importResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex justify-end gap-3">
          {step === "upload" && (
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}

          {step === "preview" && (
            <>
              <button
                onClick={() => {
                  setParsedRows([]);
                  setStep("upload");
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={isImporting || validRowCount === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {isImporting ? "Importing..." : `Import ${validRowCount} Rows`}
              </button>
            </>
          )}

          {step === "result" && (
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
