"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import Link from "next/link";
import { Id } from "../../../../convex/_generated/dataModel";
import * as XLSX from "xlsx";

export default function ProvidersPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const hospitals = useQuery(api.hospitals.list, {});
  const departments = useQuery(api.departments.list, {});
  const jobTypes = useQuery(api.jobTypes.list, {});
  const skills = useQuery(api.skills.list, {});
  const providers = useQuery(api.providers.list, {});
  const createProvider = useMutation(api.providers.create);
  const bulkCreateProviders = useMutation(api.providers.bulkCreateWithIds);
  const addSkill = useMutation(api.providers.addSkill);
  const removeSkill = useMutation(api.providers.removeSkill);
  const updateProvider = useMutation(api.providers.update);
  const toggleActive = useMutation(api.providers.toggleActive);
  const addHospitalAccess = useMutation(api.providers.addHospitalAccess);
  const removeHospitalAccess = useMutation(api.providers.removeHospitalAccess);

  const [isCreating, setIsCreating] = useState(false);
  const [isBulkUpload, setIsBulkUpload] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedHospitalFilter, setSelectedHospitalFilter] = useState("");
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    jobTypeId: "",
    homeDepartmentId: "",
    homeHospitalId: "",
  });

  const [editFormData, setEditFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    jobTypeId: "",
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createProvider({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email || undefined,
        cellPhone: formData.phone || undefined,
        jobTypeId: formData.jobTypeId as Id<"job_types">,
        departmentId: formData.homeDepartmentId as Id<"departments">,
      });
      toast.success("Provider created successfully");
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        jobTypeId: "",
        homeDepartmentId: "",
        homeHospitalId: "",
      });
      setIsCreating(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      // Map Excel columns to provider data
      const providersData = jsonData.map((row) => ({
        firstName: row["First Name"] || row["firstName"] || "",
        lastName: row["Last Name"] || row["lastName"] || "",
        email: row["Email"] || row["email"] || "",
        phone: row["Phone"] || row["phone"] || "",
        jobTypeName: row["Job Type"] || row["jobType"] || "",
        departmentName: row["Department"] || row["department"] || "",
        hospitalName: row["Hospital"] || row["hospital"] || "",
        skills: (row["Skills"] || row["skills"] || "")
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean),
      }));

      // Map names to IDs
      const mappedProviders = providersData.map((p) => {
        const jobType = jobTypes?.find(
          (jt) => jt.name.toLowerCase() === p.jobTypeName.toLowerCase() ||
                  jt.code.toLowerCase() === p.jobTypeName.toLowerCase()
        );
        const hospital = hospitals?.find(
          (h) => h.name.toLowerCase() === p.hospitalName.toLowerCase() ||
                 h.shortCode.toLowerCase() === p.hospitalName.toLowerCase()
        );
        const department = departments?.find(
          (d) => d.name.toLowerCase() === p.departmentName.toLowerCase() &&
                 (!hospital || d.hospitalId === hospital._id)
        );
        const skillIds = p.skills
          .map((skillName: string) =>
            skills?.find((s) => s.name.toLowerCase() === skillName.toLowerCase())?._id
          )
          .filter(Boolean);

        return {
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          phone: p.phone || undefined,
          jobTypeId: jobType?._id,
          homeDepartmentId: department?._id,
          homeHospitalId: hospital?._id,
          skillIds,
        };
      });

      // Filter valid providers
      const validProviders = mappedProviders.filter(
        (p) => p.firstName && p.lastName && p.email && p.jobTypeId && p.homeDepartmentId && p.homeHospitalId
      );

      if (validProviders.length === 0) {
        toast.error("No valid providers found in file. Check column names and data.");
        return;
      }

      const result = await bulkCreateProviders({
        providers: validProviders.map((p) => ({
          ...p,
          jobTypeId: p.jobTypeId as Id<"job_types">,
          homeDepartmentId: p.homeDepartmentId as Id<"departments">,
          homeHospitalId: p.homeHospitalId as Id<"hospitals">,
          skillIds: p.skillIds as Id<"skills">[],
        })),
      });

      toast.success(`Created ${result.created} providers (${result.skipped} skipped as duplicates)`);
      setIsBulkUpload(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleAddSkill = async (providerId: string, skillId: string) => {
    try {
      await addSkill({
        providerId: providerId as Id<"providers">,
        skillId: skillId as Id<"skills">,
      });
      toast.success("Skill added");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleRemoveSkill = async (providerId: string, skillId: string) => {
    try {
      await removeSkill({
        providerId: providerId as Id<"providers">,
        skillId: skillId as Id<"skills">,
      });
      toast.success("Skill removed");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleStartEdit = (provider: NonNullable<typeof providers>[0]) => {
    setEditFormData({
      firstName: provider.firstName,
      lastName: provider.lastName,
      email: provider.email || "",
      phone: provider.cellPhone || "",
      jobTypeId: provider.jobTypeId,
    });
    setIsEditing(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;

    try {
      await updateProvider({
        providerId: selectedProvider as Id<"providers">,
        firstName: editFormData.firstName,
        lastName: editFormData.lastName,
        email: editFormData.email || undefined,
        cellPhone: editFormData.phone || undefined,
        jobTypeId: editFormData.jobTypeId as Id<"job_types">,
      });
      toast.success("Provider updated");
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleToggleActive = async (providerId: string) => {
    try {
      const result = await toggleActive({
        providerId: providerId as Id<"providers">,
      });
      toast.success(result.isActive ? "Provider activated" : "Provider deactivated");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleAddHospitalAccess = async (providerId: string, hospitalId: string) => {
    try {
      await addHospitalAccess({
        providerId: providerId as Id<"providers">,
        hospitalId: hospitalId as Id<"hospitals">,
      });
      toast.success("Hospital access granted");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleRemoveHospitalAccess = async (providerId: string, hospitalId: string) => {
    try {
      await removeHospitalAccess({
        providerId: providerId as Id<"providers">,
        hospitalId: hospitalId as Id<"hospitals">,
      });
      toast.success("Hospital access removed");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const filteredDepartments = formData.homeHospitalId
    ? departments?.filter((d) => d.hospitalId === formData.homeHospitalId)
    : departments;

  const filteredProviders = providers?.filter((p) => {
    if (selectedHospitalFilter && p.homeHospitalId !== selectedHospitalFilter) return false;
    if (selectedDepartmentFilter && p.homeDepartmentId !== selectedDepartmentFilter) return false;
    return true;
  });

  const selectedProviderData = providers?.find((p) => p._id === selectedProvider);
  const providerSkills = selectedProviderData
    ? skills?.filter((s) => selectedProviderData.skills?.includes(s._id))
    : [];

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/dashboard"
              className="text-slate-400 hover:text-white text-sm mb-2 inline-block"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">Providers</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsBulkUpload(true)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Bulk Upload
            </button>
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              + Add Provider
            </button>
          </div>
        </div>

        {/* Bulk Upload Modal */}
        {isBulkUpload && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Bulk Upload Providers</h2>
            <p className="text-slate-400 mb-4">
              Upload an Excel or CSV file with columns: First Name, Last Name, Email, Phone, Job Type, Hospital, Department, Skills (comma-separated)
            </p>
            <div className="flex gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700"
              />
              <button
                onClick={() => setIsBulkUpload(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Create Provider Form */}
        {isCreating && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Add New Provider</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">First Name</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Job Type</label>
                <select
                  value={formData.jobTypeId}
                  onChange={(e) => setFormData({ ...formData, jobTypeId: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                  required
                >
                  <option value="">Select Job Type</option>
                  {jobTypes?.map((jt) => (
                    <option key={jt._id} value={jt._id}>
                      {jt.name} ({jt.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Home Hospital</label>
                  <select
                    value={formData.homeHospitalId}
                    onChange={(e) => {
                      setFormData({ ...formData, homeHospitalId: e.target.value, homeDepartmentId: "" });
                    }}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    required
                  >
                    <option value="">Select Hospital</option>
                    {hospitals?.map((h) => (
                      <option key={h._id} value={h._id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Home Department</label>
                  <select
                    value={formData.homeDepartmentId}
                    onChange={(e) => setFormData({ ...formData, homeDepartmentId: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    required
                    disabled={!formData.homeHospitalId}
                  >
                    <option value="">Select Department</option>
                    {filteredDepartments?.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  Add Provider
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

        {/* Filter Bar */}
        <div className="flex gap-4 mb-6">
          <select
            value={selectedHospitalFilter}
            onChange={(e) => {
              setSelectedHospitalFilter(e.target.value);
              setSelectedDepartmentFilter("");
            }}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Hospitals</option>
            {hospitals?.map((h) => (
              <option key={h._id} value={h._id}>
                {h.name}
              </option>
            ))}
          </select>
          <select
            value={selectedDepartmentFilter}
            onChange={(e) => setSelectedDepartmentFilter(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
            disabled={!selectedHospitalFilter}
          >
            <option value="">All Departments</option>
            {departments
              ?.filter((d) => !selectedHospitalFilter || d.hospitalId === selectedHospitalFilter)
              .map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
          </select>
          <span className="text-slate-400 self-center">
            {filteredProviders?.length || 0} providers
          </span>
        </div>

        {/* Provider Detail Panel */}
        {selectedProvider && selectedProviderData && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-semibold">
                  {selectedProviderData.firstName} {selectedProviderData.lastName}
                </h2>
                <p className="text-slate-400">{selectedProviderData.email}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleStartEdit(selectedProviderData)}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleToggleActive(selectedProviderData._id)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    selectedProviderData.isActive
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  {selectedProviderData.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => {
                    setSelectedProvider(null);
                    setIsEditing(false);
                  }}
                  className="text-slate-400 hover:text-white px-2"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Edit Form */}
            {isEditing ? (
              <form onSubmit={handleUpdate} className="space-y-4 mb-6 p-4 bg-slate-700/50 rounded-lg">
                <h3 className="font-medium text-lg">Edit Provider</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">First Name</label>
                    <input
                      type="text"
                      value={editFormData.firstName}
                      onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={editFormData.lastName}
                      onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={editFormData.email}
                      onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={editFormData.phone}
                      onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Job Type</label>
                  <select
                    value={editFormData.jobTypeId}
                    onChange={(e) => setEditFormData({ ...editFormData, jobTypeId: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    required
                  >
                    <option value="">Select Job Type</option>
                    {jobTypes?.map((jt) => (
                      <option key={jt._id} value={jt._id}>
                        {jt.name} ({jt.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <span className="text-slate-400 text-sm">Job Type:</span>
                  <p>{jobTypes?.find((jt) => jt._id === selectedProviderData.jobTypeId)?.name}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-sm">Home Hospital:</span>
                  <p>{hospitals?.find((h) => h._id === selectedProviderData.homeHospitalId)?.name}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-sm">Home Department:</span>
                  <p>{departments?.find((d) => d._id === selectedProviderData.homeDepartmentId)?.name}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-sm">Status:</span>
                  <p className={selectedProviderData.isActive ? "text-emerald-400" : "text-red-400"}>
                    {selectedProviderData.isActive ? "Active" : "Inactive"}
                  </p>
                </div>
              </div>
            )}

            {/* Hospital Access Section */}
            <div className="mb-6 p-4 bg-slate-700/30 rounded-lg">
              <h3 className="font-medium mb-3">Hospital Access</h3>
              <p className="text-slate-400 text-sm mb-3">
                Provider can work at these hospitals in addition to their home hospital
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {/* Home hospital is always accessible */}
                <span className="px-3 py-1 bg-emerald-600/50 rounded text-sm flex items-center gap-1">
                  {hospitals?.find((h) => h._id === selectedProviderData.homeHospitalId)?.name}
                  <span className="text-emerald-300 text-xs">(Home)</span>
                </span>
                {/* Additional hospital access */}
                {selectedProviderData.hospitalAccess
                  ?.filter((hId: string) => hId !== selectedProviderData.homeHospitalId)
                  .map((hospitalId: string) => {
                    const hospital = hospitals?.find((h) => h._id === hospitalId);
                    return hospital ? (
                      <span
                        key={hospitalId}
                        className="px-3 py-1 bg-blue-600/50 rounded text-sm flex items-center gap-1"
                      >
                        {hospital.name}
                        <button
                          onClick={() => handleRemoveHospitalAccess(selectedProviderData._id, hospitalId)}
                          className="text-red-400 hover:text-red-300 ml-1"
                        >
                          ×
                        </button>
                      </span>
                    ) : null;
                  })}
              </div>
              <div>
                <label className="text-sm text-slate-400">Grant Access to Hospital:</label>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddHospitalAccess(selectedProviderData._id, e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className="ml-2 px-3 py-1 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Select hospital...</option>
                  {hospitals
                    ?.filter(
                      (h) =>
                        h._id !== selectedProviderData.homeHospitalId &&
                        !selectedProviderData.hospitalAccess?.includes(h._id)
                    )
                    .map((hospital) => (
                      <option key={hospital._id} value={hospital._id}>
                        {hospital.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Skills Section */}
            <div>
              <h3 className="font-medium mb-2">Skills</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {providerSkills?.map((skill) => (
                  <span
                    key={skill._id}
                    className="px-2 py-1 bg-emerald-600/50 rounded text-sm flex items-center gap-1"
                  >
                    {skill.name}
                    <button
                      onClick={() => handleRemoveSkill(selectedProviderData._id, skill._id)}
                      className="text-red-400 hover:text-red-300 ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {providerSkills?.length === 0 && (
                  <span className="text-slate-400 text-sm">No skills assigned</span>
                )}
              </div>
              <div>
                <label className="text-sm text-slate-400">Add Skill:</label>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddSkill(selectedProviderData._id, e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className="ml-2 px-3 py-1 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Select skill...</option>
                  {skills
                    ?.filter((s) => !selectedProviderData.skills?.includes(s._id))
                    .map((skill) => (
                      <option key={skill._id} value={skill._id}>
                        {skill.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Providers List */}
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Job Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Hospital</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Skills</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredProviders === undefined ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : filteredProviders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No providers found
                  </td>
                </tr>
              ) : (
                filteredProviders.map((provider) => (
                  <tr
                    key={provider._id}
                    className="hover:bg-slate-700/50 cursor-pointer"
                    onClick={() => setSelectedProvider(provider._id)}
                  >
                    <td className="px-4 py-3">
                      {provider.firstName} {provider.lastName}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{provider.email}</td>
                    <td className="px-4 py-3">
                      {jobTypes?.find((jt) => jt._id === provider.jobTypeId)?.code}
                    </td>
                    <td className="px-4 py-3">
                      {hospitals?.find((h) => h._id === provider.homeHospitalId)?.shortCode}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-400">{provider.skills?.length || 0} skills</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          provider.isActive ? "bg-emerald-600" : "bg-red-600"
                        }`}
                      >
                        {provider.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
