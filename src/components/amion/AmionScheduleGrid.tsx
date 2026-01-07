"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface AmionScheduleGridProps {
  importId: Id<"amion_imports">;
}

export function AmionScheduleGrid({ importId }: AmionScheduleGridProps) {
  const [dateFilter, setDateFilter] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const scheduleData = useQuery(api.amionSchedules.getScheduleGrid, {
    importId,
    startDate: dateFilter?.start,
    endDate: dateFilter?.end,
  });

  const updateStatus = useMutation(api.amionSchedules.updateServiceStatus);

  // Filter services by search query
  const filteredServices = useMemo(() => {
    if (!scheduleData?.services) return [];
    if (!searchQuery) return scheduleData.services;

    const query = searchQuery.toLowerCase();
    return scheduleData.services.filter(
      (s) =>
        s.service.name.toLowerCase().includes(query) ||
        Object.values(s.assignments).some((a) =>
          a?.providerName.toLowerCase().includes(query)
        )
    );
  }, [scheduleData?.services, searchQuery]);

  // Format date for display (short format)
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // Get day of week
  const getDayOfWeek = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", { weekday: "short" });
  };

  // Check if date is weekend
  const isWeekend = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  // Get status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "redeployable":
        return (
          <Badge className="bg-green-600 hover:bg-green-700 text-white">
            Redeployable
          </Badge>
        );
      case "essential":
        return (
          <Badge className="bg-red-600 hover:bg-red-700 text-white">
            Essential
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-gray-500">
            Unclassified
          </Badge>
        );
    }
  };

  // Toggle status on click
  const handleStatusClick = async (
    serviceId: Id<"amion_services">,
    currentStatus: string
  ) => {
    const nextStatus =
      currentStatus === "unclassified"
        ? "redeployable"
        : currentStatus === "redeployable"
        ? "essential"
        : "unclassified";

    await updateStatus({ serviceId, redeploymentStatus: nextStatus });
  };

  // Visible dates (first 14 days or filtered range)
  const visibleDates = useMemo(() => {
    if (!scheduleData?.dates) return [];
    // Show first 14 days by default, or all if filtered
    return dateFilter ? scheduleData.dates : scheduleData.dates.slice(0, 14);
  }, [scheduleData?.dates, dateFilter]);

  if (!scheduleData) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center">
        <Input
          placeholder="Search services or providers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xs"
        />

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFilter?.start || ""}
            onChange={(e) =>
              setDateFilter((prev) => ({
                start: e.target.value,
                end: prev?.end || e.target.value,
              }))
            }
            className="w-36"
          />
          <span className="text-gray-500">to</span>
          <Input
            type="date"
            value={dateFilter?.end || ""}
            onChange={(e) =>
              setDateFilter((prev) => ({
                start: prev?.start || e.target.value,
                end: e.target.value,
              }))
            }
            className="w-36"
          />
          {dateFilter && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDateFilter(null)}
            >
              Clear
            </Button>
          )}
        </div>

        <div className="ml-auto text-sm text-gray-500">
          {filteredServices.length} services, {scheduleData.dates.length} days
        </div>
      </div>

      {/* Grid */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="sticky left-0 z-10 bg-gray-50 min-w-[200px]">
                  Service
                </TableHead>
                <TableHead className="sticky left-[200px] z-10 bg-gray-50 min-w-[100px]">
                  Shift
                </TableHead>
                <TableHead className="sticky left-[300px] z-10 bg-gray-50 min-w-[110px]">
                  Status
                </TableHead>
                {visibleDates.map((date) => (
                  <TableHead
                    key={date}
                    className={cn(
                      "text-center min-w-[90px]",
                      isWeekend(date) && "bg-gray-100"
                    )}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500">
                        {getDayOfWeek(date)}
                      </span>
                      <span>{formatDate(date)}</span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredServices.map((row) => (
                <TableRow key={row.service._id}>
                  <TableCell className="sticky left-0 z-10 bg-white font-medium">
                    {row.service.name}
                  </TableCell>
                  <TableCell className="sticky left-[200px] z-10 bg-white text-gray-500">
                    {row.service.shiftDisplay || "-"}
                  </TableCell>
                  <TableCell className="sticky left-[300px] z-10 bg-white">
                    <button
                      onClick={() =>
                        handleStatusClick(
                          row.service._id,
                          row.service.redeploymentStatus
                        )
                      }
                      className="cursor-pointer"
                    >
                      {getStatusBadge(row.service.redeploymentStatus)}
                    </button>
                  </TableCell>
                  {visibleDates.map((date) => {
                    const assignment = row.assignments[date];
                    return (
                      <TableCell
                        key={date}
                        className={cn(
                          "text-center text-sm",
                          isWeekend(date) && "bg-gray-50",
                          row.service.redeploymentStatus === "redeployable" &&
                            "bg-green-50",
                          row.service.redeploymentStatus === "essential" &&
                            "bg-red-50"
                        )}
                      >
                        {assignment ? (
                          <span
                            className="truncate block max-w-[80px]"
                            title={assignment.providerName}
                          >
                            {formatProviderName(assignment.providerName)}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Show more dates notice */}
      {!dateFilter && scheduleData.dates.length > 14 && (
        <div className="text-center text-sm text-gray-500">
          Showing first 14 days. Use date filter to see more.
        </div>
      )}
    </div>
  );
}

/**
 * Format provider name for compact display
 * "LASTNAME, FIRSTNAME" -> "Lastname, F."
 */
function formatProviderName(name: string): string {
  if (!name) return "";

  if (name.includes(",")) {
    const [last, first] = name.split(",").map((s) => s.trim());
    const formattedLast = last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
    const firstInitial = first ? first.charAt(0).toUpperCase() + "." : "";
    return `${formattedLast}, ${firstInitial}`;
  }

  // If no comma, just return abbreviated
  const parts = name.split(" ");
  if (parts.length > 1) {
    return `${parts[parts.length - 1]}, ${parts[0].charAt(0)}.`;
  }
  return name;
}
