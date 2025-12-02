"use client";

import { useState, Suspense } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Id } from "../../../../convex/_generated/dataModel";
import ServiceWizard from "@/components/services/ServiceWizard";
import ServiceEditModal from "@/components/services/ServiceEditModal";
import ServiceStaffingDisplay from "@/components/services/ServiceStaffingDisplay";

function ServicesPageContent() {
  const searchParams = useSearchParams();
  const departmentIdParam = searchParams.get("departmentId");

  const departments = useQuery(api.departments.list, {});
  const services = useQuery(
    api.services.list,
    departmentIdParam ? { departmentId: departmentIdParam as Id<"departments"> } : {}
  );
  const jobTypes = useQuery(api.jobTypes.list, {});
  const toggleService = useMutation(api.services.toggleActive);

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<Id<"services"> | null>(null);

  const handleToggleActive = async (serviceId: Id<"services">) => {
    try {
      const result = await toggleService({ serviceId });
      toast.success(`Service ${result.isActive ? "activated" : "deactivated"}`);
    } catch (error: any) {
      toast.error(error.message);
    }
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
            onClick={() => setIsWizardOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            + Create Service
          </button>
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
            ))
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
