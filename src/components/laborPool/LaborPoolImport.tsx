"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface LaborPoolImportProps {
  departmentId: Id<"departments">;
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedRow {
  serviceName: string;
  serviceShortCode: string;
  roleCode: string;
  headcounts: {
    Weekday_AM?: number;
    Weekday_PM?: number;
    Weekend_AM?: number;
    Weekend_PM?: number;
  };
  capacities: {
    day?: number;
    night?: number;
    weekend?: number;
  };
  skills: string[];
  errors: string[];
  isNew: boolean;
}

export default function LaborPoolImport({ departmentId, isOpen, onClose }: LaborPoolImportProps) {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    servicesCreated: number;
    servicesUpdated: number;
    jobTypesAdded: number;
    jobTypesUpdated: number;
    errors: string[];
  } | null>(null);

  const exportData = useQuery(api.laborPool.getLaborPoolExportData, { departmentId });
  const bulkImport = useMutation(api.laborPool.bulkImportLaborPool);

  const availableRoleCodes = new Set(
    exportData?.availableRoles.map((r) => r.code.toUpperCase()) ?? []
  );
  const availableSkillNames = new Set(
    exportData?.availableSkills.map((s) => s.name.toUpperCase()) ?? []
  );
  const existingServiceNames = new Set(
    exportData?.rows.map((r) => r.serviceName.toUpperCase()) ?? []
  );

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
          const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { header: 1 });

          if (jsonData.length < 2) {
            toast.error("File appears to be empty or has no data rows");
            return;
          }

          // Parse headers to find shift type columns
          const headers = (jsonData[0] as string[]).map((h) => String(h || "").trim());
          const serviceColIdx = headers.findIndex((h) => h.toLowerCase().includes("service"));
          const shortCodeColIdx = headers.findIndex((h) => h.toLowerCase().includes("short") || h.toLowerCase().includes("code"));
          const roleColIdx = headers.findIndex((h) => h.toLowerCase().includes("role"));

          // Find shift columns
          const shiftColMap: Record<string, number> = {};
          headers.forEach((h, idx) => {
            const normalized = h.toLowerCase().replace(/\s+/g, "_");
            if (normalized.includes("weekday") && normalized.includes("am")) {
              shiftColMap["Weekday_AM"] = idx;
            } else if (normalized.includes("weekday") && normalized.includes("pm")) {
              shiftColMap["Weekday_PM"] = idx;
            } else if (normalized.includes("weekend") && normalized.includes("am")) {
              shiftColMap["Weekend_AM"] = idx;
            } else if (normalized.includes("weekend") && normalized.includes("pm")) {
              shiftColMap["Weekend_PM"] = idx;
            } else if (normalized.includes("wkday") && normalized.includes("am")) {
              shiftColMap["Weekday_AM"] = idx;
            } else if (normalized.includes("wkday") && normalized.includes("pm")) {
              shiftColMap["Weekday_PM"] = idx;
            } else if (normalized.includes("wkend") && normalized.includes("am")) {
              shiftColMap["Weekend_AM"] = idx;
            } else if (normalized.includes("wkend") && normalized.includes("pm")) {
              shiftColMap["Weekend_PM"] = idx;
            }
          });

          // Find capacity columns
          const dayCapColIdx = headers.findIndex((h) => h.toLowerCase().includes("day") && h.toLowerCase().includes("cap"));
          const nightCapColIdx = headers.findIndex((h) => h.toLowerCase().includes("night") && h.toLowerCase().includes("cap"));
          const weekendCapColIdx = headers.findIndex((h) => h.toLowerCase().includes("weekend") && h.toLowerCase().includes("cap"));

          // Find skills column
          const skillsColIdx = headers.findIndex((h) => h.toLowerCase().includes("skill"));

          // Parse data rows
          const rows: ParsedRow[] = [];
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i] as any[];
            if (!row || row.length === 0) continue;

            const serviceName = String(row[serviceColIdx] || "").trim();
            if (!serviceName) continue; // Skip empty rows

            const serviceShortCode = String(row[shortCodeColIdx >= 0 ? shortCodeColIdx : serviceColIdx] || serviceName.substring(0, 8)).trim().toUpperCase();
            const roleCode = String(row[roleColIdx] || "").trim().toUpperCase();

            const errors: string[] = [];

            // Validate role
            if (!roleCode) {
              errors.push("Missing role code");
            } else if (!availableRoleCodes.has(roleCode)) {
              errors.push(`Unknown role: ${roleCode}`);
            }

            // Parse headcounts
            const headcounts: ParsedRow["headcounts"] = {};
            for (const [shiftType, colIdx] of Object.entries(shiftColMap)) {
              const val = row[colIdx];
              if (val !== undefined && val !== null && val !== "") {
                const num = parseInt(String(val), 10);
                if (!isNaN(num) && num >= 0) {
                  headcounts[shiftType as keyof typeof headcounts] = num;
                }
              }
            }

            // Parse capacities
            const capacities: ParsedRow["capacities"] = {};
            if (dayCapColIdx >= 0 && row[dayCapColIdx]) {
              const val = parseInt(String(row[dayCapColIdx]), 10);
              if (!isNaN(val)) capacities.day = val;
            }
            if (nightCapColIdx >= 0 && row[nightCapColIdx]) {
              const val = parseInt(String(row[nightCapColIdx]), 10);
              if (!isNaN(val)) capacities.night = val;
            }
            if (weekendCapColIdx >= 0 && row[weekendCapColIdx]) {
              const val = parseInt(String(row[weekendCapColIdx]), 10);
              if (!isNaN(val)) capacities.weekend = val;
            }

            // Parse skills
            const skillsStr = skillsColIdx >= 0 ? String(row[skillsColIdx] || "") : "";
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

            const isNew = !existingServiceNames.has(serviceName.toUpperCase());

            rows.push({
              serviceName,
              serviceShortCode,
              roleCode,
              headcounts,
              capacities,
              skills,
              errors,
              isNew,
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
    [availableRoleCodes, availableSkillNames, existingServiceNames]
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

  const handleImport = async () => {
    const validRows = parsedRows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setIsImporting(true);
    try {
      const result = await bulkImport({
        departmentId,
        rows: validRows.map((r) => ({
          serviceName: r.serviceName,
          serviceShortCode: r.serviceShortCode,
          roleCode: r.roleCode,
          headcounts: r.headcounts,
          capacities: r.capacities,
          skills: r.skills,
        })),
      });

      setImportResult(result);
      setStep("result");
      toast.success("Import completed");
    } catch (error: any) {
      toast.error(error.message || "Import failed");
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
  const newServiceCount = new Set(
    parsedRows.filter((r) => r.isNew).map((r) => r.serviceName.toUpperCase())
  ).size;
  const updateServiceCount = new Set(
    parsedRows.filter((r) => !r.isNew).map((r) => r.serviceName.toUpperCase())
  ).size;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Import Labor Pool</h2>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {step === "upload" && (
            <div
              className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-slate-500 transition-colors cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <input
                id="file-input"
                type="file"
                accept=".xlsx,.xls"
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
              <p className="text-lg mb-2">Drop Excel file here or click to browse</p>
              <p className="text-sm text-slate-400">Supports .xlsx and .xls files</p>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-slate-700 rounded-lg p-4 grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-white">{parsedRows.length}</p>
                  <p className="text-sm text-slate-400">Total Rows</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-400">{validRowCount}</p>
                  <p className="text-sm text-slate-400">Valid</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-400">{errorRowCount}</p>
                  <p className="text-sm text-slate-400">Errors</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-400">
                    {newServiceCount} new / {updateServiceCount} update
                  </p>
                  <p className="text-sm text-slate-400">Services</p>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Service</th>
                      <th className="px-3 py-2 text-left">Role</th>
                      <th className="px-3 py-2 text-center">Wkday AM</th>
                      <th className="px-3 py-2 text-center">Wkday PM</th>
                      <th className="px-3 py-2 text-center">Wkend AM</th>
                      <th className="px-3 py-2 text-center">Wkend PM</th>
                      <th className="px-3 py-2 text-left">Skills</th>
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
                            : row.isNew
                            ? "bg-emerald-900/20"
                            : "bg-slate-800"
                        }
                      >
                        <td className="px-3 py-2">
                          {row.errors.length > 0 ? (
                            <span className="text-red-400">Error</span>
                          ) : row.isNew ? (
                            <span className="text-emerald-400">New</span>
                          ) : (
                            <span className="text-blue-400">Update</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{row.serviceName}</td>
                        <td className="px-3 py-2 font-mono">{row.roleCode}</td>
                        <td className="px-3 py-2 text-center">{row.headcounts.Weekday_AM ?? "-"}</td>
                        <td className="px-3 py-2 text-center">{row.headcounts.Weekday_PM ?? "-"}</td>
                        <td className="px-3 py-2 text-center">{row.headcounts.Weekend_AM ?? "-"}</td>
                        <td className="px-3 py-2 text-center">{row.headcounts.Weekend_PM ?? "-"}</td>
                        <td className="px-3 py-2 text-slate-400 text-xs max-w-[150px] truncate">
                          {row.skills.join(", ") || "-"}
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
                <p className="text-xl font-semibold text-emerald-400">Import Complete</p>
              </div>

              <div className="bg-slate-700 rounded-lg p-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-400">Services Created</p>
                  <p className="text-2xl font-bold">{importResult.servicesCreated}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Services Updated</p>
                  <p className="text-2xl font-bold">{importResult.servicesUpdated}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Job Types Added</p>
                  <p className="text-2xl font-bold">{importResult.jobTypesAdded}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Job Types Updated</p>
                  <p className="text-2xl font-bold">{importResult.jobTypesUpdated}</p>
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
