"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import {
  parseAmionFile,
  filterValidProviders,
  getParseStats,
  AMION_TO_JOBTYPE,
  AmionParseResult,
} from "@/lib/amionParser";

interface AmionImportProps {
  healthSystemId: Id<"health_systems">;
  isOpen: boolean;
  onClose: () => void;
}

type ImportStep = "upload" | "preview" | "mapping" | "result";

export default function AmionImport({
  healthSystemId,
  isOpen,
  onClose,
}: AmionImportProps) {
  const hospitals = useQuery(api.hospitals.list, {});
  const departments = useQuery(api.departments.list, {});
  const jobTypes = useQuery(api.jobTypes.list, { healthSystemId });

  const bulkImport = useMutation(api.providers.bulkImportFromAmion);

  const [step, setStep] = useState<ImportStep>("upload");
  const [parseResult, setParseResult] = useState<AmionParseResult | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const [roleMapping, setRoleMapping] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter departments by selected hospital
  const filteredDepartments = selectedHospitalId
    ? departments?.filter((d) => d.hospitalId === selectedHospitalId)
    : [];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const result = parseAmionFile(content);
      const validProviders = filterValidProviders(result.providers);

      // Pre-select all valid providers
      setSelectedProviders(new Set(validProviders.map((p) => p.name)));

      // Initialize role mapping from detected roles
      const initialMapping: Record<string, string> = {};
      const roles = new Set(validProviders.map((p) => p.roleLabel));
      roles.forEach((role) => {
        const suggestedCode = AMION_TO_JOBTYPE[role];
        const matchingJobType = jobTypes?.find((jt) => jt.code === suggestedCode);
        if (matchingJobType) {
          initialMapping[role] = matchingJobType._id;
        }
      });
      setRoleMapping(initialMapping);

      setParseResult(result);
      setStep("preview");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to parse file: ${message}`);
    }
  };

  const handleImport = async () => {
    if (!parseResult || !selectedDepartmentId) {
      toast.error("Please select a department first");
      return;
    }

    setIsImporting(true);

    try {
      const validProviders = filterValidProviders(parseResult.providers);
      const selectedList = validProviders.filter((p) => selectedProviders.has(p.name));

      // Map to provider format for AMion import
      const providersToImport = selectedList.map((p) => ({
        firstName: p.firstName,
        lastName: p.lastName,
        cellPhone: p.cellPhone || undefined,
        employeeId: p.abbreviation || undefined,
        jobTypeCode: AMION_TO_JOBTYPE[p.roleLabel] || "MD",
      }));

      const result = await bulkImport({
        departmentId: selectedDepartmentId as Id<"departments">,
        providers: providersToImport,
      });

      setImportResult(result);
      setStep("result");
      toast.success(`Imported ${result.created} new, updated ${result.updated} existing providers`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Import failed: ${message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setStep("upload");
    setParseResult(null);
    setSelectedProviders(new Set());
    setSelectedHospitalId("");
    setSelectedDepartmentId("");
    setRoleMapping({});
    setImportResult(null);
    onClose();
  };

  const toggleProvider = (name: string) => {
    const newSet = new Set(selectedProviders);
    if (newSet.has(name)) {
      newSet.delete(name);
    } else {
      newSet.add(name);
    }
    setSelectedProviders(newSet);
  };

  const selectAllProviders = () => {
    if (parseResult) {
      const valid = filterValidProviders(parseResult.providers);
      setSelectedProviders(new Set(valid.map((p) => p.name)));
    }
  };

  const clearSelection = () => {
    setSelectedProviders(new Set());
  };

  if (!isOpen) return null;

  const stats = parseResult ? getParseStats(parseResult) : null;
  const validProviders = parseResult ? filterValidProviders(parseResult.providers) : [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold">Import from AMion</h2>
              <p className="text-slate-400 text-sm mt-1">
                Upload an AMion .sch file to import providers
              </p>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-white text-xl">
              &times;
            </button>
          </div>

          {/* Step indicators */}
          <div className="flex gap-2 mt-4">
            {["upload", "preview", "result"].map((s, i) => (
              <div
                key={s}
                className={`flex items-center ${i > 0 ? "ml-2" : ""}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                    step === s
                      ? "bg-blue-600 text-white"
                      : ["upload", "preview", "result"].indexOf(step) > i
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {i + 1}
                </div>
                <span className="ml-2 text-sm text-slate-400 capitalize">{s}</span>
                {i < 2 && <div className="w-8 h-px bg-slate-600 ml-2" />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-6">
              <div className="bg-slate-700/50 rounded-lg p-6 text-center">
                <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium mb-2">Upload AMion Schedule File</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Select an AMion .sch file exported from the AMion admin panel
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".sch"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Select .sch File
                </button>
              </div>

              <div className="bg-slate-700/30 rounded-lg p-4">
                <h4 className="font-medium mb-2">How to export from AMion:</h4>
                <ol className="text-sm text-slate-400 space-y-1 list-decimal list-inside">
                  <li>Log into AMion admin (amion.com)</li>
                  <li>Go to Admin &rarr; Export / Backup</li>
                  <li>Download the .sch file</li>
                  <li>Upload it here</li>
                </ol>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && parseResult && stats && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="font-medium mb-3">File Summary</h3>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-blue-400">{stats.validProviders}</p>
                    <p className="text-sm text-slate-400">Providers</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-400">{stats.withCellPhone}</p>
                    <p className="text-sm text-slate-400">With Phone</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-purple-400">{Object.keys(stats.byRole).length}</p>
                    <p className="text-sm text-slate-400">Roles</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-400">{selectedProviders.size}</p>
                    <p className="text-sm text-slate-400">Selected</p>
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-400">
                  <strong>Department:</strong> {parseResult.department || "Not specified"}
                  {parseResult.lastUpdated && (
                    <span className="ml-4"><strong>Last Updated:</strong> {parseResult.lastUpdated}</span>
                  )}
                </div>
              </div>

              {/* Target Department Selection */}
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="font-medium mb-3">Import To</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Hospital</label>
                    <select
                      value={selectedHospitalId}
                      onChange={(e) => {
                        setSelectedHospitalId(e.target.value);
                        setSelectedDepartmentId("");
                      }}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Select Hospital...</option>
                      {hospitals?.map((h) => (
                        <option key={h._id} value={h._id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Department</label>
                    <select
                      value={selectedDepartmentId}
                      onChange={(e) => setSelectedDepartmentId(e.target.value)}
                      disabled={!selectedHospitalId}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500 disabled:opacity-50"
                    >
                      <option value="">Select Department...</option>
                      {filteredDepartments?.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Role Breakdown */}
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="font-medium mb-3">Roles Found</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.byRole).map(([role, count]) => (
                    <span
                      key={role}
                      className={`px-3 py-1 rounded-full text-sm ${
                        role === "Attending"
                          ? "bg-blue-600/30 text-blue-300"
                          : role === "Fellow"
                          ? "bg-purple-600/30 text-purple-300"
                          : role === "EP MD"
                          ? "bg-amber-600/30 text-amber-300"
                          : role === "NP"
                          ? "bg-emerald-600/30 text-emerald-300"
                          : "bg-slate-600/30 text-slate-300"
                      }`}
                    >
                      {role}: {count}
                    </span>
                  ))}
                </div>
              </div>

              {/* Provider List */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium">Providers ({selectedProviders.size} selected)</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllProviders}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      Select All
                    </button>
                    <button
                      onClick={clearSelection}
                      className="text-sm text-slate-400 hover:text-slate-300"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-600">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-700 sticky top-0">
                      <tr>
                        <th className="w-10 px-2 py-2"></th>
                        <th className="px-4 py-2 text-left">Name</th>
                        <th className="px-4 py-2 text-left">Role</th>
                        <th className="px-4 py-2 text-left">Cell Phone</th>
                        <th className="px-4 py-2 text-left">Abbr</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {validProviders.map((p) => (
                        <tr
                          key={p.name}
                          className={`hover:bg-slate-700/50 cursor-pointer ${
                            selectedProviders.has(p.name) ? "bg-blue-900/20" : ""
                          }`}
                          onClick={() => toggleProvider(p.name)}
                        >
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedProviders.has(p.name)}
                              onChange={() => toggleProvider(p.name)}
                              className="rounded border-slate-600"
                            />
                          </td>
                          <td className="px-4 py-2">
                            {p.firstName} {p.lastName}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${
                                p.roleLabel === "Attending"
                                  ? "bg-blue-600/30 text-blue-300"
                                  : p.roleLabel === "Fellow"
                                  ? "bg-purple-600/30 text-purple-300"
                                  : p.roleLabel === "EP MD"
                                  ? "bg-amber-600/30 text-amber-300"
                                  : "bg-slate-600/30 text-slate-300"
                              }`}
                            >
                              {p.roleLabel}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-400">
                            {p.cellPhone || "—"}
                          </td>
                          <td className="px-4 py-2 text-slate-500">{p.abbreviation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Result */}
          {step === "result" && importResult && (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-2">Import Complete!</h3>
              <div className="flex justify-center gap-8 mt-6">
                <div>
                  <p className="text-3xl font-bold text-emerald-400">{importResult.created}</p>
                  <p className="text-slate-400">New Providers</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-blue-400">{importResult.updated}</p>
                  <p className="text-slate-400">Updated</p>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="mt-6 bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-left max-h-32 overflow-y-auto">
                  <p className="text-red-400 font-medium mb-2">{importResult.errors.length} Errors:</p>
                  {importResult.errors.slice(0, 5).map((err, i) => (
                    <p key={i} className="text-sm text-red-300">{err}</p>
                  ))}
                  {importResult.errors.length > 5 && (
                    <p className="text-sm text-red-400 mt-1">...and {importResult.errors.length - 5} more</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex justify-between">
          <button
            onClick={step === "preview" ? () => setStep("upload") : handleClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            {step === "result" ? "Close" : step === "preview" ? "Back" : "Cancel"}
          </button>

          {step === "preview" && (
            <button
              onClick={handleImport}
              disabled={isImporting || selectedProviders.size === 0 || !selectedDepartmentId}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
            >
              {isImporting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Importing...
                </>
              ) : (
                `Import ${selectedProviders.size} Providers`
              )}
            </button>
          )}

          {step === "result" && (
            <button
              onClick={handleClose}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
