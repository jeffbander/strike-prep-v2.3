"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { SHIFT_TYPES, ShiftType } from "./types";

interface ServiceEditModalProps {
  serviceId: Id<"services">;
  isOpen: boolean;
  onClose: () => void;
}

interface ShiftData {
  _id: Id<"shifts">;
  shiftType: string;
  startTime: string;
  endTime: string;
  positionsNeeded: number;
  isActive: boolean;
}

interface SkillData {
  _id: Id<"skills">;
  name: string;
  category: string;
  isRequired: boolean;
}

interface JobTypeData {
  _id: Id<"service_job_types">;
  jobType: {
    _id: Id<"job_types">;
    name: string;
    code: string;
  } | null;
  shifts: ShiftData[];
  skills: (SkillData | null)[];
  dayShiftStart?: string;
  dayShiftEnd?: string;
  nightShiftStart?: string;
  nightShiftEnd?: string;
}

export default function ServiceEditModal({
  serviceId,
  isOpen,
  onClose,
}: ServiceEditModalProps) {
  const serviceDetails = useQuery(api.services.getWithDetails, { serviceId });
  const updateService = useMutation(api.services.update);
  const updateShift = useMutation(api.services.updateShift);
  const toggleShiftActive = useMutation(api.services.toggleShiftActive);

  const [isSaving, setIsSaving] = useState(false);

  // Local state for editing
  const [serviceName, setServiceName] = useState("");
  const [serviceShortCode, setServiceShortCode] = useState("");
  const [dayCapacity, setDayCapacity] = useState<number | undefined>();
  const [nightCapacity, setNightCapacity] = useState<number | undefined>();
  const [weekendCapacity, setWeekendCapacity] = useState<number | undefined>();
  const [operatesDays, setOperatesDays] = useState(true);
  const [operatesNights, setOperatesNights] = useState(true);
  const [operatesWeekends, setOperatesWeekends] = useState(true);
  const [dayShiftStart, setDayShiftStart] = useState("07:00");
  const [dayShiftEnd, setDayShiftEnd] = useState("19:00");
  const [nightShiftStart, setNightShiftStart] = useState("19:00");
  const [nightShiftEnd, setNightShiftEnd] = useState("07:00");

  // Populate form when service data loads
  useEffect(() => {
    if (serviceDetails) {
      setServiceName(serviceDetails.name);
      setServiceShortCode(serviceDetails.shortCode);
      setDayCapacity(serviceDetails.dayCapacity);
      setNightCapacity(serviceDetails.nightCapacity);
      setWeekendCapacity(serviceDetails.weekendCapacity);
      setOperatesDays(serviceDetails.operatesDays);
      setOperatesNights(serviceDetails.operatesNights);
      setOperatesWeekends(serviceDetails.operatesWeekends);
      setDayShiftStart(serviceDetails.dayShiftStart);
      setDayShiftEnd(serviceDetails.dayShiftEnd);
      setNightShiftStart(serviceDetails.nightShiftStart);
      setNightShiftEnd(serviceDetails.nightShiftEnd);
    }
  }, [serviceDetails]);

  const handleSaveBasics = async () => {
    try {
      setIsSaving(true);
      await updateService({
        serviceId,
        name: serviceName,
        shortCode: serviceShortCode,
        dayCapacity,
        nightCapacity,
        weekendCapacity,
        dayShiftStart,
        dayShiftEnd,
        nightShiftStart,
        nightShiftEnd,
        operatesDays,
        operatesNights,
        operatesWeekends,
      });
      toast.success("Service updated successfully");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleShift = async (shiftId: Id<"shifts">) => {
    try {
      const result = await toggleShiftActive({ shiftId });
      toast.success(`Shift ${result.isActive ? "activated" : "deactivated"}`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpdateShiftHeadcount = async (
    shiftId: Id<"shifts">,
    newPositionsNeeded: number
  ) => {
    try {
      await updateShift({
        shiftId,
        positionsNeeded: newPositionsNeeded,
        regeneratePositions: true,
      });
      toast.success("Shift headcount updated");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpdateShiftTime = async (
    shiftId: Id<"shifts">,
    startTime: string,
    endTime: string,
    positionsNeeded: number
  ) => {
    try {
      await updateShift({
        shiftId,
        startTime,
        endTime,
        positionsNeeded,
        regeneratePositions: false,
      });
      toast.success("Shift times updated");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  if (!isOpen) return null;

  if (!serviceDetails) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-slate-800 rounded-lg p-8">
          <p className="text-white">Loading service details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-white">Edit Service</h2>
            <p className="text-slate-400 text-sm mt-1">
              Update service details, shift times, and staffing levels
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="bg-slate-700 rounded-lg p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Service Name
                </label>
                <input
                  type="text"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg focus:outline-none focus:border-emerald-500 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Short Code
                </label>
                <input
                  type="text"
                  value={serviceShortCode}
                  onChange={(e) =>
                    setServiceShortCode(e.target.value.toUpperCase().slice(0, 6))
                  }
                  maxLength={6}
                  className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg focus:outline-none focus:border-emerald-500 text-white font-mono"
                />
              </div>
            </div>

            {/* Operating Schedule */}
            <div className="pt-4 border-t border-slate-600">
              <h4 className="text-sm font-medium text-slate-300 mb-3">
                Operating Schedule
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <label className="flex items-center gap-2 p-3 rounded-lg border-2 border-slate-600 cursor-pointer hover:border-slate-500">
                  <input
                    type="checkbox"
                    checked={operatesDays}
                    onChange={(e) => setOperatesDays(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                  <span className="text-white text-sm">Weekday Days</span>
                </label>
                <label className="flex items-center gap-2 p-3 rounded-lg border-2 border-slate-600 cursor-pointer hover:border-slate-500">
                  <input
                    type="checkbox"
                    checked={operatesNights}
                    onChange={(e) => setOperatesNights(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                  <span className="text-white text-sm">Weekday Nights</span>
                </label>
                <label className="flex items-center gap-2 p-3 rounded-lg border-2 border-slate-600 cursor-pointer hover:border-slate-500">
                  <input
                    type="checkbox"
                    checked={operatesWeekends}
                    onChange={(e) => setOperatesWeekends(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                  <span className="text-white text-sm">Weekends</span>
                </label>
              </div>
            </div>

            {/* Shift Times */}
            <div className="pt-4 border-t border-slate-600">
              <h4 className="text-sm font-medium text-slate-300 mb-3">
                Default Shift Times
              </h4>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Day Start
                  </label>
                  <input
                    type="time"
                    value={dayShiftStart}
                    onChange={(e) => setDayShiftStart(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg focus:outline-none focus:border-emerald-500 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Day End
                  </label>
                  <input
                    type="time"
                    value={dayShiftEnd}
                    onChange={(e) => setDayShiftEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg focus:outline-none focus:border-emerald-500 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Night Start
                  </label>
                  <input
                    type="time"
                    value={nightShiftStart}
                    onChange={(e) => setNightShiftStart(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg focus:outline-none focus:border-emerald-500 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Night End
                  </label>
                  <input
                    type="time"
                    value={nightShiftEnd}
                    onChange={(e) => setNightShiftEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg focus:outline-none focus:border-emerald-500 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Capacity */}
            <div className="pt-4 border-t border-slate-600">
              <h4 className="text-sm font-medium text-slate-300 mb-3">
                Patient Capacity
              </h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Day Capacity
                  </label>
                  <input
                    type="number"
                    value={dayCapacity || ""}
                    onChange={(e) =>
                      setDayCapacity(e.target.value ? parseInt(e.target.value) : undefined)
                    }
                    placeholder="Optional"
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg focus:outline-none focus:border-emerald-500 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Night Capacity
                  </label>
                  <input
                    type="number"
                    value={nightCapacity || ""}
                    onChange={(e) =>
                      setNightCapacity(e.target.value ? parseInt(e.target.value) : undefined)
                    }
                    placeholder="Optional"
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg focus:outline-none focus:border-emerald-500 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Weekend Capacity
                  </label>
                  <input
                    type="number"
                    value={weekendCapacity || ""}
                    onChange={(e) =>
                      setWeekendCapacity(e.target.value ? parseInt(e.target.value) : undefined)
                    }
                    placeholder="Optional"
                    className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg focus:outline-none focus:border-emerald-500 text-white"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveBasics}
              disabled={isSaving}
              className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 rounded-lg transition-colors font-medium text-white"
            >
              {isSaving ? "Saving..." : "Save Basic Info"}
            </button>
          </div>

          {/* Job Types & Shifts */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Roles & Shifts</h3>
            {serviceDetails.serviceJobTypes.map((jobTypeData: JobTypeData) => (
              <div
                key={jobTypeData._id}
                className="bg-slate-700 rounded-lg p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-semibold">
                      {jobTypeData.jobType?.name || "Unknown Role"}
                    </h4>
                    <p className="text-sm text-slate-400 font-mono">
                      {jobTypeData.jobType?.code}
                    </p>
                  </div>
                </div>

                {/* Skills for this role */}
                <div className="pt-2 pb-3 border-b border-slate-600">
                  <p className="text-xs text-slate-400 mb-2">Required Skills:</p>
                  {jobTypeData.skills && jobTypeData.skills.filter(Boolean).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {jobTypeData.skills.filter((skill): skill is SkillData => skill !== null).map((skill) => (
                        <span
                          key={skill._id}
                          className={`px-2 py-1 rounded text-xs ${
                            skill.isRequired
                              ? "bg-amber-600/30 text-amber-300 border border-amber-600/50"
                              : "bg-slate-600 text-slate-300"
                          }`}
                          title={`Category: ${skill.category}${skill.isRequired ? " (Required)" : " (Preferred)"}`}
                        >
                          {skill.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No skills assigned. Use Import Staffing to add skills.</p>
                  )}
                </div>

                {/* Shifts for this job type */}
                <div className="space-y-3">
                  {jobTypeData.shifts.map((shift: ShiftData) => {
                    const shiftTypeInfo = SHIFT_TYPES[shift.shiftType as ShiftType];
                    return (
                      <div
                        key={shift._id}
                        className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                          shift.isActive
                            ? "bg-slate-600 border-slate-500"
                            : "bg-slate-800/50 border-slate-700 opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <span
                            className={`inline-block w-2 h-2 ${shiftTypeInfo?.dotColor || "bg-gray-500"} rounded-full ${
                              !shift.isActive ? "opacity-50" : ""
                            }`}
                          ></span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-medium ${
                                  !shift.isActive ? "text-slate-400" : "text-white"
                                }`}
                              >
                                {shiftTypeInfo?.label || shift.shiftType}
                              </span>
                              {!shift.isActive && (
                                <span className="px-2 py-0.5 bg-slate-600 text-slate-400 text-xs rounded">
                                  Deactivated
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-slate-400">
                              {shift.startTime} - {shift.endTime}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {shift.isActive && (
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-slate-400">
                                Positions:
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={shift.positionsNeeded}
                                onChange={(e) =>
                                  handleUpdateShiftHeadcount(
                                    shift._id,
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-16 px-2 py-1 bg-slate-500 border border-slate-400 rounded text-sm text-white focus:outline-none focus:border-emerald-500"
                              />
                            </div>
                          )}
                          <button
                            onClick={() => handleToggleShift(shift._id)}
                            className={`px-3 py-1 rounded text-xs transition-colors ${
                              shift.isActive
                                ? "bg-amber-600 hover:bg-amber-700 text-white"
                                : "bg-emerald-600 hover:bg-emerald-700 text-white"
                            }`}
                          >
                            {shift.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 p-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors font-medium text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
