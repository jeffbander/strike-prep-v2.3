"use client";

import { useState, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ServiceImportProps {
  departmentId: Id<"departments">;
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedService {
  name: string;
  shortCode: string;
  serviceType?: string;
  admitCapacity?: number;
  feederSource?: string;
  linkedDownstreamServiceCode?: string;
  dayCapacity?: number;
  nightCapacity?: number;
  weekendCapacity?: number;
  dayShiftStart?: string;
  dayShiftEnd?: string;
  nightShiftStart?: string;
  nightShiftEnd?: string;
  operatesDays?: boolean;
  operatesNights?: boolean;
  operatesWeekends?: boolean;
  unitName?: string;
  jobTypes?: Array<{
    jobTypeCode: string;
    headcount: number;
    weekdayAmHeadcount?: number;
    weekdayPmHeadcount?: number;
    weekendAmHeadcount?: number;
    weekendPmHeadcount?: number;
  }>;
}

export default function ServiceImport({
  departmentId,
  isOpen,
  onClose,
}: ServiceImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedService[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bulkImport = useMutation(api.services.bulkImport);

  const parseCSV = (text: string): ParsedService[] => {
    const lines = text.split("\n").filter((line) => line.trim());
    if (lines.length < 2) {
      throw new Error("CSV must have header row and at least one data row");
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
    const services: ParsedService[] = [];

    // Map expected headers to indices
    const headerMap: Record<string, number> = {};
    headers.forEach((h, i) => {
      headerMap[h] = i;
    });

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0 || !values[0]) continue;

      const getValue = (key: string): string => {
        const idx = headerMap[key];
        return idx !== undefined ? (values[idx] || "").trim() : "";
      };

      const getNumber = (key: string): number | undefined => {
        const val = getValue(key);
        return val ? parseInt(val, 10) : undefined;
      };

      const getBool = (key: string): boolean | undefined => {
        const val = getValue(key).toLowerCase();
        if (val === "yes" || val === "true" || val === "1") return true;
        if (val === "no" || val === "false" || val === "0") return false;
        return undefined;
      };

      // Parse job types from serialized format: "NP:5|RN:3:AM=4:PM=2"
      const parseJobTypes = (jobTypesStr: string) => {
        if (!jobTypesStr) return undefined;

        return jobTypesStr.split("|").map((jtStr) => {
          const parts = jtStr.split(":");
          const jobTypeCode = parts[0];
          const headcount = parseInt(parts[1], 10) || 1;

          let weekdayAmHeadcount: number | undefined;
          let weekdayPmHeadcount: number | undefined;
          let weekendAmHeadcount: number | undefined;
          let weekendPmHeadcount: number | undefined;

          for (let j = 2; j < parts.length; j++) {
            const part = parts[j];
            if (part.startsWith("AM=")) {
              weekdayAmHeadcount = parseInt(part.substring(3), 10);
            } else if (part.startsWith("PM=")) {
              weekdayPmHeadcount = parseInt(part.substring(3), 10);
            } else if (part.startsWith("WE_AM=")) {
              weekendAmHeadcount = parseInt(part.substring(6), 10);
            } else if (part.startsWith("WE_PM=")) {
              weekendPmHeadcount = parseInt(part.substring(6), 10);
            }
          }

          return {
            jobTypeCode,
            headcount,
            weekdayAmHeadcount,
            weekdayPmHeadcount,
            weekendAmHeadcount,
            weekendPmHeadcount,
          };
        });
      };

      const service: ParsedService = {
        name: getValue("name"),
        shortCode: getValue("short code") || getValue("shortcode"),
        serviceType: getValue("service type") || getValue("servicetype") || undefined,
        admitCapacity: getNumber("admit capacity") || getNumber("admitcapacity"),
        feederSource: getValue("feeder source") || getValue("feedersource") || undefined,
        linkedDownstreamServiceCode:
          getValue("linked downstream service") ||
          getValue("linkeddownstreamservicecode") ||
          undefined,
        dayCapacity: getNumber("day capacity") || getNumber("daycapacity"),
        nightCapacity: getNumber("night capacity") || getNumber("nightcapacity"),
        weekendCapacity: getNumber("weekend capacity") || getNumber("weekendcapacity"),
        dayShiftStart: getValue("day shift start") || getValue("dayshiftstart") || undefined,
        dayShiftEnd: getValue("day shift end") || getValue("dayshiftend") || undefined,
        nightShiftStart: getValue("night shift start") || getValue("nightshiftstart") || undefined,
        nightShiftEnd: getValue("night shift end") || getValue("nightshiftend") || undefined,
        operatesDays: getBool("operates days") ?? getBool("operatesdays"),
        operatesNights: getBool("operates nights") ?? getBool("operatesnights"),
        operatesWeekends: getBool("operates weekends") ?? getBool("operatesweekends"),
        unitName: getValue("unit name") || getValue("unitname") || undefined,
        jobTypes: parseJobTypes(getValue("job types") || getValue("jobtypes")),
      };

      if (service.name && service.shortCode) {
        services.push(service);
      }
    }

    return services;
  };

  // Parse a single CSV line handling quoted values
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);

    return result;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setErrors([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseCSV(text);
        setPreview(parsed);

        if (parsed.length === 0) {
          setErrors(["No valid services found in CSV"]);
        }
      } catch (err: any) {
        setErrors([err.message]);
        setPreview([]);
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleImport = async () => {
    if (preview.length === 0) return;

    setIsImporting(true);
    try {
      const result = await bulkImport({
        departmentId,
        services: preview,
      });

      if (result.errors.length > 0) {
        setErrors(result.errors);
      }

      toast.success(
        `Import complete: ${result.created} created, ${result.updated} updated${
          result.errors.length > 0 ? `, ${result.errors.length} errors` : ""
        }`
      );

      if (result.errors.length === 0) {
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message);
      setErrors([err.message]);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview([]);
    setErrors([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl bg-slate-800 border-slate-700 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">Import Services from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Upload */}
          <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            {file ? (
              <div className="space-y-2">
                <p className="text-white font-medium">{file.name}</p>
                <p className="text-sm text-slate-400">{preview.length} services found</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
                >
                  Choose Different File
                </Button>
              </div>
            ) : (
              <div
                className="cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg
                  className="w-12 h-12 mx-auto text-slate-500 mb-4"
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
                <p className="text-slate-400">
                  Click to select a CSV file or drag and drop
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Required columns: Name, Short Code
                </p>
              </div>
            )}
          </div>

          {/* CSV Format Help */}
          <div className="bg-slate-900 rounded-lg p-4 text-sm">
            <p className="font-medium text-white mb-2">Expected CSV Columns:</p>
            <div className="text-slate-400 text-xs space-y-1">
              <p><strong>Required:</strong> Name, Short Code</p>
              <p><strong>Service Type:</strong> Service Type (admit|procedure|consult|remote), Admit Capacity, Feeder Source (er|procedure), Linked Downstream Service</p>
              <p><strong>Capacity:</strong> Day Capacity, Night Capacity, Weekend Capacity</p>
              <p><strong>Shifts:</strong> Day Shift Start, Day Shift End, Night Shift Start, Night Shift End</p>
              <p><strong>Operations:</strong> Operates Days (Yes/No), Operates Nights, Operates Weekends</p>
              <p><strong>Job Types:</strong> Format: "NP:5|RN:3:AM=4:PM=2" (Code:Headcount:ShiftOverrides)</p>
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4">
              <p className="font-medium text-red-400 mb-2">
                {errors.length} Error(s):
              </p>
              <ul className="text-sm text-red-300 list-disc list-inside max-h-32 overflow-y-auto">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div className="bg-slate-900 rounded-lg p-4">
              <p className="font-medium text-white mb-3">
                Preview ({preview.length} services):
              </p>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-slate-400 border-b border-slate-700">
                    <tr>
                      <th className="text-left py-2">Name</th>
                      <th className="text-left py-2">Code</th>
                      <th className="text-left py-2">Type</th>
                      <th className="text-left py-2">Job Types</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {preview.slice(0, 10).map((svc, i) => (
                      <tr key={i} className="border-b border-slate-800">
                        <td className="py-2">{svc.name}</td>
                        <td className="py-2 font-mono">{svc.shortCode}</td>
                        <td className="py-2">{svc.serviceType || "-"}</td>
                        <td className="py-2">
                          {svc.jobTypes?.map((jt) => jt.jobTypeCode).join(", ") || "-"}
                        </td>
                      </tr>
                    ))}
                    {preview.length > 10 && (
                      <tr>
                        <td colSpan={4} className="py-2 text-slate-500 text-center">
                          ...and {preview.length - 10} more
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={preview.length === 0 || isImporting}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600"
            >
              {isImporting ? "Importing..." : `Import ${preview.length} Services`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
