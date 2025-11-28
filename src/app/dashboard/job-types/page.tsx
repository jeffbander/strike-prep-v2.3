"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import Link from "next/link";
import { Id } from "../../../../convex/_generated/dataModel";

export default function JobTypesPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const healthSystems = useQuery(api.healthSystems.list);
  const [selectedHealthSystem, setSelectedHealthSystem] = useState<string>("");

  // Get the health system ID to use for queries
  const healthSystemId =
    selectedHealthSystem ||
    currentUser?.healthSystemId ||
    (healthSystems && healthSystems.length > 0 ? healthSystems[0]._id : undefined);

  const jobTypes = useQuery(
    api.jobTypes.listAll,
    healthSystemId ? { healthSystemId: healthSystemId as Id<"health_systems"> } : "skip"
  );

  const seedDefaults = useMutation(api.jobTypes.seedDefaults);
  const createJobType = useMutation(api.jobTypes.create);
  const updateJobType = useMutation(api.jobTypes.update);
  const toggleActive = useMutation(api.jobTypes.toggleActive);

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
  });

  const canManage =
    currentUser?.role === "super_admin" || currentUser?.role === "health_system_admin";

  const handleSeedDefaults = async () => {
    if (!healthSystemId) {
      toast.error("Please select a health system first");
      return;
    }
    try {
      const result = await seedDefaults({
        healthSystemId: healthSystemId as Id<"health_systems">,
      });
      toast.success(result.message);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!healthSystemId) {
      toast.error("Please select a health system first");
      return;
    }
    try {
      await createJobType({
        healthSystemId: healthSystemId as Id<"health_systems">,
        name: formData.name,
        code: formData.code.toUpperCase(),
        description: formData.description || undefined,
      });
      toast.success(`Job type "${formData.name}" created`);
      setFormData({ name: "", code: "", description: "" });
      setIsCreating(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpdate = async (jobTypeId: Id<"job_types">) => {
    try {
      await updateJobType({
        jobTypeId,
        name: formData.name,
        code: formData.code.toUpperCase(),
        description: formData.description || undefined,
      });
      toast.success("Job type updated");
      setEditingId(null);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleToggleActive = async (jobTypeId: Id<"job_types">) => {
    try {
      const result = await toggleActive({ jobTypeId });
      toast.success(result.isActive ? "Job type activated" : "Job type deactivated");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const startEdit = (jt: any) => {
    setFormData({
      name: jt.name,
      code: jt.code,
      description: jt.description || "",
    });
    setEditingId(jt._id);
  };

  const currentHealthSystemName = healthSystems?.find(
    (hs) => hs._id === healthSystemId
  )?.name;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/dashboard"
              className="text-slate-400 hover:text-white text-sm mb-2 inline-block"
            >
              &larr; Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">Job Types</h1>
            <p className="text-slate-400 text-sm mt-1">
              Provider types available in your health system (MD, NP, PA, etc.)
            </p>
          </div>
          {canManage && (
            <div className="flex gap-2">
              {jobTypes && jobTypes.length === 0 && healthSystemId && (
                <button
                  onClick={handleSeedDefaults}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Seed 6 Defaults
                </button>
              )}
              <button
                onClick={() => setIsCreating(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                + Add Job Type
              </button>
            </div>
          )}
        </div>

        {/* Health System Selector (for super_admin) */}
        {currentUser?.role === "super_admin" && healthSystems && healthSystems.length > 0 && (
          <div className="mb-6">
            <label className="text-sm text-slate-400 mr-2">Health System:</label>
            <select
              value={selectedHealthSystem || healthSystemId || ""}
              onChange={(e) => setSelectedHealthSystem(e.target.value)}
              className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
            >
              {healthSystems.map((hs) => (
                <option key={hs._id} value={hs._id}>
                  {hs.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Current Context */}
        {currentHealthSystemName && (
          <div className="mb-4 text-sm text-slate-400">
            Viewing job types for: <span className="text-white">{currentHealthSystemName}</span>
          </div>
        )}

        {/* Create Form */}
        {isCreating && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Create New Job Type</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    placeholder="e.g., Certified Nursing Assistant"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Code</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500 uppercase"
                    placeholder="e.g., CNA"
                    maxLength={5}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                  placeholder="Brief description"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  Create Job Type
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

        {/* Job Types Table */}
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Code</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Description
                </th>
                <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">
                  Status
                </th>
                {canManage && (
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {jobTypes === undefined ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : !healthSystemId ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Please select a health system to view job types.
                  </td>
                </tr>
              ) : jobTypes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    <p>No job types found for this health system.</p>
                    {canManage && (
                      <button
                        onClick={handleSeedDefaults}
                        className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                      >
                        Seed 6 Default Job Types
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                jobTypes.map((jt) => (
                  <tr key={jt._id} className="hover:bg-slate-700/50">
                    {editingId === jt._id ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) =>
                              setFormData({ ...formData, name: e.target.value })
                            }
                            className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-emerald-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={formData.code}
                            onChange={(e) =>
                              setFormData({ ...formData, code: e.target.value })
                            }
                            className="w-24 px-2 py-1 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-emerald-500 uppercase"
                            maxLength={5}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={formData.description}
                            onChange={(e) =>
                              setFormData({ ...formData, description: e.target.value })
                            }
                            className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-emerald-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">—</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleUpdate(jt._id)}
                            className="text-emerald-400 hover:text-emerald-300 mr-2"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <span className="font-medium">{jt.name}</span>
                          {jt.isDefault && (
                            <span className="ml-2 text-xs text-blue-400">(default)</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-slate-700 rounded font-mono text-sm">
                            {jt.code}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">{jt.description || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              jt.isActive ? "bg-emerald-600" : "bg-red-600"
                            }`}
                          >
                            {jt.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        {canManage && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => startEdit(jt)}
                              className="text-blue-400 hover:text-blue-300 mr-3"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleToggleActive(jt._id)}
                              className={
                                jt.isActive
                                  ? "text-red-400 hover:text-red-300"
                                  : "text-emerald-400 hover:text-emerald-300"
                              }
                            >
                              {jt.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-slate-800/50 rounded-lg">
          <h3 className="font-medium mb-2">About Job Types</h3>
          <p className="text-sm text-slate-400">
            Job types define the provider roles that can be assigned to services. Each health
            system has its own set of job types. The 6 default types are:
          </p>
          <ul className="mt-2 text-sm text-slate-300 space-y-1">
            <li>
              &bull; <strong>MD</strong> - Medical Doctor (Attending Physician)
            </li>
            <li>
              &bull; <strong>NP</strong> - Nurse Practitioner
            </li>
            <li>
              &bull; <strong>PA</strong> - Physician Assistant
            </li>
            <li>
              &bull; <strong>RN</strong> - Registered Nurse
            </li>
            <li>
              &bull; <strong>FEL</strong> - Medical Fellow
            </li>
            <li>
              &bull; <strong>RES</strong> - Medical Resident
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
