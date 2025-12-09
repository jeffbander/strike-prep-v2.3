"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import { Id } from "../../../../convex/_generated/dataModel";

type AvailabilityStatus = "available" | "unavailable" | "partial" | "none";

interface ProviderAvailability {
  _id: Id<"provider_availability">;
  providerId: Id<"providers">;
  date: string;
  availabilityType: string;
  amAvailable: boolean;
  pmAvailable: boolean;
  amPreferred?: boolean;
  pmPreferred?: boolean;
  notes?: string;
  providerName?: string;
}

export default function AvailabilityPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const scenarios = useQuery(
    api.scenarios.list,
    currentUser?.healthSystemId
      ? { healthSystemId: currentUser.healthSystemId }
      : "skip"
  );

  const [selectedScenarioId, setSelectedScenarioId] = useState<Id<"strike_scenarios"> | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Id<"providers"> | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const selectedScenario = scenarios?.find((s) => s._id === selectedScenarioId);

  // Get date range from scenario or default to next 14 days
  const dateRange = useMemo(() => {
    if (selectedScenario) {
      return {
        startDate: selectedScenario.startDate,
        endDate: selectedScenario.endDate,
      };
    }
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 13);
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }, [selectedScenario]);

  // Get providers based on user scope
  const providers = useQuery(
    api.providers.list,
    currentUser?.departmentId
      ? { departmentId: currentUser.departmentId }
      : currentUser?.hospitalId
      ? { hospitalId: currentUser.hospitalId }
      : "skip"
  );

  // Get availability data
  const availabilityData = useQuery(
    api.providerAvailability.getByDateRange,
    currentUser?.departmentId
      ? {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          departmentId: currentUser.departmentId,
          scenarioId: selectedScenarioId || undefined,
        }
      : currentUser?.hospitalId
      ? {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          hospitalId: currentUser.hospitalId,
          scenarioId: selectedScenarioId || undefined,
        }
      : "skip"
  );

  // Generate dates array for calendar
  const dates = useMemo(() => {
    const result: string[] = [];
    const start = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      result.push(d.toISOString().split("T")[0]);
    }
    return result;
  }, [dateRange]);

  // Build availability map: providerId -> date -> availability
  const availabilityMap = useMemo(() => {
    const map = new Map<string, Map<string, ProviderAvailability>>();
    if (!availabilityData) return map;

    for (const avail of availabilityData) {
      if (!map.has(avail.providerId)) {
        map.set(avail.providerId, new Map());
      }
      map.get(avail.providerId)!.set(avail.date, avail as ProviderAvailability);
    }
    return map;
  }, [availabilityData]);

  const getAvailabilityStatus = (
    providerId: Id<"providers">,
    date: string
  ): AvailabilityStatus => {
    const providerMap = availabilityMap.get(providerId);
    if (!providerMap) return "none";
    const avail = providerMap.get(date);
    if (!avail) return "none";
    if (avail.availabilityType === "unavailable") return "unavailable";
    if (avail.amAvailable && avail.pmAvailable) return "available";
    if (avail.amAvailable || avail.pmAvailable) return "partial";
    return "unavailable";
  };

  const getStatusColor = (status: AvailabilityStatus) => {
    switch (status) {
      case "available":
        return "bg-emerald-500/30 border-emerald-500 text-emerald-300";
      case "partial":
        return "bg-yellow-500/30 border-yellow-500 text-yellow-300";
      case "unavailable":
        return "bg-red-500/30 border-red-500 text-red-300";
      default:
        return "bg-slate-700 border-slate-600 text-slate-400";
    }
  };

  const handleCellClick = (providerId: Id<"providers">, date: string) => {
    setSelectedProvider(providerId);
    setSelectedDate(date);
    setShowEditModal(true);
  };

  if (!currentUser) {
    return (
      <div className="p-8 text-white">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8 text-white">
      <div className="max-w-full mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Provider Availability</h1>
            <p className="text-slate-400 mt-1">
              Manage provider availability for strike scenarios
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowBulkModal(true)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Bulk Import
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-slate-800 rounded-lg p-4 mb-6 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm text-slate-400 mb-1">Scenario</label>
            <select
              value={selectedScenarioId || ""}
              onChange={(e) =>
                setSelectedScenarioId(
                  e.target.value ? (e.target.value as Id<"strike_scenarios">) : null
                )
              }
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm"
            >
              <option value="">All Dates (Next 14 days)</option>
              {scenarios
                ?.filter((s) => s.status !== "Cancelled")
                .map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.startDate} to {s.endDate})
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "calendar"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              Calendar
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              List
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 mb-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-emerald-500/30 border border-emerald-500"></div>
            <span className="text-slate-300">Available (Full Day)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-yellow-500/30 border border-yellow-500"></div>
            <span className="text-slate-300">Partial (AM or PM only)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500/30 border border-red-500"></div>
            <span className="text-slate-300">Unavailable</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-slate-700 border border-slate-600"></div>
            <span className="text-slate-300">Not Set</span>
          </div>
        </div>

        {/* Calendar View */}
        {viewMode === "calendar" && (
          <div className="bg-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr>
                  <th className="text-left text-sm font-medium text-slate-400 p-3 sticky left-0 bg-slate-800 border-b border-slate-700 min-w-[200px]">
                    Provider
                  </th>
                  {dates.map((date) => (
                    <th
                      key={date}
                      className="text-center text-xs font-medium text-slate-400 p-2 border-b border-slate-700 min-w-[60px]"
                    >
                      <div>
                        {new Date(date).toLocaleDateString("en-US", {
                          weekday: "short",
                        })}
                      </div>
                      <div className="font-bold">
                        {new Date(date).getDate()}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {providers?.map((provider) => (
                  <tr key={provider._id} className="border-b border-slate-700/50">
                    <td className="p-3 sticky left-0 bg-slate-800">
                      <div className="font-medium">
                        {provider.firstName} {provider.lastName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {provider.jobTypeName || provider.jobTypeCode}
                      </div>
                    </td>
                    {dates.map((date) => {
                      const status = getAvailabilityStatus(provider._id, date);
                      const isWeekend = [0, 6].includes(new Date(date).getDay());
                      return (
                        <td
                          key={date}
                          className={`p-1 text-center ${isWeekend ? "bg-slate-800/50" : ""}`}
                        >
                          <button
                            onClick={() => handleCellClick(provider._id, date)}
                            className={`w-10 h-8 rounded border text-xs font-medium transition-colors hover:opacity-80 ${getStatusColor(
                              status
                            )}`}
                          >
                            {status === "available" && "A"}
                            {status === "partial" && "P"}
                            {status === "unavailable" && "X"}
                            {status === "none" && "-"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {(!providers || providers.length === 0) && (
                  <tr>
                    <td
                      colSpan={dates.length + 1}
                      className="text-center py-8 text-slate-500"
                    >
                      No providers found in your scope
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* List View */}
        {viewMode === "list" && (
          <div className="space-y-4">
            {providers?.map((provider) => {
              const providerAvailability = availabilityMap.get(provider._id);
              const availableDays = providerAvailability
                ? Array.from(providerAvailability.values()).filter(
                    (a) => a.amAvailable || a.pmAvailable
                  ).length
                : 0;

              return (
                <div
                  key={provider._id}
                  className="bg-slate-800 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-medium">
                        {provider.firstName} {provider.lastName}
                      </h3>
                      <p className="text-sm text-slate-400">
                        {provider.jobTypeName || provider.jobTypeCode} | {provider.email}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-emerald-400">
                        {availableDays}
                      </div>
                      <div className="text-xs text-slate-400">
                        days available
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {dates.map((date) => {
                      const status = getAvailabilityStatus(provider._id, date);
                      return (
                        <button
                          key={date}
                          onClick={() => handleCellClick(provider._id, date)}
                          className={`w-8 h-8 rounded text-xs font-medium transition-colors hover:opacity-80 ${getStatusColor(
                            status
                          )}`}
                          title={new Date(date).toLocaleDateString()}
                        >
                          {new Date(date).getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Edit Availability Modal */}
        {showEditModal && selectedProvider && selectedDate && (
          <EditAvailabilityModal
            providerId={selectedProvider}
            date={selectedDate}
            existingAvailability={
              availabilityMap.get(selectedProvider)?.get(selectedDate) || null
            }
            scenarioId={selectedScenarioId}
            onClose={() => {
              setShowEditModal(false);
              setSelectedProvider(null);
              setSelectedDate(null);
            }}
          />
        )}

        {/* Bulk Import Modal */}
        {showBulkModal && (
          <BulkImportModal
            scenarioId={selectedScenarioId}
            onClose={() => setShowBulkModal(false)}
          />
        )}
      </div>
    </div>
  );
}

function EditAvailabilityModal({
  providerId,
  date,
  existingAvailability,
  scenarioId,
  onClose,
}: {
  providerId: Id<"providers">;
  date: string;
  existingAvailability: ProviderAvailability | null;
  scenarioId: Id<"strike_scenarios"> | null;
  onClose: () => void;
}) {
  const provider = useQuery(api.providers.get, { providerId });
  const setAvailability = useMutation(api.providerAvailability.setAvailability);
  const deleteAvailability = useMutation(api.providerAvailability.deleteAvailability);
  const setAvailabilityRange = useMutation(api.providerAvailability.setAvailabilityRange);

  const [mode, setMode] = useState<"single" | "range">("single");
  const [amAvailable, setAmAvailable] = useState(existingAvailability?.amAvailable ?? true);
  const [pmAvailable, setPmAvailable] = useState(existingAvailability?.pmAvailable ?? true);
  const [amPreferred, setAmPreferred] = useState(existingAvailability?.amPreferred ?? false);
  const [pmPreferred, setPmPreferred] = useState(existingAvailability?.pmPreferred ?? false);
  const [notes, setNotes] = useState(existingAvailability?.notes ?? "");
  const [endDate, setEndDate] = useState(date);
  const [skipWeekends, setSkipWeekends] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const availabilityType = amAvailable || pmAvailable ? "available" : "unavailable";

      if (mode === "single") {
        await setAvailability({
          providerId,
          date,
          availabilityType,
          amAvailable,
          pmAvailable,
          amPreferred: amPreferred || undefined,
          pmPreferred: pmPreferred || undefined,
          notes: notes || undefined,
          scenarioId: scenarioId || undefined,
        });
        toast.success("Availability updated");
      } else {
        const result = await setAvailabilityRange({
          providerId,
          startDate: date,
          endDate,
          availabilityType,
          amAvailable,
          pmAvailable,
          amPreferred: amPreferred || undefined,
          pmPreferred: pmPreferred || undefined,
          notes: notes || undefined,
          scenarioId: scenarioId || undefined,
          skipWeekends,
        });
        toast.success(
          `Updated ${result.totalDays} days (${result.created} created, ${result.updated} updated)`
        );
      }
      onClose();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remove availability for this date?")) return;
    try {
      await deleteAvailability({ providerId, date });
      toast.success("Availability removed");
      onClose();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSetUnavailable = async () => {
    setIsSubmitting(true);
    try {
      if (mode === "single") {
        await setAvailability({
          providerId,
          date,
          availabilityType: "unavailable",
          amAvailable: false,
          pmAvailable: false,
          notes: notes || undefined,
          scenarioId: scenarioId || undefined,
        });
        toast.success("Marked as unavailable");
      } else {
        await setAvailabilityRange({
          providerId,
          startDate: date,
          endDate,
          availabilityType: "unavailable",
          amAvailable: false,
          pmAvailable: false,
          notes: notes || undefined,
          scenarioId: scenarioId || undefined,
          skipWeekends,
        });
        toast.success("Date range marked as unavailable");
      }
      onClose();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-md">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Edit Availability</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-slate-400 mt-1">
            {provider?.firstName} {provider?.lastName} -{" "}
            {new Date(date).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode("single")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === "single"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-700 text-slate-300"
              }`}
            >
              Single Date
            </button>
            <button
              onClick={() => setMode("range")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === "range"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-700 text-slate-300"
              }`}
            >
              Date Range
            </button>
          </div>

          {mode === "range" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  min={date}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={skipWeekends}
                  onChange={(e) => setSkipWeekends(e.target.checked)}
                  className="rounded border-slate-500 bg-slate-600"
                />
                Skip weekends
              </label>
            </div>
          )}

          {/* Shift Availability */}
          <div>
            <label className="block text-sm font-medium mb-2">Shift Availability</label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 bg-slate-700 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={amAvailable}
                  onChange={(e) => setAmAvailable(e.target.checked)}
                  className="rounded border-slate-500 bg-slate-600 text-emerald-500"
                />
                <div className="flex-1">
                  <span className="font-medium">AM Shift</span>
                  {amAvailable && (
                    <label className="ml-4 text-sm text-slate-400">
                      <input
                        type="checkbox"
                        checked={amPreferred}
                        onChange={(e) => setAmPreferred(e.target.checked)}
                        className="rounded border-slate-500 bg-slate-600 text-yellow-500 mr-1"
                      />
                      Preferred
                    </label>
                  )}
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 bg-slate-700 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={pmAvailable}
                  onChange={(e) => setPmAvailable(e.target.checked)}
                  className="rounded border-slate-500 bg-slate-600 text-emerald-500"
                />
                <div className="flex-1">
                  <span className="font-medium">PM Shift</span>
                  {pmAvailable && (
                    <label className="ml-4 text-sm text-slate-400">
                      <input
                        type="checkbox"
                        checked={pmPreferred}
                        onChange={(e) => setPmPreferred(e.target.checked)}
                        className="rounded border-slate-500 bg-slate-600 text-yellow-500 mr-1"
                      />
                      Preferred
                    </label>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about availability..."
              rows={2}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="p-6 border-t border-slate-700 flex justify-between">
          <div className="flex gap-2">
            {existingAvailability && mode === "single" && (
              <button
                onClick={handleDelete}
                className="px-3 py-2 text-red-400 hover:text-red-300 text-sm"
              >
                Remove
              </button>
            )}
            <button
              onClick={handleSetUnavailable}
              disabled={isSubmitting}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm"
            >
              Mark Unavailable
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || (!amAvailable && !pmAvailable)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Available"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BulkImportModal({
  scenarioId,
  onClose,
}: {
  scenarioId: Id<"strike_scenarios"> | null;
  onClose: () => void;
}) {
  const bulkImport = useMutation(api.providerAvailability.bulkImportAvailability);
  const [csvData, setCsvData] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewData, setPreviewData] = useState<any[] | null>(null);

  const handleParse = () => {
    try {
      const lines = csvData.trim().split("\n");
      if (lines.length < 2) {
        toast.error("CSV must have header row and at least one data row");
        return;
      }

      const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
      const emailIdx = header.indexOf("email");
      const dateIdx = header.indexOf("date");
      const amIdx = header.indexOf("am_available");
      const pmIdx = header.indexOf("pm_available");
      const notesIdx = header.indexOf("notes");

      if (emailIdx === -1 || dateIdx === -1) {
        toast.error("CSV must have 'email' and 'date' columns");
        return;
      }

      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        if (cols.length < 2) continue;

        data.push({
          providerEmail: cols[emailIdx],
          date: cols[dateIdx],
          amAvailable: amIdx !== -1 ? cols[amIdx]?.toLowerCase() === "true" : true,
          pmAvailable: pmIdx !== -1 ? cols[pmIdx]?.toLowerCase() === "true" : true,
          notes: notesIdx !== -1 ? cols[notesIdx] : undefined,
        });
      }

      setPreviewData(data);
      toast.success(`Parsed ${data.length} records`);
    } catch (error: any) {
      toast.error("Failed to parse CSV: " + error.message);
    }
  };

  const handleImport = async () => {
    if (!previewData || previewData.length === 0) {
      toast.error("No data to import");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await bulkImport({
        availabilities: previewData,
        scenarioId: scenarioId || undefined,
      });

      toast.success(
        `Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`
      );

      if (result.errors.length > 0) {
        console.warn("Import errors:", result.errors);
        toast.warning(`${result.errors.length} records had errors - check console`);
      }

      onClose();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Bulk Import Availability</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">CSV Format</label>
            <div className="bg-slate-700 rounded-lg p-3 text-xs font-mono text-slate-300">
              email,date,am_available,pm_available,notes
              <br />
              john@example.com,2025-01-03,true,true,
              <br />
              jane@example.com,2025-01-03,true,false,AM only
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Paste CSV Data</label>
            <textarea
              value={csvData}
              onChange={(e) => {
                setCsvData(e.target.value);
                setPreviewData(null);
              }}
              placeholder="Paste CSV data here..."
              rows={8}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg font-mono text-sm"
            />
          </div>

          {previewData && (
            <div>
              <h3 className="text-sm font-medium mb-2">
                Preview ({previewData.length} records)
              </h3>
              <div className="bg-slate-700 rounded-lg p-3 max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="text-left py-1">Email</th>
                      <th className="text-left py-1">Date</th>
                      <th className="text-center py-1">AM</th>
                      <th className="text-center py-1">PM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t border-slate-600">
                        <td className="py-1">{row.providerEmail}</td>
                        <td className="py-1">{row.date}</td>
                        <td className="text-center py-1">
                          {row.amAvailable ? "Y" : "N"}
                        </td>
                        <td className="text-center py-1">
                          {row.pmAvailable ? "Y" : "N"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewData.length > 10 && (
                  <p className="text-slate-400 text-center mt-2">
                    ... and {previewData.length - 10} more
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
          >
            Cancel
          </button>
          {!previewData ? (
            <button
              onClick={handleParse}
              disabled={!csvData.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              Parse CSV
            </button>
          ) : (
            <button
              onClick={handleImport}
              disabled={isSubmitting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              {isSubmitting ? "Importing..." : `Import ${previewData.length} Records`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
