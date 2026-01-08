"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import {
  parseScheduleCSV,
  parseAmionFile,
  getServiceDetails,
  type ScheduleAssignmentRow,
  type AmionParseResult,
} from "@/lib/amionParser";

interface ScheduleImportModalProps {
  departmentId: Id<"departments">;
  healthSystemId: Id<"health_systems">;
  onClose: () => void;
}

type ImportStep = "upload" | "preview" | "schPreview" | "result";
type FileType = "csv" | "sch";

export default function ScheduleImportModal({
  departmentId,
  healthSystemId,
  onClose,
}: ScheduleImportModalProps) {
  const importSchedule = useMutation(api.amionSchedules.importSchedule);
  const seedRotationTypes = useMutation(api.rotationTypes.seedDefaults);
  const createRotationType = useMutation(api.rotationTypes.create);

  const [step, setStep] = useState<ImportStep>("upload");
  const [fileType, setFileType] = useState<FileType>("csv");
  const [parsedData, setParsedData] = useState<{
    assignments: ScheduleAssignmentRow[];
    errors: string[];
    rotationsFound: string[];
  } | null>(null);
  const [schData, setSchData] = useState<AmionParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    errors: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const isSch = file.name.toLowerCase().endsWith('.sch');
    setFileType(isSch ? "sch" : "csv");

    try {
      const content = await file.text();

      if (isSch) {
        // Parse AMion .sch file for rotation types and provider info only
        // Binary schedule data is not decoded - use CSV for schedule assignments
        const result = parseAmionFile(content);
        setSchData(result);
        setStep("schPreview");
        toast.info(`Found ${result.providers.length} providers and ${result.services.length} rotation types`);
      } else {
        // Parse CSV file
        const result = parseScheduleCSV(content);

        if (result.errors.length > 0 && result.assignments.length === 0) {
          toast.error(result.errors[0]);
          return;
        }

        setParsedData(result);
        setStep("preview");

        if (result.errors.length > 0) {
          toast.warning(`Parsed with ${result.errors.length} warnings`);
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to parse file: ${message}`);
    }
  };

  const handleImport = async () => {
    if (!parsedData) return;

    setIsImporting(true);

    try {
      // Calculate date range from assignments
      const dates = parsedData.assignments.map((a) => a.date).sort();
      const startDate = dates[0];
      const endDate = dates[dates.length - 1];

      const result = await importSchedule({
        departmentId,
        fileName,
        startDate,
        endDate,
        assignments: parsedData.assignments.map((a) => ({
          providerFirstName: a.providerFirstName || "",
          providerLastName: a.providerLastName || "",
          date: a.date,
          rotationName: a.rotation,
          notes: a.notes,
        })),
      });

      setImportResult({
        created: result.created,
        updated: result.updated,
        errors: result.errors,
      });
      setStep("result");

      toast.success(
        `Imported ${result.created} new, updated ${result.updated} existing assignments`
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Import failed: ${message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleSeedRotationTypes = async () => {
    try {
      await seedRotationTypes({ healthSystemId });
      toast.success("Default rotation types created");
    } catch {
      toast.error("Failed to create rotation types");
    }
  };

  // Summary stats
  const stats = parsedData
    ? {
        totalRows: parsedData.assignments.length,
        uniqueProviders: new Set(parsedData.assignments.map((a) => a.providerName))
          .size,
        uniqueDates: new Set(parsedData.assignments.map((a) => a.date)).size,
        uniqueRotations: parsedData.rotationsFound.length,
        dateRange:
          parsedData.assignments.length > 0
            ? {
                start: parsedData.assignments
                  .map((a) => a.date)
                  .sort()[0],
                end: parsedData.assignments
                  .map((a) => a.date)
                  .sort()
                  .pop(),
              }
            : null,
      }
    : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold">Import Schedule</h2>
              <p className="text-slate-400 text-sm mt-1">
                Upload a CSV file with provider schedules
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-xl"
            >
              &times;
            </button>
          </div>

          {/* Step indicators */}
          <div className="flex gap-2 mt-4">
            {["upload", "preview", "result"].map((s, i) => (
              <div key={s} className={`flex items-center ${i > 0 ? "ml-2" : ""}`}>
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
                  <svg
                    className="w-8 h-8 text-blue-400"
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
                </div>
                <h3 className="text-lg font-medium mb-2">Upload Schedule File</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Upload an AMion .sch file or a CSV with provider schedules
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.sch"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Select File (.sch or .csv)
                </button>
              </div>

              <div className="bg-slate-700/30 rounded-lg p-4">
                <h4 className="font-medium mb-2">Expected CSV Format:</h4>
                <div className="text-sm text-slate-400 space-y-2">
                  <p>Required columns:</p>
                  <ul className="list-disc list-inside ml-2">
                    <li>
                      <strong>Provider Name</strong> (or First Name + Last Name)
                    </li>
                    <li>
                      <strong>Date</strong> (MM/DD/YYYY or YYYY-MM-DD)
                    </li>
                    <li>
                      <strong>Rotation</strong> or <strong>Service</strong>
                    </li>
                  </ul>
                  <p className="mt-2">Optional columns:</p>
                  <ul className="list-disc list-inside ml-2">
                    <li>Notes / Comments</li>
                  </ul>
                </div>
                <div className="mt-4 p-3 bg-slate-800 rounded font-mono text-xs overflow-x-auto">
                  <div>Provider Name,Date,Rotation,Notes</div>
                  <div>John Smith,01/15/2025,ICU Attending,</div>
                  <div>Jane Doe,01/15/2025,Vac,On vacation</div>
                  <div>Bob Johnson,01/15/2025,Research,</div>
                </div>
              </div>

              <div className="text-center">
                <button
                  onClick={handleSeedRotationTypes}
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Don't have rotation types? Click to create defaults
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && parsedData && stats && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="font-medium mb-3">Import Summary</h3>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-blue-400">
                      {stats.totalRows}
                    </p>
                    <p className="text-sm text-slate-400">Assignments</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-400">
                      {stats.uniqueProviders}
                    </p>
                    <p className="text-sm text-slate-400">Providers</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-purple-400">
                      {stats.uniqueDates}
                    </p>
                    <p className="text-sm text-slate-400">Dates</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-400">
                      {stats.uniqueRotations}
                    </p>
                    <p className="text-sm text-slate-400">Rotations</p>
                  </div>
                </div>
                {stats.dateRange && (
                  <div className="mt-3 text-sm text-slate-400 text-center">
                    <strong>Date Range:</strong> {stats.dateRange.start} to{" "}
                    {stats.dateRange.end}
                  </div>
                )}
              </div>

              {/* Rotations Found */}
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="font-medium mb-3">Rotations Found</h3>
                <div className="flex flex-wrap gap-2">
                  {parsedData.rotationsFound.map((rotation) => (
                    <span
                      key={rotation}
                      className="px-3 py-1 bg-slate-600/50 rounded-full text-sm"
                    >
                      {rotation}
                    </span>
                  ))}
                </div>
              </div>

              {/* Parse Errors/Warnings */}
              {parsedData.errors.length > 0 && (
                <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4">
                  <h3 className="font-medium text-amber-400 mb-2">
                    Warnings ({parsedData.errors.length})
                  </h3>
                  <div className="max-h-32 overflow-y-auto text-sm text-amber-300">
                    {parsedData.errors.slice(0, 10).map((err, i) => (
                      <p key={i}>{err}</p>
                    ))}
                    {parsedData.errors.length > 10 && (
                      <p className="text-amber-400 mt-1">
                        ...and {parsedData.errors.length - 10} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Preview Table */}
              <div>
                <h3 className="font-medium mb-3">
                  Preview (first 20 rows)
                </h3>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-600">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-700 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left">Provider</th>
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-left">Rotation</th>
                        <th className="px-4 py-2 text-left">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {parsedData.assignments.slice(0, 20).map((row, i) => (
                        <tr key={i} className="hover:bg-slate-700/50">
                          <td className="px-4 py-2">{row.providerName}</td>
                          <td className="px-4 py-2">{row.date}</td>
                          <td className="px-4 py-2">{row.rotation}</td>
                          <td className="px-4 py-2 text-slate-400">
                            {row.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 2b: .sch File Preview */}
          {step === "schPreview" && schData && (
            <div className="space-y-6">
              {/* Info Banner */}
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                <h3 className="font-medium text-blue-400 mb-2">AMion File Detected</h3>
                <p className="text-sm text-blue-300">
                  The .sch file contains rotation type definitions. We can create rotation types
                  from this file. To import actual schedule assignments (who is assigned where on which day),
                  you'll need to export a CSV from AMion.
                </p>
              </div>

              {/* Summary */}
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="font-medium mb-3">File Summary</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-blue-400">
                      {schData.services.length}
                    </p>
                    <p className="text-sm text-slate-400">Rotation Types</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-400">
                      {schData.providers.length}
                    </p>
                    <p className="text-sm text-slate-400">Providers</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-purple-400">
                      {schData.amionServices.length}
                    </p>
                    <p className="text-sm text-slate-400">Services</p>
                  </div>
                </div>
                {schData.department && (
                  <div className="mt-3 text-sm text-slate-400 text-center">
                    <strong>Department:</strong> {schData.department}
                  </div>
                )}
              </div>

              {/* Rotation Types Found */}
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="font-medium mb-3">Rotation Types Found</h3>
                <p className="text-sm text-slate-400 mb-3">
                  These rotation types can be imported to help categorize provider schedules:
                </p>
                <div className="max-h-48 overflow-y-auto">
                  <div className="flex flex-wrap gap-2">
                    {schData.services.map((rotation) => {
                      const isVacation = rotation.toLowerCase().includes('vac') ||
                                        rotation.toLowerCase().includes('sick') ||
                                        rotation.toLowerCase().includes('pto');
                      const isCurtailable = rotation.toLowerCase().includes('research') ||
                                           rotation.toLowerCase().includes('elective') ||
                                           rotation.toLowerCase().includes('admin');
                      return (
                        <span
                          key={rotation}
                          className={`px-3 py-1 rounded-full text-sm ${
                            isVacation
                              ? "bg-red-600/30 text-red-300"
                              : isCurtailable
                                ? "bg-amber-600/30 text-amber-300"
                                : "bg-blue-600/30 text-blue-300"
                          }`}
                        >
                          {rotation}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Service Details */}
              {schData.amionServices.length > 0 && (
                <div>
                  <h3 className="font-medium mb-3">Service Details</h3>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-600">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-700 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left">Service Name</th>
                          <th className="px-4 py-2 text-left">Type</th>
                          <th className="px-4 py-2 text-left">Lines</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {getServiceDetails(schData).slice(0, 30).map((svc, i) => (
                          <tr key={i} className="hover:bg-slate-700/50">
                            <td className="px-4 py-2">{svc.name}</td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                svc.typeLabel === "vacation"
                                  ? "bg-red-600/30 text-red-300"
                                  : svc.typeLabel === "service"
                                    ? "bg-blue-600/30 text-blue-300"
                                    : "bg-slate-600/30 text-slate-300"
                              }`}>
                                {svc.typeLabel}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-slate-400">{svc.lins}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Next Steps */}
              <div className="bg-slate-700/30 rounded-lg p-4">
                <h4 className="font-medium mb-2">Next Steps:</h4>
                <ol className="text-sm text-slate-400 space-y-1 list-decimal list-inside">
                  <li>Click "Create Rotation Types" to import these rotation categories</li>
                  <li>Go to "Manage Rotations" to mark which rotations are curtailable</li>
                  <li>Export a schedule CSV from AMion with provider assignments</li>
                  <li>Import the CSV to populate the schedule grid</li>
                </ol>
              </div>
            </div>
          )}

          {/* Step 3: Result */}
          {step === "result" && importResult && (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg
                  className="w-10 h-10 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-2">Import Complete!</h3>
              <div className="flex justify-center gap-8 mt-6">
                <div>
                  <p className="text-3xl font-bold text-emerald-400">
                    {importResult.created}
                  </p>
                  <p className="text-slate-400">New Assignments</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-blue-400">
                    {importResult.updated}
                  </p>
                  <p className="text-slate-400">Updated</p>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="mt-6 bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-left max-h-32 overflow-y-auto max-w-md mx-auto">
                  <p className="text-red-400 font-medium mb-2">
                    {importResult.errors.length} Errors:
                  </p>
                  {importResult.errors.slice(0, 5).map((err, i) => (
                    <p key={i} className="text-sm text-red-300">
                      {err}
                    </p>
                  ))}
                  {importResult.errors.length > 5 && (
                    <p className="text-sm text-red-400 mt-1">
                      ...and {importResult.errors.length - 5} more
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex justify-between">
          <button
            onClick={step === "preview" || step === "schPreview" ? () => setStep("upload") : onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            {step === "result" ? "Close" : step === "preview" || step === "schPreview" ? "Back" : "Cancel"}
          </button>

          {step === "preview" && (
            <button
              onClick={handleImport}
              disabled={isImporting || !parsedData?.assignments.length}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
            >
              {isImporting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Importing...
                </>
              ) : (
                `Import ${parsedData?.assignments.length || 0} Assignments`
              )}
            </button>
          )}

          {step === "schPreview" && schData && (
            <button
              onClick={async () => {
                setIsImporting(true);
                try {
                  // Import rotation types from .sch file
                  let created = 0;
                  for (const rotation of schData.services) {
                    const isVacation = rotation.toLowerCase().includes('vac') ||
                                      rotation.toLowerCase().includes('sick') ||
                                      rotation.toLowerCase().includes('pto') ||
                                      rotation.toLowerCase().includes('loa');
                    const isCurtailable = rotation.toLowerCase().includes('research') ||
                                         rotation.toLowerCase().includes('elective') ||
                                         rotation.toLowerCase().includes('admin') ||
                                         rotation.toLowerCase().includes('education');
                    try {
                      await createRotationType({
                        healthSystemId,
                        name: rotation,
                        shortCode: rotation.substring(0, 5).toUpperCase().replace(/\s/g, ''),
                        category: isVacation ? 'vacation' : isCurtailable ? 'curtailable' : 'on_service',
                        isCurtailable,
                        color: isVacation ? '#EF4444' : isCurtailable ? '#F59E0B' : '#3B82F6',
                      });
                      created++;
                    } catch {
                      // Rotation type might already exist, skip
                    }
                  }
                  toast.success(`Created ${created} rotation types`);
                  onClose();
                } catch (error: unknown) {
                  const message = error instanceof Error ? error.message : "Unknown error";
                  toast.error(`Failed to create rotation types: ${message}`);
                } finally {
                  setIsImporting(false);
                }
              }}
              disabled={isImporting}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
            >
              {isImporting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Creating...
                </>
              ) : (
                `Create ${schData.services.length} Rotation Types`
              )}
            </button>
          )}

          {step === "result" && (
            <button
              onClick={onClose}
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
