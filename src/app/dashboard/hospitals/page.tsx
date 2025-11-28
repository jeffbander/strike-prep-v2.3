"use client";

import { useState, Suspense } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Id } from "../../../../convex/_generated/dataModel";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
];

function HospitalsPageContent() {
  const searchParams = useSearchParams();
  const healthSystemIdParam = searchParams.get("healthSystemId");

  const healthSystems = useQuery(api.healthSystems.list);
  const hospitals = useQuery(api.hospitals.list,
    healthSystemIdParam ? { healthSystemId: healthSystemIdParam as Id<"health_systems"> } : {}
  );
  const createHospital = useMutation(api.hospitals.create);

  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    healthSystemId: healthSystemIdParam || "",
    name: "",
    shortCode: "",
    timezone: "America/New_York",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const result = await createHospital({
        healthSystemId: formData.healthSystemId as Id<"health_systems">,
        name: formData.name,
        shortCode: formData.shortCode,
        timezone: formData.timezone,
        address: formData.address || undefined,
        city: formData.city || undefined,
        state: formData.state || undefined,
        zipCode: formData.zipCode || undefined,
      });
      toast.success(`Hospital created with ${result.departmentsCreated} default departments`);
      setFormData({
        healthSystemId: healthSystemIdParam || "",
        name: "",
        shortCode: "",
        timezone: "America/New_York",
        address: "",
        city: "",
        state: "",
        zipCode: "",
      });
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
            <h1 className="text-3xl font-bold">Hospitals</h1>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            + Create Hospital
          </button>
        </div>

        {isCreating && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Create New Hospital</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Health System</label>
                <select
                  value={formData.healthSystemId}
                  onChange={(e) => setFormData({ ...formData, healthSystemId: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                  required
                >
                  <option value="">Select Health System</option>
                  {healthSystems?.map((hs) => (
                    <option key={hs._id} value={hs._id}>{hs.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Hospital Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Mount Sinai Hospital"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Short Code (2-5 letters)</label>
                  <input
                    type="text"
                    value={formData.shortCode}
                    onChange={(e) => setFormData({ ...formData, shortCode: e.target.value.toUpperCase() })}
                    placeholder="e.g., MSH"
                    maxLength={5}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Timezone</label>
                <select
                  value={formData.timezone}
                  onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Address (optional)</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">State</label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                    maxLength={2}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">ZIP Code</label>
                  <input
                    type="text"
                    value={formData.zipCode}
                    onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  Create Hospital
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
              This will also create 20 default departments (Cardiology, Neurosurgery, etc.)
            </p>
          </div>
        )}

        <div className="space-y-4">
          {hospitals === undefined ? (
            <div className="text-slate-400">Loading...</div>
          ) : hospitals.length === 0 ? (
            <div className="bg-slate-800 rounded-lg p-8 text-center">
              <p className="text-slate-400 mb-4">No hospitals yet</p>
              <button
                onClick={() => setIsCreating(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Create Your First Hospital
              </button>
            </div>
          ) : (
            hospitals.map((hospital) => (
              <div key={hospital._id} className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-semibold">{hospital.name}</h3>
                      <span className="px-2 py-1 bg-slate-700 rounded text-sm font-mono">
                        {hospital.shortCode}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">
                      {hospital.city && hospital.state ? `${hospital.city}, ${hospital.state}` : hospital.timezone}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        hospital.isActive ? "bg-emerald-600" : "bg-red-600"
                      }`}
                    >
                      {hospital.isActive ? "Active" : "Inactive"}
                    </span>
                    <Link
                      href={`/dashboard/departments?hospitalId=${hospital._id}`}
                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
                    >
                      Departments →
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

export default function HospitalsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900 text-white p-8 flex items-center justify-center">Loading...</div>}>
      <HospitalsPageContent />
    </Suspense>
  );
}
