"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { AmionScheduleGrid } from "@/components/amion/AmionScheduleGrid";
import { parseAmionFile, getParseStats, getScheduleDates } from "@/lib/amionParser";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AmionSchedulePage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const healthSystems = useQuery(api.healthSystems.list, {});

  const [selectedHealthSystemId, setSelectedHealthSystemId] = useState<string>("");
  const [selectedImportId, setSelectedImportId] = useState<Id<"amion_imports"> | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [parsePreview, setParsePreview] = useState<{
    department: string;
    startDate: string;
    endDate: string;
    servicesCount: number;
    assignmentsCount: number;
    parsedData: ReturnType<typeof parseAmionFile>;
    fileName: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importSchedule = useMutation(api.amionSchedules.importAmionSchedule);
  const deleteImport = useMutation(api.amionSchedules.deleteImport);

  const isSuperAdmin = currentUser?.role === "super_admin";
  const needsHealthSystemSelection = isSuperAdmin && !currentUser?.healthSystemId;

  const effectiveHealthSystemId = (
    currentUser?.healthSystemId || selectedHealthSystemId
  ) as Id<"health_systems"> | undefined;

  const imports = useQuery(
    api.amionSchedules.listImports,
    effectiveHealthSystemId ? { healthSystemId: effectiveHealthSystemId } : "skip"
  );

  const importStats = useQuery(
    api.amionSchedules.getImportStats,
    selectedImportId ? { importId: selectedImportId } : "skip"
  );

  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const parsed = parseAmionFile(content);
      const stats = getParseStats(parsed);
      const dates = getScheduleDates(parsed);

      setParsePreview({
        department: parsed.department,
        startDate: dates[0] || parsed.scheduleStartDate,
        endDate: dates[dates.length - 1] || parsed.scheduleStartDate,
        servicesCount: stats.servicesCount,
        assignmentsCount: stats.assignmentsCount,
        parsedData: parsed,
        fileName: file.name,
      });
    } catch (error) {
      console.error("Parse error:", error);
      toast.error("Failed to parse .sch file");
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Import the parsed schedule
  const handleImport = async () => {
    if (!parsePreview || !effectiveHealthSystemId) return;

    setIsUploading(true);
    try {
      const { parsedData, fileName, startDate, endDate } = parsePreview;

      // Prepare services for import
      const services = parsedData.amionServices.map((s) => ({
        name: s.name,
        amionId: s.id,
        shiftDisplay: s.shiftDisplay,
      }));

      // Prepare assignments for import
      const assignments = parsedData.assignments.map((a) => ({
        serviceName: a.serviceName,
        serviceAmionId: a.serviceId,
        providerName: a.providerName,
        providerAmionId: a.providerId,
        date: a.date,
      }));

      const result = await importSchedule({
        healthSystemId: effectiveHealthSystemId,
        department: parsedData.department,
        startDate,
        endDate,
        sourceFileName: fileName,
        services,
        assignments,
      });

      toast.success(
        `Imported ${result.servicesCreated} services and ${result.assignmentsCreated} assignments`
      );
      setParsePreview(null);
      setSelectedImportId(result.importId);
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import schedule");
    } finally {
      setIsUploading(false);
    }
  };

  // Delete an import
  const handleDeleteImport = async (importId: Id<"amion_imports">) => {
    if (!confirm("Are you sure you want to delete this import?")) return;

    try {
      await deleteImport({ importId });
      toast.success("Import deleted");
      if (selectedImportId === importId) {
        setSelectedImportId(null);
      }
    } catch (error) {
      toast.error("Failed to delete import");
    }
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Amion Schedule</h1>
          <p className="text-gray-500">
            Import and view Amion schedules for strike redeployment planning
          </p>
        </div>
      </div>

      {/* Health System Selection (for super admins) */}
      {needsHealthSystemSelection && (
        <Card className="p-4">
          <label className="block text-sm font-medium mb-2">
            Select Health System
          </label>
          <Select
            value={selectedHealthSystemId}
            onValueChange={setSelectedHealthSystemId}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select health system..." />
            </SelectTrigger>
            <SelectContent>
              {healthSystems?.map((hs) => (
                <SelectItem key={hs._id} value={hs._id}>
                  {hs.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>
      )}

      {effectiveHealthSystemId && (
        <>
          {/* Upload Section */}
          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-4">Import Amion Schedule</h2>

            {!parsePreview ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  Upload an Amion .sch file to import the schedule. The parser
                  will extract services and daily assignments.
                </p>
                <div className="flex items-center gap-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".sch"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button onClick={() => fileInputRef.current?.click()}>
                    Select .sch File
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium mb-2">Preview: {parsePreview.fileName}</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Department:</span>{" "}
                      {parsePreview.department}
                    </div>
                    <div>
                      <span className="text-gray-500">Date Range:</span>{" "}
                      {formatDate(parsePreview.startDate)} -{" "}
                      {formatDate(parsePreview.endDate)}
                    </div>
                    <div>
                      <span className="text-gray-500">Services:</span>{" "}
                      {parsePreview.servicesCount}
                    </div>
                    <div>
                      <span className="text-gray-500">Assignments:</span>{" "}
                      {parsePreview.assignmentsCount}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleImport} disabled={isUploading}>
                    {isUploading ? "Importing..." : "Import Schedule"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setParsePreview(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Previous Imports */}
          {imports && imports.length > 0 && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-4">Previous Imports</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead>Date Range</TableHead>
                    <TableHead>Imported</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {imports.map((imp) => (
                    <TableRow
                      key={imp._id}
                      className={
                        selectedImportId === imp._id ? "bg-blue-50" : ""
                      }
                    >
                      <TableCell className="font-medium">
                        {imp.department}
                      </TableCell>
                      <TableCell>
                        {formatDate(imp.startDate)} - {formatDate(imp.endDate)}
                      </TableCell>
                      <TableCell>
                        {new Date(imp.importedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{imp.importerName}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant={
                              selectedImportId === imp._id
                                ? "default"
                                : "outline"
                            }
                            onClick={() => setSelectedImportId(imp._id)}
                          >
                            {selectedImportId === imp._id ? "Selected" : "View"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleDeleteImport(imp._id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Selected Import Stats */}
          {selectedImportId && importStats && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Schedule Overview</h2>
                <div className="flex gap-2">
                  <Badge className="bg-green-600 text-white">
                    {importStats.byStatus.redeployable} Redeployable
                  </Badge>
                  <Badge className="bg-red-600 text-white">
                    {importStats.byStatus.essential} Essential
                  </Badge>
                  <Badge variant="outline">
                    {importStats.byStatus.unclassified} Unclassified
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 text-sm mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {importStats.totalServices}
                  </div>
                  <div className="text-gray-500">Services</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {importStats.totalAssignments}
                  </div>
                  <div className="text-gray-500">Assignments</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {importStats.uniqueProviders}
                  </div>
                  <div className="text-gray-500">Unique Providers</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {importStats.dateRange
                      ? Math.ceil(
                          (new Date(importStats.dateRange.end).getTime() -
                            new Date(importStats.dateRange.start).getTime()) /
                            (1000 * 60 * 60 * 24)
                        ) + 1
                      : 0}
                  </div>
                  <div className="text-gray-500">Days</div>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                Click on a service status badge in the grid below to toggle
                between Redeployable / Essential / Unclassified
              </p>
            </Card>
          )}

          {/* Schedule Grid */}
          {selectedImportId && (
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-4">Schedule Grid</h2>
              <AmionScheduleGrid importId={selectedImportId} />
            </Card>
          )}

          {/* Empty state */}
          {!selectedImportId && (!imports || imports.length === 0) && (
            <Card className="p-8 text-center">
              <div className="text-gray-400 mb-4">
                <svg
                  className="mx-auto h-12 w-12"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">
                No schedules imported
              </h3>
              <p className="text-gray-500">
                Upload an Amion .sch file to get started
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
