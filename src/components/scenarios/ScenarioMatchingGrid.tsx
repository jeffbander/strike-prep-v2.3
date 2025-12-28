"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Search, X, Check, Clock, Star } from "lucide-react";

type CellStatus = "Open" | "Assigned" | "Confirmed" | "Cancelled";

interface GridCellData {
  positionId: Id<"scenario_positions">;
  status: CellStatus;
  providerName?: string;
  providerInitials?: string;
  providerId?: Id<"providers">;
  assignmentId?: Id<"scenario_assignments">;
  assignmentStatus?: string;
}

interface ScenarioMatchingGridProps {
  scenarioId: Id<"strike_scenarios">;
}

export function ScenarioMatchingGrid({ scenarioId }: ScenarioMatchingGridProps) {
  const gridData = useQuery(api.scenarioMatching.getGridData, { scenarioId });

  const createAssignment = useMutation(api.scenarioMatching.createAssignment);
  const confirmAssignment = useMutation(api.scenarioMatching.confirmAssignment);
  const cancelAssignment = useMutation(api.scenarioMatching.cancelAssignment);

  const [selectedCell, setSelectedCell] = useState<{
    positionId: Id<"scenario_positions">;
    date: string;
    shiftType: string;
    jobTypeId: Id<"job_types">;
    cell: GridCellData | null;
  } | null>(null);

  const [providerSearchQuery, setProviderSearchQuery] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);

  // Query for available providers when a cell is selected
  const availableProviders = useQuery(
    api.scenarioMatching.getAvailableProviders,
    selectedCell && !selectedCell.cell?.providerId
      ? {
          scenarioId,
          date: selectedCell.date,
          shiftType: selectedCell.shiftType,
          positionJobTypeId: selectedCell.jobTypeId,
        }
      : "skip"
  );

  // Query for matches for this position
  const positionMatches = useQuery(
    api.scenarioMatching.findMatchesForPosition,
    selectedCell && !selectedCell.cell?.providerId
      ? { scenarioPositionId: selectedCell.positionId }
      : "skip"
  );

  if (!gridData || "error" in gridData) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        {gridData?.error || "Loading grid data..."}
      </div>
    );
  }

  const { dates, services, scenarioName } = gridData;

  // Calculate visible dates based on week offset
  const visibleDates = dates.slice(weekOffset * 7, (weekOffset + 1) * 7);

  const handleCellClick = (
    positionId: Id<"scenario_positions">,
    date: string,
    shiftType: string,
    jobTypeId: Id<"job_types">,
    cell: GridCellData | null
  ) => {
    if (!cell) return;
    setSelectedCell({ positionId, date, shiftType, jobTypeId, cell });
    setProviderSearchQuery("");
  };

  const handleProviderAssign = async (providerId: Id<"providers">) => {
    if (!selectedCell) return;

    try {
      await createAssignment({
        scenarioPositionId: selectedCell.positionId,
        providerId,
      });
      toast.success("Provider assigned successfully");
      setSelectedCell(null);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleToggleStatus = async () => {
    if (!selectedCell?.cell?.assignmentId) return;

    try {
      if (selectedCell.cell.assignmentStatus === "Active") {
        await confirmAssignment({ assignmentId: selectedCell.cell.assignmentId });
        toast.success("Assignment confirmed");
      }
      setSelectedCell(null);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleRemoveProvider = async () => {
    if (!selectedCell?.cell?.assignmentId) return;

    try {
      await cancelAssignment({ assignmentId: selectedCell.cell.assignmentId });
      toast.success("Assignment cancelled");
      setSelectedCell(null);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Filter providers based on search
  const filteredMatches = positionMatches?.matches?.filter(
    (match: any) =>
      match.providerName.toLowerCase().includes(providerSearchQuery.toLowerCase()) ||
      match.jobTypeName?.toLowerCase().includes(providerSearchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header with navigation */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
          disabled={weekOffset === 0}
          className="gap-2 bg-slate-700 border-slate-600 hover:bg-slate-600"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <h3 className="text-sm font-medium text-slate-200">
          {visibleDates.length > 0 && (
            <>
              {new Date(visibleDates[0]).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}{" "}
              -{" "}
              {new Date(visibleDates[visibleDates.length - 1]).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </>
          )}
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekOffset(weekOffset + 1)}
          disabled={(weekOffset + 1) * 7 >= dates.length}
          className="gap-2 bg-slate-700 border-slate-600 hover:bg-slate-600"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto bg-slate-900">
        <div className="inline-block min-w-full">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              {/* Date headers */}
              <tr>
                <th className="border border-slate-700 bg-slate-800 p-3 text-left text-xs font-semibold text-slate-300 w-48 sticky left-0 z-20">
                  SERVICE / ROLE
                </th>
                {visibleDates.map((date) => (
                  <th
                    key={date}
                    colSpan={2}
                    className="border border-slate-700 bg-slate-800 p-3 text-center text-sm font-semibold text-slate-200"
                  >
                    <div className="uppercase tracking-wide">
                      {new Date(date).toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {new Date(date).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                    </div>
                  </th>
                ))}
              </tr>
              {/* AM/PM headers */}
              <tr>
                <th className="border border-slate-700 bg-slate-800 p-2 sticky left-0 z-20"></th>
                {visibleDates.flatMap((date) => [
                  <th
                    key={`${date}-am`}
                    className="border border-slate-700 bg-slate-800 p-2 text-center text-xs font-medium text-yellow-400 w-24"
                  >
                    AM
                  </th>,
                  <th
                    key={`${date}-pm`}
                    className="border border-slate-700 bg-slate-800 p-2 text-center text-xs font-medium text-blue-400 w-24"
                  >
                    PM
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {services.map((service: any) => (
                <React.Fragment key={`${service.serviceId}-${service.jobTypeId}`}>
                  {/* Service header row */}
                  <tr className="bg-slate-800/50">
                    <td
                      colSpan={visibleDates.length * 2 + 1}
                      className="border border-slate-700 p-3 text-sm font-bold text-emerald-400 uppercase tracking-wide"
                    >
                      {service.serviceCode || service.serviceName} {service.jobTypeCode}
                    </td>
                  </tr>
                  {/* Position rows */}
                  {service.rows.map((row: any) => (
                    <tr key={`${service.serviceId}-${service.jobTypeId}-${row.positionNumber}`}>
                      <td className="border border-slate-700 bg-slate-800/30 p-2 text-xs text-slate-400 font-mono sticky left-0 z-10">
                        position {row.positionNumber}
                      </td>
                      {row.shifts
                        .filter((s: any) => visibleDates.includes(s.date))
                        .flatMap((shift: any) => [
                          <td
                            key={`${shift.date}-am`}
                            className="border border-slate-700 p-1 bg-slate-900 cursor-pointer"
                            onClick={() =>
                              shift.am &&
                              handleCellClick(
                                shift.am.positionId,
                                shift.date,
                                "AM",
                                service.jobTypeId,
                                shift.am
                              )
                            }
                          >
                            {shift.am && <GridCellDisplay cell={shift.am} />}
                          </td>,
                          <td
                            key={`${shift.date}-pm`}
                            className="border border-slate-700 p-1 bg-slate-900 cursor-pointer"
                            onClick={() =>
                              shift.pm &&
                              handleCellClick(
                                shift.pm.positionId,
                                shift.date,
                                "PM",
                                service.jobTypeId,
                                shift.pm
                              )
                            }
                          >
                            {shift.pm && <GridCellDisplay cell={shift.pm} />}
                          </td>,
                        ])}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Provider Selection Dialog */}
      <Dialog open={selectedCell !== null} onOpenChange={() => setSelectedCell(null)}>
        <DialogContent className="max-w-lg bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {selectedCell?.cell?.providerId ? "Manage Assignment" : "Assign Provider"}
            </DialogTitle>
            <p className="text-sm text-slate-400">
              {selectedCell?.date && new Date(selectedCell.date).toLocaleDateString()} - {selectedCell?.shiftType} Shift
            </p>
          </DialogHeader>

          {selectedCell?.cell?.providerId ? (
            // Show assignment management
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Currently Assigned</p>
                    <p className="text-lg font-medium text-slate-100">
                      {selectedCell.cell.providerName}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      "text-xs",
                      selectedCell.cell.assignmentStatus === "Confirmed"
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                        : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                    )}
                  >
                    {selectedCell.cell.assignmentStatus === "Confirmed" ? (
                      <div className="flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Confirmed
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Pending
                      </div>
                    )}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  {selectedCell.cell.assignmentStatus === "Active" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleToggleStatus}
                      className="flex-1 gap-2 bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                    >
                      <Check className="h-4 w-4" />
                      Confirm
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveProvider}
                    className="gap-2 bg-transparent border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    <X className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            // Show provider selection
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search providers..."
                  value={providerSearchQuery}
                  onChange={(e) => setProviderSearchQuery(e.target.value)}
                  className="pl-9 bg-slate-900 border-slate-700 text-slate-100"
                />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2">
                {positionMatches?.matches === undefined ? (
                  <div className="text-center py-4 text-slate-400">Loading matches...</div>
                ) : filteredMatches?.length === 0 ? (
                  <div className="text-center py-4 text-slate-400">No matching providers found</div>
                ) : (
                  filteredMatches?.map((match: any) => (
                    <button
                      key={match.providerId}
                      onClick={() => handleProviderAssign(match.providerId)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 p-3 text-left transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-100">{match.providerName}</p>
                          {match.isPreferred && (
                            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            match.matchQuality === "Perfect"
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                              : match.matchQuality === "Good"
                              ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                              : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                          )}
                        >
                          {match.matchQuality}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-slate-400">{match.jobTypeName}</span>
                        <span className="text-xs text-slate-500">
                          {match.currentAssignmentCount} shifts assigned
                        </span>
                      </div>
                      {match.matchedSkills?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {match.matchedSkills.slice(0, 4).map((skill: string) => (
                            <Badge
                              key={skill}
                              variant="secondary"
                              className="text-xs bg-emerald-500/20 text-emerald-400"
                            >
                              {skill}
                            </Badge>
                          ))}
                          {match.matchedSkills.length > 4 && (
                            <Badge variant="secondary" className="text-xs bg-slate-700 text-slate-300">
                              +{match.matchedSkills.length - 4}
                            </Badge>
                          )}
                        </div>
                      )}
                      {match.missingSkills?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {match.missingSkills.map((skill: string) => (
                            <Badge
                              key={skill}
                              variant="secondary"
                              className="text-xs bg-red-500/20 text-red-400"
                            >
                              Missing: {skill}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GridCellDisplay({ cell }: { cell: GridCellData }) {
  if (cell.status === "Cancelled") {
    return (
      <div className="h-12 w-full bg-slate-950 rounded flex items-center justify-center cursor-not-allowed">
        <div className="text-xs text-slate-700 font-bold tracking-wider">---</div>
      </div>
    );
  }

  if (cell.status === "Confirmed") {
    return (
      <div className="h-12 w-full bg-emerald-500/10 border border-emerald-500/30 rounded flex items-center justify-center hover:bg-emerald-500/20 transition-colors group">
        <span className="text-sm font-medium text-emerald-300 truncate px-2 group-hover:text-emerald-200">
          {cell.providerInitials || cell.providerName?.split(" ").map((n) => n[0]).join("")}
        </span>
      </div>
    );
  }

  if (cell.status === "Assigned") {
    return (
      <div className="h-12 w-full bg-amber-500/10 border border-amber-500/30 rounded flex items-center justify-center hover:bg-amber-500/20 transition-colors group">
        <span className="text-sm font-medium text-amber-300 truncate px-2 group-hover:text-amber-200">
          {cell.providerInitials || cell.providerName?.split(" ").map((n) => n[0]).join("")}
        </span>
      </div>
    );
  }

  // Open
  return (
    <div className="h-12 w-full bg-slate-800/50 border-2 border-dashed border-slate-600 rounded flex items-center justify-center hover:border-emerald-500/50 hover:bg-slate-800 transition-colors group">
      <span className="text-xs text-slate-500 font-mono group-hover:text-emerald-400 transition-colors">[ ]</span>
    </div>
  );
}
