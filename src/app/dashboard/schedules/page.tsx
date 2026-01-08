"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import { Id } from "../../../../convex/_generated/dataModel";
import ScheduleImportModal from "@/components/schedules/ScheduleImportModal";
import RotationTypeManager from "@/components/schedules/RotationTypeManager";
import AddToPoolModal from "@/components/schedules/AddToPoolModal";

type StatusFilter = "all" | "available" | "on_service" | "curtailable" | "vacation" | "sick";
type ViewMode = "provider" | "rotation";

interface SelectedCell {
  providerId: Id<"providers">;
  date: string;
}

export default function SchedulesPage() {
  const currentUser = useQuery(api.users.getCurrentUser);

  // State
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<Id<"departments"> | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedCells, setSelectedCells] = useState<SelectedCell[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRotationManager, setShowRotationManager] = useState(false);
  const [showAddToPoolModal, setShowAddToPoolModal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("provider");

  // Get departments for selector (list handles user scope internally)
  const departments = useQuery(
    api.departments.list,
    currentUser?.hospitalId
      ? { hospitalId: currentUser.hospitalId }
      : {}
  );

  // Auto-select first department if user has departmentId
  const activeDepartmentId = selectedDepartmentId || currentUser?.departmentId || departments?.[0]?._id;

  // Calculate date range (7-day week)
  const dateRange = useMemo(() => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + weekOffset * 7);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    return {
      startDate: startOfWeek.toISOString().split("T")[0],
      endDate: endOfWeek.toISOString().split("T")[0],
    };
  }, [weekOffset]);

  // Generate dates array for display
  const dates = useMemo(() => {
    const result: string[] = [];
    const start = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      result.push(d.toISOString().split("T")[0]);
    }
    return result;
  }, [dateRange]);

  // Get schedule grid data (provider view)
  const gridData = useQuery(
    api.amionSchedules.getScheduleGridByDepartment,
    activeDepartmentId && viewMode === "provider"
      ? {
          departmentId: activeDepartmentId,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          statusFilter: statusFilter === "all" ? undefined : [statusFilter],
        }
      : "skip"
  );

  // Get schedule grid data (rotation view)
  const rotationData = useQuery(
    api.amionSchedules.getScheduleByRotation,
    activeDepartmentId && viewMode === "rotation"
      ? {
          departmentId: activeDepartmentId,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }
      : "skip"
  );

  // Selection handlers
  const toggleCellSelection = (providerId: Id<"providers">, date: string) => {
    setSelectedCells((prev) => {
      const exists = prev.some(
        (c) => c.providerId === providerId && c.date === date
      );
      if (exists) {
        return prev.filter(
          (c) => !(c.providerId === providerId && c.date === date)
        );
      }
      return [...prev, { providerId, date }];
    });
  };

  const selectAllCurtailable = () => {
    if (!gridData) return;

    const curtailableCells: SelectedCell[] = [];
    for (const provider of gridData.providers) {
      for (const assignment of provider.assignments) {
        if (assignment.isCurtailable || assignment.status === "available") {
          curtailableCells.push({
            providerId: provider.providerId,
            date: assignment.date,
          });
        }
      }
    }
    setSelectedCells(curtailableCells);
  };

  const clearSelection = () => {
    setSelectedCells([]);
  };

  const isSelected = (providerId: Id<"providers">, date: string) => {
    return selectedCells.some(
      (c) => c.providerId === providerId && c.date === date
    );
  };

  // Format date for header
  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = date.toLocaleDateString("en-US", { weekday: "short" });
    const num = date.getDate();
    return { day, num };
  };

  // Format week range for display
  const formatWeekRange = () => {
    const start = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);
    const startMonth = start.toLocaleDateString("en-US", { month: "short" });
    const endMonth = end.toLocaleDateString("en-US", { month: "short" });
    const startDay = start.getDate();
    const endDay = end.getDate();
    const year = start.getFullYear();

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}, ${year}`;
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Schedules</h1>
          <p className="text-slate-400 mt-1">
            View provider schedules and add available providers to the strike pool
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRotationManager(true)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Manage Rotations
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
          >
            Import Schedule
          </button>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg w-fit">
        <button
          onClick={() => setViewMode("provider")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === "provider"
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-white hover:bg-slate-700"
          }`}
        >
          By Provider
        </button>
        <button
          onClick={() => setViewMode("rotation")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === "rotation"
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-white hover:bg-slate-700"
          }`}
        >
          By Rotation
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center bg-slate-800/50 p-4 rounded-lg">
        {/* Department Selector */}
        {departments && departments.length > 1 && (
          <div>
            <label className="block text-sm text-slate-400 mb-1">Department</label>
            <select
              value={activeDepartmentId || ""}
              onChange={(e) => setSelectedDepartmentId(e.target.value as Id<"departments">)}
              className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
            >
              {departments.map((dept) => (
                <option key={dept._id} value={dept._id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Week Navigation */}
        <div>
          <label className="block text-sm text-slate-400 mb-1">Week</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset((w) => w - 1)}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="px-4 py-2 bg-slate-700 rounded-lg min-w-[180px] text-center">
              {formatWeekRange()}
            </span>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-sm text-slate-400 mb-1">Status Filter</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="available">Available</option>
            <option value="curtailable">Curtailable</option>
            <option value="on_service">On Service</option>
            <option value="vacation">Vacation</option>
            <option value="sick">Sick</option>
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: "#10B981" }}></div>
          <span className="text-slate-400">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: "#3B82F6" }}></div>
          <span className="text-slate-400">On Service</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: "#F59E0B" }}></div>
          <span className="text-slate-400">Curtailable</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: "#EF4444" }}></div>
          <span className="text-slate-400">Vacation/Sick</span>
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="bg-slate-800/50 rounded-lg overflow-hidden">
        {viewMode === "provider" ? (
          // Provider View: Providers on Y-axis, dates on X-axis, cells show rotation codes
          !gridData ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : gridData.providers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
              <p>No providers found in this department</p>
              <p className="text-sm mt-1">Import providers first, then import their schedules</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="sticky left-0 bg-slate-800 px-4 py-3 text-left font-medium z-10 min-w-[200px]">
                      Provider
                    </th>
                    {dates.map((date) => {
                      const { day, num } = formatDateHeader(date);
                      const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6;
                      return (
                        <th
                          key={date}
                          className={`px-2 py-3 text-center font-medium min-w-[80px] ${
                            isWeekend ? "bg-slate-700/50" : ""
                          }`}
                        >
                          <div className="text-xs text-slate-400">{day}</div>
                          <div className="text-lg">{num}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {gridData.providers.map((provider) => (
                    <tr key={provider.providerId} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="sticky left-0 bg-slate-800 px-4 py-2 z-10">
                        <div className="font-medium">{provider.fullName}</div>
                        <div className="text-xs text-slate-400">{provider.jobTypeName}</div>
                      </td>
                      {provider.assignments.map((assignment) => {
                        const selected = isSelected(provider.providerId, assignment.date);
                        const isWeekend =
                          new Date(assignment.date).getDay() === 0 ||
                          new Date(assignment.date).getDay() === 6;

                        return (
                          <td
                            key={assignment.date}
                            className={`px-1 py-1 text-center ${isWeekend ? "bg-slate-700/30" : ""}`}
                          >
                            <button
                              onClick={() => toggleCellSelection(provider.providerId, assignment.date)}
                              className={`w-full px-2 py-2 rounded text-xs font-medium transition-all ${
                                selected
                                  ? "ring-2 ring-white ring-offset-2 ring-offset-slate-800"
                                  : "hover:ring-1 hover:ring-slate-500"
                              }`}
                              style={{ backgroundColor: assignment.color }}
                            >
                              {assignment.hasAssignment ? (
                                <span className="text-white drop-shadow-sm">
                                  {assignment.rotationShortCode}
                                </span>
                              ) : (
                                <span className="text-white/70">-</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          // Rotation View: Rotations on Y-axis, dates on X-axis, cells show provider names
          !rotationData ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : rotationData.rotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p>No schedule assignments found</p>
              <p className="text-sm mt-1">Import a schedule to see rotation assignments</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="sticky left-0 bg-slate-800 px-4 py-3 text-left font-medium z-10 min-w-[200px]">
                      Rotation
                    </th>
                    {dates.map((date) => {
                      const { day, num } = formatDateHeader(date);
                      const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6;
                      return (
                        <th
                          key={date}
                          className={`px-2 py-3 text-center font-medium min-w-[120px] ${
                            isWeekend ? "bg-slate-700/50" : ""
                          }`}
                        >
                          <div className="text-xs text-slate-400">{day}</div>
                          <div className="text-lg">{num}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rotationData.rotations.map((rotation) => (
                    <tr key={rotation.rotationName} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="sticky left-0 bg-slate-800 px-4 py-2 z-10">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: rotation.color }}
                          />
                          <div>
                            <div className="font-medium">{rotation.rotationName}</div>
                            <div className="text-xs text-slate-400">
                              {rotation.shortCode}
                              {rotation.isCurtailable && (
                                <span className="ml-2 text-amber-400">Curtailable</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      {rotation.assignments.map((assignment) => {
                        const isWeekend =
                          new Date(assignment.date).getDay() === 0 ||
                          new Date(assignment.date).getDay() === 6;

                        return (
                          <td
                            key={assignment.date}
                            className={`px-1 py-1 text-center ${isWeekend ? "bg-slate-700/30" : ""}`}
                          >
                            <div
                              className="px-2 py-2 rounded text-xs"
                              style={{
                                backgroundColor: assignment.hasAssignment
                                  ? `${rotation.color}40`
                                  : "transparent",
                              }}
                            >
                              {assignment.hasAssignment ? (
                                <div className="space-y-0.5">
                                  {assignment.providerNames.map((name, idx) => (
                                    <div key={idx} className="text-white/90 truncate">
                                      {name}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedCells.length > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-800 border border-slate-600 rounded-lg px-6 py-4 flex items-center gap-4 shadow-xl z-50">
          <span className="text-slate-300">
            <strong>{selectedCells.length}</strong> cells selected
          </span>
          <button
            onClick={selectAllCurtailable}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm"
          >
            Select All Available/Curtailable
          </button>
          <button
            onClick={() => setShowAddToPoolModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors text-sm"
          >
            Add to Pool
          </button>
          <button
            onClick={clearSelection}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm"
          >
            Clear
          </button>
        </div>
      )}

      {/* Modals */}
      {showImportModal && activeDepartmentId && (
        <ScheduleImportModal
          departmentId={activeDepartmentId}
          healthSystemId={currentUser.healthSystemId!}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {showRotationManager && currentUser.healthSystemId && (
        <RotationTypeManager
          healthSystemId={currentUser.healthSystemId}
          onClose={() => setShowRotationManager(false)}
        />
      )}

      {showAddToPoolModal && (
        <AddToPoolModal
          selectedCells={selectedCells}
          onClose={() => {
            setShowAddToPoolModal(false);
            setSelectedCells([]);
          }}
        />
      )}
    </div>
  );
}
