"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import Link from "next/link";
import { Id } from "../../../../convex/_generated/dataModel";
import * as XLSX from "xlsx";
import ProviderImport from "@/components/providers/ProviderImport";
import ProviderExport from "@/components/providers/ProviderExport";

export default function ProvidersPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const healthSystems = useQuery(api.healthSystems.list, {});
  const hospitals = useQuery(api.hospitals.list, {});
  const departments = useQuery(api.departments.list, {});
  const skills = useQuery(api.skills.list, {});
  const createProvider = useMutation(api.providers.create);
  const bulkCreateProviders = useMutation(api.providers.bulkCreateWithIds);
  const bulkCreateFromCSV = useMutation(api.providers.bulkCreate);
  const addSkill = useMutation(api.providers.addSkill);
  const removeSkill = useMutation(api.providers.removeSkill);
  const updateProvider = useMutation(api.providers.update);
  const toggleActive = useMutation(api.providers.toggleActive);
  const addHospitalAccess = useMutation(api.providers.addHospitalAccess);
  const removeHospitalAccess = useMutation(api.providers.removeHospitalAccess);
  const sendSMS = useAction(api.sms.sendSMS);
  const sendBulkSMS = useAction(api.sms.sendBulkSMS);

  const [isCreating, setIsCreating] = useState(false);
  const [isSendingSMS, setIsSendingSMS] = useState(false);
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [smsMessageType, setSmsMessageType] = useState<"coverage_request" | "shift_confirmation" | "custom">("coverage_request");
  const [smsCustomMessage, setSmsCustomMessage] = useState("");
  const [selectedProviderIds, setSelectedProviderIds] = useState<Set<string>>(new Set());
  const [isBulkUpload, setIsBulkUpload] = useState(false);
  const [isCSVUpload, setIsCSVUpload] = useState(false);
  const [isNewImportOpen, setIsNewImportOpen] = useState(false);
  const [selectedHealthSystemForImport, setSelectedHealthSystemForImport] = useState<string>("");
  const [csvUploadDepartmentId, setCSVUploadDepartmentId] = useState("");
  const [csvPreviewData, setCSVPreviewData] = useState<any[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedHospitalFilter, setSelectedHospitalFilter] = useState("");
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const isSuperAdmin = currentUser?.role === "super_admin";
  const needsHealthSystemSelection = isSuperAdmin && !currentUser?.healthSystemId;

  // For super_admin without healthSystemId, use the selected one. Otherwise use user's healthSystemId.
  const effectiveHealthSystemId = currentUser?.healthSystemId || (selectedHealthSystemForImport as Id<"health_systems"> | undefined);

  // Queries that depend on effectiveHealthSystemId (requires state to be defined first)
  const jobTypes = useQuery(
    api.jobTypes.list,
    effectiveHealthSystemId ? { healthSystemId: effectiveHealthSystemId } : "skip"
  );
  const providers = useQuery(
    api.providers.list,
    effectiveHealthSystemId ? { healthSystemId: effectiveHealthSystemId } : {}
  );

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

  // PRD-specified 12-column CSV format handler
  const handleCSVFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      // Map the 12-column PRD format
      // Role,Last Name,First Name,Life #,Employee Cell #,Current Schedule (days),Current Schedule[Time],Home Site,Home Department,If APP Supervising MD/Collaborating MD,Does NP/PA have specialty certification? If yes name certification,Previous experience if known
      const mappedData = jsonData.map((row, index) => ({
        rowNum: index + 2, // +2 for 1-indexed and header row
        role: row["Role"] || row["role"] || "",
        lastName: row["Last Name"] || row["lastName"] || "",
        firstName: row["First Name"] || row["firstName"] || "",
        employeeId: row["Life #"] || row["employeeId"] || row["Employee ID"] || "",
        cellPhone: row["Employee Cell #"] || row["cellPhone"] || row["Phone"] || "",
        scheduleDays: row["Current Schedule (days)"] || row["scheduleDays"] || "",
        scheduleTime: row["Current Schedule[Time]"] || row["scheduleTime"] || "",
        homeSite: row["Home Site"] || row["homeSite"] || "",
        homeDepartment: row["Home Department"] || row["homeDepartment"] || "",
        supervisingMD: row["If APP Supervising MD/Collaborating MD"] || row["supervisingMD"] || "",
        certification: row["Does NP/PA have specialty certification? If yes name certification"] || row["certification"] || "",
        experience: row["Previous experience if known"] || row["experience"] || "",
      }));

      // Filter out empty rows
      const validRows = mappedData.filter(
        (row) => row.role && row.lastName && row.firstName && row.homeSite && row.homeDepartment
      );

      if (validRows.length === 0) {
        toast.error("No valid rows found. Ensure columns match the expected format.");
        return;
      }

      setCSVPreviewData(validRows);
    } catch (error: any) {
      toast.error(`Failed to parse file: ${error.message}`);
    }
  };

  const handleCSVUploadConfirm = async () => {
    if (!csvPreviewData || !csvUploadDepartmentId) {
      toast.error("Please select a department and upload a file first.");
      return;
    }

    setIsUploading(true);

    try {
      const result = await bulkCreateFromCSV({
        departmentId: csvUploadDepartmentId as Id<"departments">,
        providers: csvPreviewData.map((row) => ({
          role: row.role,
          lastName: row.lastName,
          firstName: row.firstName,
          employeeId: row.employeeId || undefined,
          cellPhone: row.cellPhone || undefined,
          scheduleDays: row.scheduleDays || undefined,
          scheduleTime: row.scheduleTime || undefined,
          homeSite: row.homeSite,
          homeDepartment: row.homeDepartment,
          supervisingMD: row.supervisingMD || undefined,
          certification: row.certification || undefined,
          experience: row.experience || undefined,
        })),
      });

      const successMessage = `Created ${result.created} providers`;
      const errorMessage = result.errors.length > 0 ? ` (${result.errors.length} errors)` : "";
      toast.success(successMessage + errorMessage);

      if (result.errors.length > 0) {
        console.log("Upload errors:", result.errors);
      }

      // Reset state
      setIsCSVUpload(false);
      setCSVPreviewData(null);
      setCSVUploadDepartmentId("");
      if (csvFileInputRef.current) {
        csvFileInputRef.current.value = "";
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsUploading(false);
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

  // SMS Handlers
  const handleSendSingleSMS = async (providerId: string) => {
    if (!providerId) return;

    setIsSendingSMS(true);
    try {
      await sendSMS({
        providerId: providerId as Id<"providers">,
        messageType: smsMessageType,
        customMessage: smsMessageType === "custom" ? smsCustomMessage : undefined,
      });
      toast.success("SMS sent successfully");
      setSmsModalOpen(false);
      setSmsCustomMessage("");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSendingSMS(false);
    }
  };

  const handleSendBulkSMS = async () => {
    if (selectedProviderIds.size === 0) {
      toast.error("No providers selected");
      return;
    }

    setIsSendingSMS(true);
    try {
      const result = await sendBulkSMS({
        providerIds: Array.from(selectedProviderIds) as Id<"providers">[],
        messageType: smsMessageType,
        customMessage: smsMessageType === "custom" ? smsCustomMessage : undefined,
      });
      toast.success(`SMS sent: ${result.sent} successful, ${result.failed} failed`);
      setSmsModalOpen(false);
      setSelectedProviderIds(new Set());
      setSmsCustomMessage("");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSendingSMS(false);
    }
  };

  const toggleProviderSelection = (providerId: string) => {
    const newSet = new Set(selectedProviderIds);
    if (newSet.has(providerId)) {
      newSet.delete(providerId);
    } else {
      newSet.add(providerId);
    }
    setSelectedProviderIds(newSet);
  };

  const selectAllProviders = () => {
    if (filteredProviders) {
      const allIds = filteredProviders.filter(p => p.cellPhone).map(p => p._id);
      setSelectedProviderIds(new Set(allIds));
    }
  };

  const clearSelection = () => {
    setSelectedProviderIds(new Set());
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
          <div className="flex gap-2 items-center">
            {/* Health System Selector for super_admin */}
            {needsHealthSystemSelection && (
              <select
                value={selectedHealthSystemForImport}
                onChange={(e) => setSelectedHealthSystemForImport(e.target.value)}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Select Health System...</option>
                {healthSystems?.map((hs) => (
                  <option key={hs._id} value={hs._id}>
                    {hs.name}
                  </option>
                ))}
              </select>
            )}
            {effectiveHealthSystemId && (
              <>
                <ProviderExport
                  healthSystemId={effectiveHealthSystemId}
                  hospitalId={selectedHospitalFilter as Id<"hospitals"> || undefined}
                  departmentId={selectedDepartmentFilter as Id<"departments"> || undefined}
                  scopeName={
                    selectedDepartmentFilter
                      ? departments?.find((d) => d._id === selectedDepartmentFilter)?.name || "Providers"
                      : selectedHospitalFilter
                      ? hospitals?.find((h) => h._id === selectedHospitalFilter)?.name || "Providers"
                      : "All_Providers"
                  }
                />
                <button
                  onClick={() => setIsNewImportOpen(true)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Import Providers
                </button>
              </>
            )}
            <button
              onClick={() => setIsCSVUpload(true)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm"
            >
              Legacy CSV
            </button>
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              + Add Provider
            </button>
          </div>
        </div>

        {/* CSV Upload Modal (12-column PRD format) */}
        {isCSVUpload && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-semibold">CSV Upload (12-Column Format)</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Upload providers using the standard 12-column format from the PRD
                </p>
              </div>
              <button
                onClick={() => {
                  setIsCSVUpload(false);
                  setCSVPreviewData(null);
                  setCSVUploadDepartmentId("");
                }}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Format Guide */}
            <div className="bg-slate-700/50 rounded p-4 mb-4">
              <h3 className="text-sm font-medium mb-2">Expected CSV Columns:</h3>
              <p className="text-xs text-slate-400 font-mono break-all">
                Role, Last Name, First Name, Life #, Employee Cell #, Current Schedule (days), Current Schedule[Time], Home Site, Home Department, If APP Supervising MD/Collaborating MD, Does NP/PA have specialty certification? If yes name certification, Previous experience if known
              </p>
              <p className="text-xs text-slate-400 mt-2">
                <strong>Required:</strong> Role, Last Name, First Name, Home Site, Home Department
              </p>
            </div>

            {/* Department Selection */}
            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-1">Target Department (for scope validation)</label>
              <select
                value={csvUploadDepartmentId}
                onChange={(e) => setCSVUploadDepartmentId(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="">Select Department...</option>
                {departments?.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name} ({hospitals?.find((h) => h._id === d.hospitalId)?.shortCode})
                  </option>
                ))}
              </select>
            </div>

            {/* File Upload */}
            <div className="mb-4">
              <input
                ref={csvFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleCSVFileSelect}
                className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
            </div>

            {/* Preview Table */}
            {csvPreviewData && csvPreviewData.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium mb-2">Preview ({csvPreviewData.length} rows)</h3>
                <div className="max-h-64 overflow-auto rounded border border-slate-600">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-700 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">#</th>
                        <th className="px-2 py-1 text-left">Role</th>
                        <th className="px-2 py-1 text-left">Name</th>
                        <th className="px-2 py-1 text-left">Home Site</th>
                        <th className="px-2 py-1 text-left">Department</th>
                        <th className="px-2 py-1 text-left">Schedule</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {csvPreviewData.slice(0, 10).map((row, i) => (
                        <tr key={i} className="hover:bg-slate-700/50">
                          <td className="px-2 py-1 text-slate-400">{row.rowNum}</td>
                          <td className="px-2 py-1">{row.role}</td>
                          <td className="px-2 py-1">{row.firstName} {row.lastName}</td>
                          <td className="px-2 py-1">{row.homeSite}</td>
                          <td className="px-2 py-1">{row.homeDepartment}</td>
                          <td className="px-2 py-1 text-slate-400 text-xs">
                            {row.scheduleDays} {row.scheduleTime}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvPreviewData.length > 10 && (
                  <p className="text-slate-400 text-xs mt-1">
                    Showing 10 of {csvPreviewData.length} rows
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleCSVUploadConfirm}
                disabled={!csvPreviewData || !csvUploadDepartmentId || isUploading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {isUploading ? "Uploading..." : `Upload ${csvPreviewData?.length || 0} Providers`}
              </button>
              <button
                onClick={() => {
                  setIsCSVUpload(false);
                  setCSVPreviewData(null);
                  setCSVUploadDepartmentId("");
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Quick Bulk Upload Modal */}
        {isBulkUpload && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Quick Bulk Upload</h2>
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
        <div className="flex flex-wrap gap-4 mb-6 items-center">
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
          <span className="text-slate-400">
            {filteredProviders?.length || 0} providers
          </span>

          {/* Bulk SMS Controls */}
          <div className="flex-1" />
          {selectedProviderIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-purple-400 text-sm">
                {selectedProviderIds.size} selected
              </span>
              <button
                onClick={clearSelection}
                className="text-slate-400 hover:text-white text-sm"
              >
                Clear
              </button>
              <button
                onClick={() => setSmsModalOpen(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                Send SMS to {selectedProviderIds.size}
              </button>
            </div>
          )}
          {selectedProviderIds.size === 0 && (
            <button
              onClick={selectAllProviders}
              className="text-slate-400 hover:text-white text-sm"
            >
              Select all with phone
            </button>
          )}
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
                {selectedProviderData.cellPhone && (
                  <button
                    onClick={() => {
                      setSmsModalOpen(true);
                      setSelectedProviderIds(new Set([selectedProviderData._id]));
                    }}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm transition-colors flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    SMS
                  </button>
                )}
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
                <th className="px-2 py-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={
                      (filteredProviders?.filter(p => p.cellPhone).length ?? 0) > 0 &&
                      (filteredProviders?.filter(p => p.cellPhone).every(p => selectedProviderIds.has(p._id)) ?? false)
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        selectAllProviders();
                      } else {
                        clearSelection();
                      }
                    }}
                    className="rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Phone</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Job Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Hospital</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredProviders === undefined ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : filteredProviders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No providers found
                  </td>
                </tr>
              ) : (
                filteredProviders.map((provider) => (
                  <tr
                    key={provider._id}
                    className={`hover:bg-slate-700/50 cursor-pointer ${selectedProviderIds.has(provider._id) ? "bg-purple-900/20" : ""}`}
                    onClick={() => setSelectedProvider(provider._id)}
                  >
                    <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {provider.cellPhone ? (
                        <input
                          type="checkbox"
                          checked={selectedProviderIds.has(provider._id)}
                          onChange={() => toggleProviderSelection(provider._id)}
                          className="rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
                        />
                      ) : (
                        <span className="text-slate-600 text-xs">No phone</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {provider.firstName} {provider.lastName}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm">
                      {provider.cellPhone || <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {jobTypes?.find((jt) => jt._id === provider.jobTypeId)?.code}
                    </td>
                    <td className="px-4 py-3">
                      {hospitals?.find((h) => h._id === provider.homeHospitalId)?.shortCode}
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

        {/* New Provider Import Modal */}
        {effectiveHealthSystemId && (
          <ProviderImport
            healthSystemId={effectiveHealthSystemId}
            isOpen={isNewImportOpen}
            onClose={() => setIsNewImportOpen(false)}
          />
        )}

        {/* SMS Modal */}
        {smsModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  Send SMS
                </h2>
                <button
                  onClick={() => {
                    setSmsModalOpen(false);
                    setSmsCustomMessage("");
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4">
                <p className="text-slate-400 text-sm mb-2">
                  Sending to <span className="text-purple-400 font-medium">{selectedProviderIds.size}</span> provider{selectedProviderIds.size !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-slate-400 mb-2">Message Type</label>
                <select
                  value={smsMessageType}
                  onChange={(e) => setSmsMessageType(e.target.value as typeof smsMessageType)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-purple-500"
                >
                  <option value="coverage_request">Coverage Request</option>
                  <option value="shift_confirmation">Shift Confirmation</option>
                  <option value="custom">Custom Message</option>
                </select>
              </div>

              {smsMessageType === "coverage_request" && (
                <div className="mb-4 p-3 bg-slate-700/50 rounded-lg text-sm text-slate-300">
                  <p className="font-medium mb-1">Preview:</p>
                  <p className="italic">
                    &quot;Hi [Name], we have strike coverage shifts available. Reply YES if you&apos;re interested in picking up extra shifts, or call us for more details.&quot;
                  </p>
                </div>
              )}

              {smsMessageType === "shift_confirmation" && (
                <div className="mb-4 p-3 bg-slate-700/50 rounded-lg text-sm text-slate-300">
                  <p className="font-medium mb-1">Preview:</p>
                  <p className="italic">
                    &quot;Hi [Name], this is a confirmation of your assigned shift. Please reply CONFIRM to acknowledge receipt.&quot;
                  </p>
                </div>
              )}

              {smsMessageType === "custom" && (
                <div className="mb-4">
                  <label className="block text-sm text-slate-400 mb-2">Custom Message</label>
                  <textarea
                    value={smsCustomMessage}
                    onChange={(e) => setSmsCustomMessage(e.target.value)}
                    placeholder="Enter your message..."
                    rows={4}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-purple-500 resize-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {smsCustomMessage.length}/160 characters (standard SMS)
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setSmsModalOpen(false);
                    setSmsCustomMessage("");
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (selectedProviderIds.size === 1) {
                      handleSendSingleSMS(Array.from(selectedProviderIds)[0]);
                    } else {
                      handleSendBulkSMS();
                    }
                  }}
                  disabled={isSendingSMS || (smsMessageType === "custom" && !smsCustomMessage.trim())}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
                >
                  {isSendingSMS ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Sending...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Send SMS
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
