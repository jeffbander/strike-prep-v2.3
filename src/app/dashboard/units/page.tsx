"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import Link from "next/link";
import { Id } from "../../../../convex/_generated/dataModel";

export default function UnitsPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const hospitals = useQuery(api.hospitals.list, {});
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("");

  const units = useQuery(
    api.units.list,
    selectedHospitalId ? { hospitalId: selectedHospitalId as Id<"hospitals"> } : "skip"
  );

  const createUnit = useMutation(api.units.create);
  const updateUnit = useMutation(api.units.update);
  const toggleUnit = useMutation(api.units.toggleActive);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    floorNumber: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedHospitalId) {
      toast.error("Please select a hospital first");
      return;
    }

    try {
      if (editingUnit) {
        await updateUnit({
          unitId: editingUnit._id,
          name: formData.name,
          description: formData.description || undefined,
          floorNumber: formData.floorNumber || undefined,
        });
        toast.success("Unit updated successfully");
      } else {
        await createUnit({
          hospitalId: selectedHospitalId as Id<"hospitals">,
          name: formData.name,
          description: formData.description || undefined,
          floorNumber: formData.floorNumber || undefined,
        });
        toast.success("Unit created successfully");
      }

      setIsModalOpen(false);
      setEditingUnit(null);
      setFormData({ name: "", description: "", floorNumber: "" });
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleEdit = (unit: any) => {
    setEditingUnit(unit);
    setFormData({
      name: unit.name,
      description: unit.description || "",
      floorNumber: unit.floorNumber || "",
    });
    setIsModalOpen(true);
  };

  const handleToggleActive = async (unitId: Id<"units">) => {
    try {
      const result = await toggleUnit({ unitId });
      toast.success(`Unit ${result.isActive ? "activated" : "deactivated"}`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const openCreateModal = () => {
    setEditingUnit(null);
    setFormData({ name: "", description: "", floorNumber: "" });
    setIsModalOpen(true);
  };

  const getHospitalName = (hospitalId: string) =>
    hospitals?.find((h) => h._id === hospitalId)?.name || "Unknown";

  // Check if user has permission
  const canManageUnits =
    currentUser?.role === "super_admin" ||
    currentUser?.role === "health_system_admin" ||
    currentUser?.role === "hospital_admin";

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/dashboard"
              className="text-slate-400 hover:text-white text-sm mb-2 inline-block"
            >
              &larr; Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">Hospital Units</h1>
            <p className="text-slate-400">
              Manage floor units like ICU, 7E, CCU, etc.
            </p>
          </div>
        </div>

        {/* Hospital Selector */}
        <div className="mb-6">
          <label className="block text-sm text-slate-400 mb-2">
            Select Hospital
          </label>
          <select
            value={selectedHospitalId}
            onChange={(e) => setSelectedHospitalId(e.target.value)}
            className="w-full max-w-md px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
          >
            <option value="">Choose a hospital...</option>
            {hospitals?.map((hospital) => (
              <option key={hospital._id} value={hospital._id}>
                {hospital.name} ({hospital.shortCode})
              </option>
            ))}
          </select>
        </div>

        {selectedHospitalId && (
          <>
            {/* Actions */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">
                Units at {getHospitalName(selectedHospitalId)}
              </h2>
              {canManageUnits && (
                <button
                  onClick={openCreateModal}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  + Add Unit
                </button>
              )}
            </div>

            {/* Units Table */}
            <div className="bg-slate-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                      Unit Name
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                      Floor
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                      Status
                    </th>
                    {canManageUnits && (
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {units === undefined ? (
                    <tr>
                      <td
                        colSpan={canManageUnits ? 5 : 4}
                        className="px-4 py-8 text-center text-slate-400"
                      >
                        Loading...
                      </td>
                    </tr>
                  ) : units.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canManageUnits ? 5 : 4}
                        className="px-4 py-8 text-center text-slate-400"
                      >
                        No units found. Create one to get started.
                      </td>
                    </tr>
                  ) : (
                    units.map((unit) => (
                      <tr key={unit._id} className="hover:bg-slate-700/50">
                        <td className="px-4 py-3 font-medium">{unit.name}</td>
                        <td className="px-4 py-3 text-slate-400">
                          {unit.floorNumber || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {unit.description || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              unit.isActive
                                ? "bg-emerald-600/50 text-emerald-300"
                                : "bg-red-600/50 text-red-300"
                            }`}
                          >
                            {unit.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        {canManageUnits && (
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEdit(unit)}
                                className="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded text-sm transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleToggleActive(unit._id)}
                                className={`px-3 py-1 rounded text-sm transition-colors ${
                                  unit.isActive
                                    ? "bg-amber-600 hover:bg-amber-700"
                                    : "bg-emerald-600 hover:bg-emerald-700"
                                }`}
                              >
                                {unit.isActive ? "Deactivate" : "Activate"}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!selectedHospitalId && (
          <div className="bg-slate-800 rounded-lg p-8 text-center">
            <p className="text-slate-400">
              Select a hospital above to view and manage its units.
            </p>
          </div>
        )}

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4">
                {editingUnit ? "Edit Unit" : "Create Unit"}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Unit Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., ICU, 7E, CCU"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Floor Number
                  </label>
                  <input
                    type="text"
                    value={formData.floorNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, floorNumber: e.target.value })
                    }
                    placeholder="e.g., 7, 3, B1"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Optional description"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    rows={3}
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setEditingUnit(null);
                    }}
                    className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                  >
                    {editingUnit ? "Update" : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
