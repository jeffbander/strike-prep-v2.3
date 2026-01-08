"use client";

import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import {
  parseCensusExcel,
  getParseStats,
  CensusParseResult,
  CensusPatient,
} from "@/lib/censusParser";

interface CensusImportProps {
  hospitalId: Id<"hospitals">;
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

type Step = "upload" | "preview" | "importing" | "result";

export default function CensusImport({
  hospitalId,
  isOpen,
  onClose,
  onImportComplete,
}: CensusImportProps) {
  const [step, setStep] = useState<Step>("upload");
  const [parseResult, setParseResult] = useState<CensusParseResult | null>(null);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    errors: string[];
  } | null>(null);

  const createImport = useMutation(api.census.createImport);
  const upsertPatients = useMutation(api.census.upsertPatients);

  const handleFileSelect = useCallback(async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const result = parseCensusExcel(data);

      if (result.totalPatients === 0) {
        toast.error("No patients found in the file");
        return;
      }

      setParseResult(result);
      setStep("preview");
    } catch (error) {
      toast.error(`Failed to parse file: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleImport = async () => {
    if (!parseResult) return;

    setStep("importing");

    try {
      // Create import record
      const importId = await createImport({
        hospitalId,
        fileName: "census_import.xlsx",
        uploadDate: parseResult.censusDate,
      });

      // Flatten all patients from all sheets
      const allPatients: Array<{
        mrn: string;
        patientName: string;
        unitName: string;
        admissionDate: string;
        censusDate: string;
        service?: string;
        losDays?: number;
        attendingDoctor?: string;
        primaryDiagnosis?: string;
        clinicalStatus?: string;
        dispositionConsiderations?: string;
        pendingProcedures?: string;
        projectedDischargeDays?: number;
      }> = [];

      for (const sheet of parseResult.sheets) {
        for (const patient of sheet.patients) {
          allPatients.push({
            mrn: patient.mrn,
            patientName: patient.patientName,
            unitName: patient.unitName,
            admissionDate: patient.admissionDate,
            censusDate: parseResult.censusDate,
            service: patient.service,
            losDays: patient.losDays,
            attendingDoctor: patient.attendingDoctor,
            primaryDiagnosis: patient.primaryDiagnosis,
            clinicalStatus: patient.clinicalStatus,
            dispositionConsiderations: patient.dispositionConsiderations,
            pendingProcedures: patient.pendingProcedures,
            projectedDischargeDays: patient.projectedDischargeDays,
          });
        }
      }

      // Batch upsert patients (100 at a time)
      const batchSize = 100;
      let totalCreated = 0;
      let totalUpdated = 0;
      const allErrors: string[] = [];

      for (let i = 0; i < allPatients.length; i += batchSize) {
        const batch = allPatients.slice(i, i + batchSize);
        const result = await upsertPatients({
          importId,
          patients: batch,
        });

        totalCreated += result.created;
        totalUpdated += result.updated;
        allErrors.push(...result.errors);
      }

      setImportResult({
        created: totalCreated,
        updated: totalUpdated,
        errors: [...parseResult.errors, ...allErrors],
      });

      setStep("result");

      if (totalCreated + totalUpdated > 0) {
        toast.success(`Imported ${totalCreated + totalUpdated} patients`);
        onImportComplete?.();
      }
    } catch (error) {
      toast.error(`Import failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      setStep("preview");
    }
  };

  const handleClose = () => {
    setStep("upload");
    setParseResult(null);
    setImportResult(null);
    onClose();
  };

  if (!isOpen) return null;

  const stats = parseResult ? getParseStats(parseResult) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Import Census Data</h2>
            <p className="text-sm text-slate-400 mt-1">
              {step === "upload" && "Upload an Excel file with patient census data"}
              {step === "preview" && "Review parsed data before importing"}
              {step === "importing" && "Importing patients..."}
              {step === "result" && "Import complete"}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Upload Step */}
          {step === "upload" && (
            <div
              className="border-2 border-dashed border-slate-600 rounded-lg p-12 text-center hover:border-emerald-500 transition-colors cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById("census-file-input")?.click()}
            >
              <svg className="w-12 h-12 text-slate-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-slate-300 mb-2">
                Drag and drop your Excel file here, or click to browse
              </p>
              <p className="text-slate-500 text-sm">
                Supports .xlsx and .xls files with multiple unit sheets
              </p>
              <input
                id="census-file-input"
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          )}

          {/* Preview Step */}
          {step === "preview" && parseResult && stats && (
            <div className="space-y-6">
              {/* Stats Summary */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-slate-700 rounded-lg p-4">
                  <p className="text-slate-400 text-sm">Total Patients</p>
                  <p className="text-2xl font-bold text-white">{stats.totalPatients}</p>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <p className="text-slate-400 text-sm">ICU Patients</p>
                  <p className="text-2xl font-bold text-red-400">{stats.icuPatients}</p>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <p className="text-slate-400 text-sm">Floor Patients</p>
                  <p className="text-2xl font-bold text-blue-400">{stats.floorPatients}</p>
                </div>
                <div className="bg-slate-700 rounded-lg p-4">
                  <p className="text-slate-400 text-sm">Units/Sheets</p>
                  <p className="text-2xl font-bold text-white">{stats.totalSheets}</p>
                </div>
              </div>

              {/* Data Type Indicator */}
              <div className={`rounded-lg p-4 ${stats.hasStructuredData ? "bg-emerald-900/30 border border-emerald-700" : "bg-amber-900/30 border border-amber-700"}`}>
                <p className={`font-medium ${stats.hasStructuredData ? "text-emerald-400" : "text-amber-400"}`}>
                  {stats.hasStructuredData ? "Structured Data Detected" : "Basic Data - AI Processing Available"}
                </p>
                <p className="text-slate-300 text-sm mt-1">
                  {stats.hasStructuredData
                    ? "This file contains pre-populated predictions. Data will be imported as-is."
                    : "This file contains basic patient data. You can run AI predictions after import."}
                </p>
              </div>

              {/* Errors */}
              {parseResult.errors.length > 0 && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
                  <p className="text-red-400 font-medium mb-2">
                    {parseResult.errors.length} Parse Warnings
                  </p>
                  <ul className="text-sm text-slate-300 space-y-1 max-h-32 overflow-y-auto">
                    {parseResult.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sheet Breakdown */}
              <div>
                <h3 className="text-white font-medium mb-3">Units Found</h3>
                <div className="bg-slate-900 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-800">
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Sheet Name</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Type</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase">Patients</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {parseResult.sheets.map((sheet) => (
                        <tr key={sheet.name} className="hover:bg-slate-800/50">
                          <td className="px-4 py-2 text-white">{sheet.name}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              sheet.unitType === "icu"
                                ? "bg-red-900/50 text-red-300"
                                : "bg-blue-900/50 text-blue-300"
                            }`}>
                              {sheet.unitType.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-slate-300">{sheet.patients.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sample Data */}
              <div>
                <h3 className="text-white font-medium mb-3">Sample Patients (First 5)</h3>
                <div className="bg-slate-900 rounded-lg overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-800">
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Initials</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">MRN</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Unit</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Admit Date</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-slate-400 uppercase">Projected Days</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {parseResult.sheets
                        .flatMap((s) => s.patients)
                        .slice(0, 5)
                        .map((patient, i) => (
                          <tr key={i} className="hover:bg-slate-800/50">
                            <td className="px-4 py-2 text-white font-medium">{patient.initials}</td>
                            <td className="px-4 py-2 text-slate-300 font-mono text-sm">{patient.mrn}</td>
                            <td className="px-4 py-2 text-slate-300">{patient.unitName}</td>
                            <td className="px-4 py-2 text-slate-300">{patient.admissionDate}</td>
                            <td className="px-4 py-2 text-right text-slate-300">
                              {patient.projectedDischargeDays ?? "-"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Importing Step */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-white">Importing patients...</p>
              <p className="text-slate-400 text-sm mt-1">This may take a moment</p>
            </div>
          )}

          {/* Result Step */}
          {step === "result" && importResult && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Import Complete</h3>
                <p className="text-slate-400">
                  {importResult.created} new patients, {importResult.updated} updated
                </p>
              </div>

              {importResult.errors.length > 0 && (
                <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4">
                  <p className="text-amber-400 font-medium mb-2">
                    {importResult.errors.length} Warnings
                  </p>
                  <ul className="text-sm text-slate-300 space-y-1 max-h-32 overflow-y-auto">
                    {importResult.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
          {step === "upload" && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
          )}

          {step === "preview" && (
            <>
              <button
                onClick={() => {
                  setStep("upload");
                  setParseResult(null);
                }}
                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={!parseResult || parseResult.totalPatients === 0}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import {parseResult?.totalPatients} Patients
              </button>
            </>
          )}

          {step === "result" && (
            <button
              onClick={handleClose}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
