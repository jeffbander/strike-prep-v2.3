"use client";

import { useState, useMemo } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";

interface SendAvailabilityDialogProps {
  scenarioId: Id<"strike_scenarios">;
  isOpen: boolean;
  onClose: () => void;
}

export default function SendAvailabilityDialog({
  scenarioId,
  isOpen,
  onClose,
}: SendAvailabilityDialogProps) {
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("");
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    sent: number;
    failed: number;
    errors: string[];
  } | null>(null);

  // Get scenario to know affected job types
  const scenario = useQuery(api.scenarios.get, { scenarioId });

  // Get providers that could match this scenario (based on affected job types)
  const providers = useQuery(api.providers.list, {});

  // Get job types for filtering
  const jobTypes = useQuery(api.jobTypes.list, {});

  // Send emails action
  const sendEmails = useAction(api.email.sendShiftAvailabilityEmails);

  // Filter providers by job type and active status
  const filteredProviders = useMemo(() => {
    if (!providers || !scenario) return [];

    // Extract job type IDs from the affected job types array (which contains objects with jobTypeId)
    const affectedJobTypeIds = new Set(
      (scenario.affectedJobTypes || []).map((jt: { jobTypeId: Id<"job_types">; reductionPercent: number }) => jt.jobTypeId)
    );

    return providers.filter((p) => {
      // Must be active
      if (!p.isActive) return false;

      // Must have email
      if (!p.email) return false;

      // Must have an affected job type
      if (!affectedJobTypeIds.has(p.jobTypeId)) return false;

      // Apply job type filter if set
      if (jobTypeFilter && p.jobTypeId !== jobTypeFilter) return false;

      return true;
    });
  }, [providers, scenario, jobTypeFilter]);

  // Get affected job types for filter dropdown
  const affectedJobTypes = useMemo(() => {
    if (!jobTypes || !scenario) return [];
    const affectedIds = new Set(
      (scenario.affectedJobTypes || []).map((jt: { jobTypeId: Id<"job_types">; reductionPercent: number }) => jt.jobTypeId)
    );
    return jobTypes.filter((jt) => affectedIds.has(jt._id));
  }, [jobTypes, scenario]);

  const handleToggleProvider = (providerId: string) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedProviders.size === filteredProviders.length) {
      setSelectedProviders(new Set());
    } else {
      setSelectedProviders(new Set(filteredProviders.map((p) => p._id)));
    }
  };

  const handleSend = async () => {
    if (selectedProviders.size === 0) {
      toast.error("Please select at least one provider");
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const sendResult = await sendEmails({
        scenarioId,
        providerIds: Array.from(selectedProviders) as Id<"providers">[],
        customMessage: customMessage.trim() || undefined,
      });

      setResult(sendResult);

      if (sendResult.success) {
        toast.success(`Sent ${sendResult.sent} email${sendResult.sent > 1 ? "s" : ""}`);
      } else if (sendResult.sent > 0) {
        toast.warning(`Sent ${sendResult.sent} emails, ${sendResult.failed} failed`);
      } else {
        toast.error("Failed to send emails");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send emails");
      setResult({
        success: false,
        sent: 0,
        failed: selectedProviders.size,
        errors: [error.message],
      });
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Send Availability Request</h2>
            <p className="text-sm text-slate-400 mt-1">
              Send shift availability emails to selected providers
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Result Message */}
          {result && (
            <div className={`p-4 rounded-lg ${result.success ? "bg-emerald-500/20 border border-emerald-500/30" : "bg-red-500/20 border border-red-500/30"}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.success ? (
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span className={result.success ? "text-emerald-300" : "text-red-300"}>
                  {result.sent} sent, {result.failed} failed
                </span>
              </div>
              {result.errors.length > 0 && (
                <ul className="text-sm text-red-400 list-disc list-inside">
                  {result.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {result.errors.length > 5 && (
                    <li>... and {result.errors.length - 5} more errors</li>
                  )}
                </ul>
              )}
            </div>
          )}

          {/* Job Type Filter */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Filter by Job Type
            </label>
            <select
              value={jobTypeFilter}
              onChange={(e) => setJobTypeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Affected Job Types</option>
              {affectedJobTypes.map((jt) => (
                <option key={jt._id} value={jt._id}>
                  {jt.name} ({jt.code})
                </option>
              ))}
            </select>
          </div>

          {/* Provider Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-400">
                Select Providers ({filteredProviders.length} available)
              </label>
              <button
                onClick={handleSelectAll}
                className="text-sm text-emerald-400 hover:text-emerald-300"
              >
                {selectedProviders.size === filteredProviders.length ? "Deselect All" : "Select All"}
              </button>
            </div>
            <div className="bg-slate-700/50 rounded-lg max-h-48 overflow-y-auto">
              {filteredProviders.length === 0 ? (
                <div className="p-4 text-center text-slate-500">
                  No providers match the criteria
                </div>
              ) : (
                filteredProviders.map((provider) => {
                  const jobType = jobTypes?.find((jt) => jt._id === provider.jobTypeId);
                  return (
                    <div
                      key={provider._id}
                      className={`flex items-center gap-3 p-3 hover:bg-slate-700/50 cursor-pointer border-b border-slate-700/50 last:border-0 ${
                        selectedProviders.has(provider._id) ? "bg-emerald-500/10" : ""
                      }`}
                      onClick={() => handleToggleProvider(provider._id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProviders.has(provider._id)}
                        onChange={() => handleToggleProvider(provider._id)}
                        className="w-4 h-4 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500"
                      />
                      <div className="flex-1">
                        <div className="text-white font-medium">
                          {provider.firstName} {provider.lastName}
                        </div>
                        <div className="text-sm text-slate-400">
                          {provider.email}
                        </div>
                      </div>
                      <span className="px-2 py-1 bg-slate-600 rounded text-xs text-slate-300">
                        {jobType?.code || "?"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Custom Message */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Custom Message (Optional)
            </label>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Add a personal note to include in the email..."
              rows={3}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Preview */}
          <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-700">
            <div className="text-sm text-slate-400 mb-2">Email Preview</div>
            <div className="text-white text-sm space-y-2">
              <p><strong>Subject:</strong> Available Shifts for {scenario?.name}</p>
              <p><strong>Content:</strong></p>
              <div className="pl-4 border-l-2 border-slate-600 text-slate-300">
                <p>Hello [Provider Name],</p>
                <p className="mt-2">
                  Shifts are available for <strong>{scenario?.name}</strong>. You can view and claim available shifts that match your skills and schedule.
                </p>
                {customMessage && (
                  <p className="mt-2 italic text-slate-400">"{customMessage}"</p>
                )}
                <p className="mt-2 text-emerald-400">[View & Claim Available Shifts Button]</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            {selectedProviders.size} provider{selectedProviders.size !== 1 ? "s" : ""} selected
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || selectedProviders.size === 0}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
            >
              {sending ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Send Emails
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
