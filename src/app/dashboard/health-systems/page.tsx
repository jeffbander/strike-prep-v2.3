"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import Link from "next/link";

export default function HealthSystemsPage() {
  const healthSystems = useQuery(api.healthSystems.list);
  const createHealthSystem = useMutation(api.healthSystems.create);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      const result = await createHealthSystem({ name: newName.trim() });
      toast.success(`Health System created with ${result.jobTypesCreated} default job types`);
      setNewName("");
      setIsCreating(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/dashboard" className="text-slate-400 hover:text-white text-sm mb-2 inline-block">
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">Health Systems</h1>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            + Create Health System
          </button>
        </div>

        {isCreating && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Create New Health System</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Mount Sinai Health System"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  Create
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
            <p className="text-sm text-slate-400 mt-4">
              This will also create 6 default job types (MD, NP, PA, RN, Fellow, Resident)
            </p>
          </div>
        )}

        <div className="space-y-4">
          {healthSystems === undefined ? (
            <div className="text-slate-400">Loading...</div>
          ) : healthSystems.length === 0 ? (
            <div className="bg-slate-800 rounded-lg p-8 text-center">
              <p className="text-slate-400 mb-4">No health systems yet</p>
              <button
                onClick={() => setIsCreating(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Create Your First Health System
              </button>
            </div>
          ) : (
            healthSystems.map((hs) => (
              <div key={hs._id} className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">{hs.name}</h3>
                    <p className="text-sm text-slate-400">Slug: {hs.slug}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        hs.isActive ? "bg-emerald-600" : "bg-red-600"
                      }`}
                    >
                      {hs.isActive ? "Active" : "Inactive"}
                    </span>
                    <Link
                      href={`/dashboard/hospitals?healthSystemId=${hs._id}`}
                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
                    >
                      View Hospitals →
                    </Link>
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
