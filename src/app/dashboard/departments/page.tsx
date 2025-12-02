"use client";

import { useState, useEffect, Suspense } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Id } from "../../../../convex/_generated/dataModel";

function DepartmentsPageContent() {
  const searchParams = useSearchParams();
  const hospitalIdParam = searchParams.get("hospitalId");

  const hospitals = useQuery(api.hospitals.list, {});
  const departments = useQuery(
    api.departments.list,
    hospitalIdParam ? { hospitalId: hospitalIdParam as Id<"hospitals"> } : {}
  );
  const createDepartment = useMutation(api.departments.create);
  const toggleActive = useMutation(api.departments.toggleActive);

  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    hospitalId: hospitalIdParam || "",
    name: "",
  });

  // Auto-select hospital if only one option (in create form)
  useEffect(() => {
    if (hospitals && hospitals.length === 1 && !formData.hospitalId && isCreating) {
      setFormData((prev) => ({ ...prev, hospitalId: hospitals[0]._id }));
    }
  }, [hospitals, formData.hospitalId, isCreating]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createDepartment({
        hospitalId: formData.hospitalId as Id<"hospitals">,
        name: formData.name,
      });
      toast.success("Department created successfully");
      setFormData({
        hospitalId: hospitalIdParam || "",
        name: "",
      });
      setIsCreating(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleToggleActive = async (deptId: Id<"departments">) => {
    try {
      const result = await toggleActive({ departmentId: deptId });
      toast.success(`Department ${result.isActive ? "activated" : "deactivated"}`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Group departments by hospital
  const departmentsByHospital = departments?.reduce((acc, dept) => {
    const hospitalId = dept.hospitalId;
    if (!acc[hospitalId]) {
      acc[hospitalId] = [];
    }
    acc[hospitalId].push(dept);
    return acc;
  }, {} as Record<string, typeof departments>);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/dashboard" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">Departments</h1>
            {hospitalIdParam && hospitals && (
              <p className="text-slate-400 text-sm mt-1">
                Filtered by hospital: {hospitals.find(h => h._id === hospitalIdParam)?.name}
              </p>
            )}
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            + Add Department
          </button>
        </div>

        {isCreating && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Add New Department</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Hospital</label>
                <select
                  value={formData.hospitalId}
                  onChange={(e) => setFormData({ ...formData, hospitalId: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                  required
                >
                  <option value="">Select Hospital</option>
                  {hospitals?.map((hospital) => (
                    <option key={hospital._id} value={hospital._id}>
                      {hospital.name} ({hospital.shortCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Department Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Interventional Radiology"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  Add Department
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

        <div className="space-y-6">
          {departments === undefined ? (
            <div className="text-slate-400">Loading...</div>
          ) : departments.length === 0 ? (
            <div className="bg-slate-800 rounded-lg p-8 text-center">
              <p className="text-slate-400 mb-4">No departments found</p>
              <button
                onClick={() => setIsCreating(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Add Your First Department
              </button>
            </div>
          ) : hospitalIdParam ? (
            // Show flat list when filtered by hospital
            <div className="space-y-2">
              {departments.map((dept) => (
                <div
                  key={dept._id}
                  className="bg-slate-800 rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{dept.name}</span>
                    {dept.isDefault && (
                      <span className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-400">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        dept.isActive ? "bg-emerald-600" : "bg-red-600"
                      }`}
                    >
                      {dept.isActive ? "Active" : "Inactive"}
                    </span>
                    <button
                      onClick={() => handleToggleActive(dept._id)}
                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
                    >
                      {dept.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <Link
                      href={`/dashboard/services?departmentId=${dept._id}`}
                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
                    >
                      Services →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Group by hospital when not filtered
            Object.entries(departmentsByHospital || {}).map(([hospitalId, depts]) => {
              const hospital = hospitals?.find((h) => h._id === hospitalId);
              return (
                <div key={hospitalId} className="bg-slate-800 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">
                      {hospital?.name || "Unknown Hospital"}
                      <span className="ml-2 text-sm text-slate-400 font-normal">
                        ({depts?.length} departments)
                      </span>
                    </h3>
                    <Link
                      href={`/dashboard/departments?hospitalId=${hospitalId}`}
                      className="text-sm text-emerald-400 hover:text-emerald-300"
                    >
                      View All →
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {depts?.slice(0, 5).map((dept) => (
                      <div
                        key={dept._id}
                        className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <span>{dept.name}</span>
                          {dept.isDefault && (
                            <span className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-400">
                              Default
                            </span>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            dept.isActive ? "bg-emerald-600/50" : "bg-red-600/50"
                          }`}
                        >
                          {dept.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    ))}
                    {depts && depts.length > 5 && (
                      <p className="text-sm text-slate-400 pt-2">
                        +{depts.length - 5} more departments
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function DepartmentsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white p-8 flex items-center justify-center">Loading...</div>}>
      <DepartmentsPageContent />
    </Suspense>
  );
}
