"use client";

import { useState, useEffect, Suspense } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Id } from "../../../../convex/_generated/dataModel";

function ServicesPageContent() {
  const searchParams = useSearchParams();
  const departmentIdParam = searchParams.get("departmentId");

  const currentUser = useQuery(api.users.getCurrentUser);
  const hospitals = useQuery(api.hospitals.list, {});
  const departments = useQuery(api.departments.list, {});
  const jobTypes = useQuery(api.jobTypes.list, {});
  const skills = useQuery(api.skills.list, {});
  const services = useQuery(
    api.services.list,
    departmentIdParam ? { departmentId: departmentIdParam as Id<"departments"> } : {}
  );
  const createService = useMutation(api.services.create);
  const toggleService = useMutation(api.services.toggleActive);

  const [isCreating, setIsCreating] = useState(false);
  const [selectedHospitalId, setSelectedHospitalId] = useState("");

  // Units for the selected hospital
  const units = useQuery(
    api.units.list,
    selectedHospitalId ? { hospitalId: selectedHospitalId as Id<"hospitals"> } : "skip"
  );

  // Define the job type config interface
  interface JobTypeConfig {
    jobTypeId: string;
    skillIds: string[];
    headcount: number;
    // Per-job-type shift configuration (optional - falls back to service defaults)
    useCustomShiftConfig: boolean;
    operatesDays?: boolean;
    operatesNights?: boolean;
    dayShiftStart?: string;
    dayShiftEnd?: string;
    nightShiftStart?: string;
    nightShiftEnd?: string;
  }

  const [formData, setFormData] = useState({
    departmentId: departmentIdParam || "",
    name: "",
    shortCode: "",
    unitId: "",
    dayCapacity: "",
    nightCapacity: "",
    weekendCapacity: "",
    operatesDays: true,
    operatesNights: true,
    operatesWeekends: false,
    jobTypes: [] as JobTypeConfig[],
    shiftConfig: {
      dayShiftStart: "07:00",
      dayShiftEnd: "19:00",
      nightShiftStart: "19:00",
      nightShiftEnd: "07:00",
    },
  });

  const [newJobType, setNewJobType] = useState<JobTypeConfig>({
    jobTypeId: "",
    skillIds: [],
    headcount: 1,
    useCustomShiftConfig: false,
    operatesDays: undefined,
    operatesNights: undefined,
    dayShiftStart: undefined,
    dayShiftEnd: undefined,
    nightShiftStart: undefined,
    nightShiftEnd: undefined,
  });

  // Update selectedHospitalId when departmentIdParam changes
  useEffect(() => {
    if (departmentIdParam && departments) {
      const dept = departments.find((d) => d._id === departmentIdParam);
      if (dept) {
        setSelectedHospitalId(dept.hospitalId);
        setFormData((prev) => ({ ...prev, departmentId: departmentIdParam }));
      }
    }
  }, [departmentIdParam, departments]);

  const filteredDepartments = selectedHospitalId
    ? departments?.filter((d) => d.hospitalId === selectedHospitalId)
    : departments;

  const handleAddJobType = () => {
    if (!newJobType.jobTypeId) {
      toast.error("Please select a job type");
      return;
    }
    setFormData({
      ...formData,
      jobTypes: [...formData.jobTypes, { ...newJobType }],
    });
    setNewJobType({
      jobTypeId: "",
      skillIds: [],
      headcount: 1,
      useCustomShiftConfig: false,
      operatesDays: undefined,
      operatesNights: undefined,
      dayShiftStart: undefined,
      dayShiftEnd: undefined,
      nightShiftStart: undefined,
      nightShiftEnd: undefined,
    });
  };

  const handleRemoveJobType = (index: number) => {
    setFormData({
      ...formData,
      jobTypes: formData.jobTypes.filter((_, i) => i !== index),
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.jobTypes.length === 0) {
      toast.error("Please add at least one job type");
      return;
    }

    if (!formData.operatesDays && !formData.operatesNights) {
      toast.error("Service must operate during at least one shift type (days or nights)");
      return;
    }

    try {
      const result = await createService({
        departmentId: formData.departmentId as Id<"departments">,
        name: formData.name,
        shortCode: formData.shortCode,
        unitId: formData.unitId ? (formData.unitId as Id<"units">) : undefined,
        dayCapacity: formData.dayCapacity ? parseInt(formData.dayCapacity) : undefined,
        nightCapacity: formData.nightCapacity ? parseInt(formData.nightCapacity) : undefined,
        weekendCapacity: formData.weekendCapacity ? parseInt(formData.weekendCapacity) : undefined,
        operatesDays: formData.operatesDays,
        operatesNights: formData.operatesNights,
        operatesWeekends: formData.operatesWeekends,
        jobTypes: formData.jobTypes.map((jt) => ({
          jobTypeId: jt.jobTypeId as Id<"job_types">,
          skillIds: jt.skillIds as Id<"skills">[],
          headcount: jt.headcount,
          // Only pass per-job-type shift config if custom is enabled
          ...(jt.useCustomShiftConfig && {
            operatesDays: jt.operatesDays,
            operatesNights: jt.operatesNights,
            dayShiftStart: jt.dayShiftStart,
            dayShiftEnd: jt.dayShiftEnd,
            nightShiftStart: jt.nightShiftStart,
            nightShiftEnd: jt.nightShiftEnd,
          }),
        })),
        shiftConfig: formData.shiftConfig,
      });
      toast.success(
        `Service created with ${result.shiftsCreated} shifts and ${result.positionsCreated} positions`
      );
      setFormData({
        departmentId: departmentIdParam || "",
        name: "",
        shortCode: "",
        unitId: "",
        dayCapacity: "",
        nightCapacity: "",
        weekendCapacity: "",
        operatesDays: true,
        operatesNights: true,
        operatesWeekends: false,
        jobTypes: [],
        shiftConfig: {
          dayShiftStart: "07:00",
          dayShiftEnd: "19:00",
          nightShiftStart: "19:00",
          nightShiftEnd: "07:00",
        },
      });
      setIsCreating(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleToggleActive = async (serviceId: Id<"services">) => {
    try {
      const result = await toggleService({ serviceId });
      toast.success(`Service ${result.isActive ? "activated" : "deactivated"}`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getJobTypeName = (id: string) => {
    return jobTypes?.find((jt) => jt._id === id)?.name || "Unknown";
  };

  const getSkillNames = (ids: string[]) => {
    return ids.map((id) => skills?.find((s) => s._id === id)?.name || "Unknown").join(", ");
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/dashboard"
              className="text-slate-400 hover:text-white text-sm mb-2 inline-block"
            >
              &larr; Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">Services</h1>
            {departmentIdParam && departments && (
              <p className="text-slate-400 text-sm mt-1">
                Filtered by department:{" "}
                {departments.find((d) => d._id === departmentIdParam)?.name}
              </p>
            )}
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            + Create Service
          </button>
        </div>

        {isCreating && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Create New Service</h2>
            <form onSubmit={handleCreate} className="space-y-6">
              {/* Hospital & Department Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Hospital *</label>
                  <select
                    value={selectedHospitalId}
                    onChange={(e) => {
                      setSelectedHospitalId(e.target.value);
                      setFormData({ ...formData, departmentId: "", unitId: "" });
                    }}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Select Hospital</option>
                    {hospitals?.map((hospital) => (
                      <option key={hospital._id} value={hospital._id}>
                        {hospital.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Department *</label>
                  <select
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    required
                    disabled={!selectedHospitalId && !departmentIdParam}
                  >
                    <option value="">Select Department</option>
                    {filteredDepartments?.map((dept) => (
                      <option key={dept._id} value={dept._id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Service Details */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Service Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Cardiac ICU"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Short Code *</label>
                  <input
                    type="text"
                    value={formData.shortCode}
                    onChange={(e) =>
                      setFormData({ ...formData, shortCode: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g., CICU"
                    maxLength={6}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Unit (Optional)</label>
                  <select
                    value={formData.unitId}
                    onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    disabled={!selectedHospitalId}
                  >
                    <option value="">No specific unit</option>
                    {units?.filter(u => u.isActive).map((unit) => (
                      <option key={unit._id} value={unit._id}>
                        {unit.name} {unit.floorNumber ? `(Floor ${unit.floorNumber})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Operating Hours */}
              <div>
                <h3 className="text-lg font-medium mb-3">Operating Schedule</h3>
                <div className="flex gap-6 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.operatesDays}
                      onChange={(e) =>
                        setFormData({ ...formData, operatesDays: e.target.checked })
                      }
                      className="rounded text-emerald-500"
                    />
                    <span>Day Shifts</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.operatesNights}
                      onChange={(e) =>
                        setFormData({ ...formData, operatesNights: e.target.checked })
                      }
                      className="rounded text-emerald-500"
                    />
                    <span>Night Shifts</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.operatesWeekends}
                      onChange={(e) =>
                        setFormData({ ...formData, operatesWeekends: e.target.checked })
                      }
                      className="rounded text-emerald-500"
                    />
                    <span>Weekend Coverage</span>
                  </label>
                </div>
              </div>

              {/* Capacity */}
              <div>
                <h3 className="text-lg font-medium mb-3">Capacity (Optional)</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Day Capacity</label>
                    <input
                      type="number"
                      value={formData.dayCapacity}
                      onChange={(e) =>
                        setFormData({ ...formData, dayCapacity: e.target.value })
                      }
                      placeholder="e.g., 10"
                      min={1}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Night Capacity</label>
                    <input
                      type="number"
                      value={formData.nightCapacity}
                      onChange={(e) =>
                        setFormData({ ...formData, nightCapacity: e.target.value })
                      }
                      placeholder="e.g., 8"
                      min={1}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Weekend Capacity</label>
                    <input
                      type="number"
                      value={formData.weekendCapacity}
                      onChange={(e) =>
                        setFormData({ ...formData, weekendCapacity: e.target.value })
                      }
                      placeholder="e.g., 6"
                      min={1}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Shift Configuration */}
              <div>
                <h3 className="text-lg font-medium mb-3">Shift Times</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Day Start</label>
                    <input
                      type="time"
                      value={formData.shiftConfig.dayShiftStart}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          shiftConfig: { ...formData.shiftConfig, dayShiftStart: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                      disabled={!formData.operatesDays}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Day End</label>
                    <input
                      type="time"
                      value={formData.shiftConfig.dayShiftEnd}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          shiftConfig: { ...formData.shiftConfig, dayShiftEnd: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                      disabled={!formData.operatesDays}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Night Start</label>
                    <input
                      type="time"
                      value={formData.shiftConfig.nightShiftStart}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          shiftConfig: { ...formData.shiftConfig, nightShiftStart: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                      disabled={!formData.operatesNights}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Night End</label>
                    <input
                      type="time"
                      value={formData.shiftConfig.nightShiftEnd}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          shiftConfig: { ...formData.shiftConfig, nightShiftEnd: e.target.value },
                        })
                      }
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                      disabled={!formData.operatesNights}
                    />
                  </div>
                </div>
              </div>

              {/* Job Types Configuration */}
              <div>
                <h3 className="text-lg font-medium mb-3">Job Types & Staffing</h3>

                {/* Added Job Types */}
                {formData.jobTypes.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {formData.jobTypes.map((jt, index) => (
                      <div
                        key={index}
                        className="p-3 bg-slate-700 rounded-lg"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium">{getJobTypeName(jt.jobTypeId)}</span>
                            <span className="mx-2 text-slate-400">&times;</span>
                            <span>{jt.headcount} per shift</span>
                            {jt.useCustomShiftConfig && (
                              <span className="ml-2 px-2 py-0.5 bg-emerald-600 text-xs rounded">
                                Custom Shifts
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveJobType(index)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                          >
                            Remove
                          </button>
                        </div>
                        {jt.skillIds.length > 0 && (
                          <p className="text-sm text-slate-400 mt-1">
                            Skills: {getSkillNames(jt.skillIds)}
                          </p>
                        )}
                        {jt.useCustomShiftConfig && (
                          <div className="text-sm text-slate-400 mt-2 pl-2 border-l-2 border-emerald-600">
                            {jt.operatesDays && (
                              <p>Day: {jt.dayShiftStart} - {jt.dayShiftEnd}</p>
                            )}
                            {jt.operatesNights && (
                              <p>Night: {jt.nightShiftStart} - {jt.nightShiftEnd}</p>
                            )}
                            {!jt.operatesDays && !jt.operatesNights && (
                              <p className="text-amber-400">No shifts selected</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Job Type Form */}
                <div className="p-4 bg-slate-700/50 rounded-lg space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Job Type</label>
                      <select
                        value={newJobType.jobTypeId}
                        onChange={(e) =>
                          setNewJobType({ ...newJobType, jobTypeId: e.target.value })
                        }
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Select Job Type</option>
                        {jobTypes?.map((jt) => (
                          <option key={jt._id} value={jt._id}>
                            {jt.name} ({jt.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Headcount/Shift</label>
                      <input
                        type="number"
                        min={1}
                        value={newJobType.headcount}
                        onChange={(e) =>
                          setNewJobType({ ...newJobType, headcount: parseInt(e.target.value) || 1 })
                        }
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleAddJobType}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                      >
                        Add Job Type
                      </button>
                    </div>
                  </div>

                  {/* Custom Shift Configuration Toggle */}
                  <div className="border-t border-slate-600 pt-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newJobType.useCustomShiftConfig}
                        onChange={(e) => {
                          const useCustom = e.target.checked;
                          setNewJobType({
                            ...newJobType,
                            useCustomShiftConfig: useCustom,
                            // Initialize with service defaults when enabling
                            operatesDays: useCustom ? formData.operatesDays : undefined,
                            operatesNights: useCustom ? formData.operatesNights : undefined,
                            dayShiftStart: useCustom ? formData.shiftConfig.dayShiftStart : undefined,
                            dayShiftEnd: useCustom ? formData.shiftConfig.dayShiftEnd : undefined,
                            nightShiftStart: useCustom ? formData.shiftConfig.nightShiftStart : undefined,
                            nightShiftEnd: useCustom ? formData.shiftConfig.nightShiftEnd : undefined,
                          });
                        }}
                        className="rounded text-emerald-500"
                      />
                      <span className="text-sm">Use custom shift times for this job type</span>
                    </label>
                    <p className="text-xs text-slate-500 mt-1 ml-6">
                      Enable to set different shift times than the service default
                    </p>
                  </div>

                  {/* Custom Shift Config Fields */}
                  {newJobType.useCustomShiftConfig && (
                    <div className="bg-slate-700 rounded-lg p-3 space-y-3">
                      <p className="text-sm font-medium text-emerald-400">Custom Shift Configuration</p>

                      {/* Operating Shifts */}
                      <div className="flex gap-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newJobType.operatesDays || false}
                            onChange={(e) =>
                              setNewJobType({ ...newJobType, operatesDays: e.target.checked })
                            }
                            className="rounded text-emerald-500"
                          />
                          <span className="text-sm">Day Shifts</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newJobType.operatesNights || false}
                            onChange={(e) =>
                              setNewJobType({ ...newJobType, operatesNights: e.target.checked })
                            }
                            className="rounded text-emerald-500"
                          />
                          <span className="text-sm">Night Shifts</span>
                        </label>
                      </div>

                      {/* Day Shift Times */}
                      {newJobType.operatesDays && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Day Start</label>
                            <input
                              type="time"
                              value={newJobType.dayShiftStart || "07:00"}
                              onChange={(e) =>
                                setNewJobType({ ...newJobType, dayShiftStart: e.target.value })
                              }
                              className="w-full px-3 py-1.5 bg-slate-600 border border-slate-500 rounded focus:outline-none focus:border-emerald-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Day End</label>
                            <input
                              type="time"
                              value={newJobType.dayShiftEnd || "19:00"}
                              onChange={(e) =>
                                setNewJobType({ ...newJobType, dayShiftEnd: e.target.value })
                              }
                              className="w-full px-3 py-1.5 bg-slate-600 border border-slate-500 rounded focus:outline-none focus:border-emerald-500 text-sm"
                            />
                          </div>
                        </div>
                      )}

                      {/* Night Shift Times */}
                      {newJobType.operatesNights && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Night Start</label>
                            <input
                              type="time"
                              value={newJobType.nightShiftStart || "19:00"}
                              onChange={(e) =>
                                setNewJobType({ ...newJobType, nightShiftStart: e.target.value })
                              }
                              className="w-full px-3 py-1.5 bg-slate-600 border border-slate-500 rounded focus:outline-none focus:border-emerald-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Night End</label>
                            <input
                              type="time"
                              value={newJobType.nightShiftEnd || "07:00"}
                              onChange={(e) =>
                                setNewJobType({ ...newJobType, nightShiftEnd: e.target.value })
                              }
                              className="w-full px-3 py-1.5 bg-slate-600 border border-slate-500 rounded focus:outline-none focus:border-emerald-500 text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Required Skills</label>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-slate-700 rounded-lg">
                      {skills?.map((skill) => (
                        <label
                          key={skill._id}
                          className="flex items-center gap-1 px-2 py-1 bg-slate-600 rounded text-sm cursor-pointer hover:bg-slate-500"
                        >
                          <input
                            type="checkbox"
                            checked={newJobType.skillIds.includes(skill._id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewJobType({
                                  ...newJobType,
                                  skillIds: [...newJobType.skillIds, skill._id],
                                });
                              } else {
                                setNewJobType({
                                  ...newJobType,
                                  skillIds: newJobType.skillIds.filter((id) => id !== skill._id),
                                });
                              }
                            }}
                            className="rounded"
                          />
                          {skill.name}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  Create Service
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Services List */}
        <div className="space-y-4">
          {services === undefined ? (
            <div className="text-slate-400">Loading...</div>
          ) : services.length === 0 ? (
            <div className="bg-slate-800 rounded-lg p-8 text-center">
              <p className="text-slate-400 mb-4">No services found</p>
              <button
                onClick={() => setIsCreating(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Create Your First Service
              </button>
            </div>
          ) : (
            services.map((service) => (
              <div key={service._id} className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-semibold">{service.name}</h3>
                      <span className="px-2 py-1 bg-slate-700 rounded text-sm font-mono">
                        {service.shortCode}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 mt-1">
                      Department: {departments?.find((d) => d._id === service.departmentId)?.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        service.isActive ? "bg-emerald-600" : "bg-red-600"
                      }`}
                    >
                      {service.isActive ? "Active" : "Inactive"}
                    </span>
                    <button
                      onClick={() => handleToggleActive(service._id)}
                      className={`px-3 py-1 rounded text-sm transition-colors ${
                        service.isActive
                          ? "bg-amber-600 hover:bg-amber-700"
                          : "bg-emerald-600 hover:bg-emerald-700"
                      }`}
                    >
                      {service.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm text-slate-400">
                  <div>
                    <p className="font-medium text-white">Shift Types</p>
                    <div className="mt-1 space-y-1">
                      {service.operatesDays && (
                        <div className="flex items-center gap-1">
                          <span className="inline-block w-2 h-2 bg-yellow-500 rounded-full"></span>
                          <span>Weekday AM: {service.dayShiftStart} - {service.dayShiftEnd}</span>
                        </div>
                      )}
                      {service.operatesNights && (
                        <div className="flex items-center gap-1">
                          <span className="inline-block w-2 h-2 bg-indigo-500 rounded-full"></span>
                          <span>Weekday PM: {service.nightShiftStart} - {service.nightShiftEnd}</span>
                        </div>
                      )}
                      {service.operatesWeekends && service.operatesDays && (
                        <div className="flex items-center gap-1">
                          <span className="inline-block w-2 h-2 bg-orange-500 rounded-full"></span>
                          <span>Weekend AM: {service.dayShiftStart} - {service.dayShiftEnd}</span>
                        </div>
                      )}
                      {service.operatesWeekends && service.operatesNights && (
                        <div className="flex items-center gap-1">
                          <span className="inline-block w-2 h-2 bg-purple-500 rounded-full"></span>
                          <span>Weekend PM: {service.nightShiftStart} - {service.nightShiftEnd}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-white">Capacity</p>
                    <div className="mt-1 space-y-1">
                      {service.dayCapacity && <p>Day: {service.dayCapacity}</p>}
                      {service.nightCapacity && <p>Night: {service.nightCapacity}</p>}
                      {service.weekendCapacity && <p>Weekend: {service.weekendCapacity}</p>}
                      {!service.dayCapacity && !service.nightCapacity && !service.weekendCapacity && (
                        <p className="text-slate-500">Not specified</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-white">Unit</p>
                    <p className="mt-1">
                      {service.unitId ? "Assigned" : "Not assigned"}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function ServicesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white p-8 flex items-center justify-center">Loading...</div>}>
      <ServicesPageContent />
    </Suspense>
  );
}
