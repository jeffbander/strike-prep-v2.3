"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";

interface SelectedCell {
  providerId: Id<"providers">;
  date: string;
}

interface AddToPoolModalProps {
  selectedCells: SelectedCell[];
  onClose: () => void;
}

export default function AddToPoolModal({
  selectedCells,
  onClose,
}: AddToPoolModalProps) {
  const currentUser = useQuery(api.users.getCurrentUser);
  const scenarios = useQuery(
    api.scenarios.list,
    currentUser?.healthSystemId
      ? { healthSystemId: currentUser.healthSystemId }
      : "skip"
  );

  const addToPool = useMutation(api.amionSchedules.addToPool);

  const [selectedScenarioId, setSelectedScenarioId] = useState<
    Id<"strike_scenarios"> | ""
  >("");
  const [amAvailable, setAmAvailable] = useState(true);
  const [pmAvailable, setPmAvailable] = useState(true);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get unique providers and dates
  const uniqueProviders = new Set(selectedCells.map((c) => c.providerId)).size;
  const uniqueDates = new Set(selectedCells.map((c) => c.date)).size;
  const dateRange = {
    start: selectedCells.map((c) => c.date).sort()[0],
    end: selectedCells
      .map((c) => c.date)
      .sort()
      .pop(),
  };

  const handleSubmit = async () => {
    if (!amAvailable && !pmAvailable) {
      toast.error("Please select at least one shift (AM or PM)");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await addToPool({
        providerDatePairs: selectedCells.map((c) => ({
          providerId: c.providerId,
          date: c.date,
        })),
        scenarioId: selectedScenarioId || undefined,
        amAvailable,
        pmAvailable,
        notes: notes.trim() || undefined,
      });

      toast.success(
        `Added ${result.created} new availability records (${result.skipped} updated)`
      );
      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to add to pool: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold">Add to Pool</h2>
              <p className="text-slate-400 text-sm mt-1">
                Mark selected providers as available for strike coverage
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-xl"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Summary */}
          <div className="bg-slate-700/50 rounded-lg p-4">
            <h3 className="font-medium mb-3">Selection Summary</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-blue-400">
                  {selectedCells.length}
                </p>
                <p className="text-sm text-slate-400">Total Cells</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-400">
                  {uniqueProviders}
                </p>
                <p className="text-sm text-slate-400">Providers</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-400">
                  {uniqueDates}
                </p>
                <p className="text-sm text-slate-400">Dates</p>
              </div>
            </div>
            {dateRange.start && (
              <div className="mt-3 text-sm text-slate-400 text-center">
                {dateRange.start} to {dateRange.end}
              </div>
            )}
          </div>

          {/* Scenario Selection */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Link to Scenario (Optional)
            </label>
            <select
              value={selectedScenarioId}
              onChange={(e) =>
                setSelectedScenarioId(e.target.value as Id<"strike_scenarios">)
              }
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
            >
              <option value="">General Availability (No Scenario)</option>
              {scenarios?.map((scenario) => (
                <option key={scenario._id} value={scenario._id}>
                  {scenario.name} ({scenario.startDate} - {scenario.endDate})
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Linking to a scenario makes this availability scenario-specific
            </p>
          </div>

          {/* Shift Selection */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Available Shifts
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={amAvailable}
                  onChange={(e) => setAmAvailable(e.target.checked)}
                  className="rounded border-slate-600"
                />
                <span>AM Shift</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pmAvailable}
                  onChange={(e) => setPmAvailable(e.target.checked)}
                  className="rounded border-slate-600"
                />
                <span>PM Shift</span>
              </label>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              rows={2}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || (!amAvailable && !pmAvailable)}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
          >
            {isSubmitting ? (
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
                Adding...
              </>
            ) : (
              `Add ${selectedCells.length} to Pool`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
