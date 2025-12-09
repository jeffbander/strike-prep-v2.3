"use client";

import { useState, Suspense, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Id } from "../../../../convex/_generated/dataModel";
import ServiceWizard from "@/components/services/ServiceWizard";
import ServiceEditModal from "@/components/services/ServiceEditModal";
import ServiceStaffingDisplay from "@/components/services/ServiceStaffingDisplay";
import LaborPoolExport from "@/components/laborPool/LaborPoolExport";
import LaborPoolImport from "@/components/laborPool/LaborPoolImport";

function ServicesPageContent() {
  const searchParams = useSearchParams();
  const departmentIdParam = searchParams.get("departmentId");
  const hospitalIdParam = searchParams.get("hospitalId");

  // Filter state
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>(hospitalIdParam || "");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(departmentIdParam || "");

  // Get current user to determine role-based options
  const currentUser = useQuery(api.users.getCurrentUser);
  const hospitals = useQuery(api.hospitals.list, {});
  const departments = useQuery(api.departments.list,
    selectedHospitalId ? { hospitalId: selectedHospitalId as Id<"hospitals"> } : {}
  );

  // Build query args based on filters
  const serviceQueryArgs = useMemo(() => {
    if (selectedDepartmentId) {
      return { departmentId: selectedDepartmentId as Id<"departments"> };
    }
    if (selectedHospitalId) {
      return { hospitalId: selectedHospitalId as Id<"hospitals"> };
    }
    return {};
  }, [selectedDepartmentId, selectedHospitalId]);

  const services = useQuery(api.services.list, serviceQueryArgs);
  const toggleService = useMutation(api.services.toggleActive);

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<Id<"services"> | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // When hospital changes, reset department selection
  const handleHospitalChange = (hospitalId: string) => {
    setSelectedHospitalId(hospitalId);
    setSelectedDepartmentId("");
  };

  const handleToggleActive = async (serviceId: Id<"services">) => {
    try {
      const result = await toggleService({ serviceId });
      toast.success(`Service ${result.isActive ? "activated" : "deactivated"}`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Determine if user can see hospital filter (super_admin, health_system_admin can filter; others have fixed scope)
  const canFilterByHospital = currentUser?.role === "super_admin" || currentUser?.role === "health_system_admin";

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
          </div>
          <button
            onClick={() => setIsWizardOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            + Create Service
          </button>
        </div>

        {/* Filters */}
        <div className="bg-slate-800 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Hospital Filter - shown for super_admin and health_system_admin */}
            {canFilterByHospital && hospitals && hospitals.length > 0 && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Hospital
                </label>
                <select
                  value={selectedHospitalId}
                  onChange={(e) => handleHospitalChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">All Hospitals</option>
                  {hospitals.map((h) => (
                    <option key={h._id} value={h._id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Department Filter - always shown when departments available */}
            {departments && departments.length > 0 && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Department
                </label>
                <select
                  value={selectedDepartmentId}
                  onChange={(e) => setSelectedDepartmentId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">All Departments{selectedHospitalId ? " in Hospital" : ""}</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Clear Filters */}
            {(selectedHospitalId || selectedDepartmentId) && (
              <button
                onClick={() => {
                  setSelectedHospitalId("");
                  setSelectedDepartmentId("");
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Active Filter Summary */}
          {(selectedHospitalId || selectedDepartmentId) && (
            <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
              <p className="text-sm text-slate-400">
                Showing services
                {selectedHospitalId && hospitals && (
                  <> in <span className="text-white">{hospitals.find(h => h._id === selectedHospitalId)?.name}</span></>
                )}
                {selectedDepartmentId && departments && (
                  <> → <span className="text-white">{departments.find(d => d._id === selectedDepartmentId)?.name}</span></>
                )}
              </p>

              {/* Labor Pool Import/Export - only shown when department is selected */}
              {selectedDepartmentId && (
                <div className="flex items-center gap-2">
                  <LaborPoolExport
                    departmentId={selectedDepartmentId as Id<"departments">}
                    departmentName={departments?.find(d => d._id === selectedDepartmentId)?.name || "Department"}
                  />
                  <button
                    onClick={() => setIsImportOpen(true)}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                    Import Labor Pool
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Services List */}
        <div className="space-y-4">
          {services === undefined ? (
            <div className="text-slate-400">Loading...</div>
          ) : services.length === 0 ? (
            <div className="bg-slate-800 rounded-lg p-8 text-center">
              <p className="text-slate-400 mb-4">No services found</p>
              <button
                onClick={() => setIsWizardOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Create Your First Service
              </button>
            </div>
          ) : (
            services.map((service) => {
              const serviceHospital = hospitals?.find((h) => h._id === service.hospitalId);
              const serviceDepartment = departments?.find((d) => d._id === service.departmentId);
              return (
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
                      {!selectedHospitalId && serviceHospital && (
                        <>{serviceHospital.name} → </>
                      )}
                      {serviceDepartment?.name || "Unknown Department"}
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
                      onClick={() => setEditingServiceId(service._id)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
                    >
                      Edit
                    </button>
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
                <div className="grid grid-cols-2 gap-6 text-sm">
                  <ServiceStaffingDisplay serviceId={service._id} />
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium text-white text-sm">Capacity</p>
                      <div className="mt-1 space-y-1 text-slate-400">
                        {service.dayCapacity && <p>Day: {service.dayCapacity} patients</p>}
                        {service.nightCapacity && <p>Night: {service.nightCapacity} patients</p>}
                        {service.weekendCapacity && <p>Weekend: {service.weekendCapacity} patients</p>}
                        {!service.dayCapacity && !service.nightCapacity && !service.weekendCapacity && (
                          <p className="text-slate-500">Not specified</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="font-medium text-white text-sm">Unit</p>
                      <p className="mt-1 text-slate-400">
                        {service.unitId ? "Assigned" : "Not assigned"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
            })
          )}
        </div>

        {/* Service Creation Wizard */}
        <ServiceWizard
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          departmentIdParam={departmentIdParam || undefined}
        />

        {/* Service Edit Modal */}
        {editingServiceId && (
          <ServiceEditModal
            serviceId={editingServiceId}
            isOpen={!!editingServiceId}
            onClose={() => setEditingServiceId(null)}
          />
        )}

        {/* Labor Pool Import Modal */}
        {selectedDepartmentId && (
          <LaborPoolImport
            departmentId={selectedDepartmentId as Id<"departments">}
            isOpen={isImportOpen}
            onClose={() => setIsImportOpen(false)}
          />
        )}
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
