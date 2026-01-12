"use client";

import { useUser, SignOutButton } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const { user, isLoaded: clerkLoaded } = useUser();
  const [syncError, setSyncError] = useState<string | null>(null);

  // Sync user to Convex when they load
  const syncUser = useMutation(api.users.syncUser);
  const currentUser = useQuery(api.users.getCurrentUser);

  useEffect(() => {
    if (clerkLoaded && user) {
      syncUser({
        clerkId: user.id,
        email: user.primaryEmailAddress?.emailAddress || "",
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        imageUrl: user.imageUrl || undefined,
      }).catch((error) => {
        console.error("Failed to sync user:", error);
        setSyncError(error.message);
      });
    }
  }, [clerkLoaded, user, syncUser]);

  if (!clerkLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (syncError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="bg-slate-800 rounded-lg p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold text-red-500 mb-4">Access Denied</h2>
          <p className="text-slate-300 mb-6">{syncError}</p>
          <SignOutButton>
            <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white">
              Sign Out
            </button>
          </SignOutButton>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white">Loading user data...</div>
      </div>
    );
  }

  return (
    <div className="p-8 text-white">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Welcome Back</h1>

        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Your Profile</h2>
          <div className="space-y-2">
            <p><span className="text-slate-400">Email:</span> {currentUser.email}</p>
            <p><span className="text-slate-400">Name:</span> {currentUser.firstName} {currentUser.lastName}</p>
            <p>
              <span className="text-slate-400">Role:</span>
              <span className="ml-2 px-2 py-1 bg-emerald-600 rounded text-sm">
                {currentUser.role.replace(/_/g, " ").toUpperCase()}
              </span>
            </p>
          </div>
        </div>

        {/* Role-specific content */}
        {currentUser.role === "super_admin" && <SuperAdminDashboard />}
        {currentUser.role === "health_system_admin" && <HealthSystemAdminDashboard />}
        {currentUser.role === "hospital_admin" && <HospitalAdminDashboard />}
        {currentUser.role === "departmental_admin" && <DeptAdminDashboard />}
      </div>
    </div>
  );
}

function SuperAdminDashboard() {
  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Super Admin Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a href="/dashboard/scenarios" className="block p-4 bg-amber-700 hover:bg-amber-600 rounded-lg transition-colors">
            <h3 className="font-medium">Strike Scenarios</h3>
            <p className="text-sm text-amber-200">Plan and manage strike coverage scenarios</p>
          </a>
          <a href="/dashboard/health-systems" className="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
            <h3 className="font-medium">Manage Health Systems</h3>
            <p className="text-sm text-slate-400">Create and configure health systems</p>
          </a>
          <a href="/dashboard/users" className="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
            <h3 className="font-medium">Manage Users</h3>
            <p className="text-sm text-slate-400">Invite and manage admin users</p>
          </a>
          <a href="/dashboard/coverage" className="block p-4 bg-emerald-700 hover:bg-emerald-600 rounded-lg transition-colors">
            <h3 className="font-medium">Coverage Dashboard</h3>
            <p className="text-sm text-emerald-200">View real-time coverage metrics and analytics</p>
          </a>
          <a href="/dashboard/availability" className="block p-4 bg-blue-700 hover:bg-blue-600 rounded-lg transition-colors">
            <h3 className="font-medium">Provider Availability</h3>
            <p className="text-sm text-blue-200">Manage provider availability for scenarios</p>
          </a>
          <a href="/dashboard/audit-logs" className="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
            <h3 className="font-medium">Audit Logs</h3>
            <p className="text-sm text-slate-400">View system activity and changes</p>
          </a>
          <a href="/dashboard/census" className="block p-4 bg-blue-700 hover:bg-blue-600 rounded-lg transition-colors">
            <h3 className="font-medium">Patient Census</h3>
            <p className="text-sm text-blue-200">Import census data and view LOS predictions</p>
          </a>
          <a href="/dashboard/procedures" className="block p-4 bg-violet-700 hover:bg-violet-600 rounded-lg transition-colors">
            <h3 className="font-medium">Procedure Schedule</h3>
            <p className="text-sm text-violet-200">Import cath/EP procedures and view bed forecasts</p>
          </a>
        </div>
      </div>
    </div>
  );
}

function HealthSystemAdminDashboard() {
  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Health System Admin Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a href="/dashboard/scenarios" className="block p-4 bg-amber-700 hover:bg-amber-600 rounded-lg transition-colors">
            <h3 className="font-medium">Strike Scenarios</h3>
            <p className="text-sm text-amber-200">Plan and manage strike coverage scenarios</p>
          </a>
          <a href="/dashboard/hospitals" className="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
            <h3 className="font-medium">Manage Hospitals</h3>
            <p className="text-sm text-slate-400">Create and configure hospitals</p>
          </a>
          <a href="/dashboard/job-types" className="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
            <h3 className="font-medium">Manage Job Types</h3>
            <p className="text-sm text-slate-400">Configure provider job types</p>
          </a>
          <a href="/dashboard/coverage" className="block p-4 bg-emerald-700 hover:bg-emerald-600 rounded-lg transition-colors">
            <h3 className="font-medium">Coverage Dashboard</h3>
            <p className="text-sm text-emerald-200">View real-time coverage metrics and analytics</p>
          </a>
          <a href="/dashboard/availability" className="block p-4 bg-blue-700 hover:bg-blue-600 rounded-lg transition-colors">
            <h3 className="font-medium">Provider Availability</h3>
            <p className="text-sm text-blue-200">Manage provider availability for scenarios</p>
          </a>
          <a href="/dashboard/audit-logs" className="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
            <h3 className="font-medium">Audit Logs</h3>
            <p className="text-sm text-slate-400">View system activity and changes</p>
          </a>
          <a href="/dashboard/census" className="block p-4 bg-blue-700 hover:bg-blue-600 rounded-lg transition-colors">
            <h3 className="font-medium">Patient Census</h3>
            <p className="text-sm text-blue-200">Import census data and view LOS predictions</p>
          </a>
          <a href="/dashboard/procedures" className="block p-4 bg-violet-700 hover:bg-violet-600 rounded-lg transition-colors">
            <h3 className="font-medium">Procedure Schedule</h3>
            <p className="text-sm text-violet-200">Import cath/EP procedures and view bed forecasts</p>
          </a>
        </div>
      </div>
    </div>
  );
}

function HospitalAdminDashboard() {
  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Hospital Admin Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a href="/dashboard/departments" className="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
            <h3 className="font-medium">Manage Departments</h3>
            <p className="text-sm text-slate-400">Configure hospital departments</p>
          </a>
          <a href="/dashboard/units" className="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
            <h3 className="font-medium">Manage Units</h3>
            <p className="text-sm text-slate-400">Configure hospital floor units</p>
          </a>
          <a href="/dashboard/users" className="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
            <h3 className="font-medium">Manage Dept Admins</h3>
            <p className="text-sm text-slate-400">Assign departmental administrators</p>
          </a>
          <a href="/dashboard/coverage" className="block p-4 bg-emerald-700 hover:bg-emerald-600 rounded-lg transition-colors">
            <h3 className="font-medium">Coverage Dashboard</h3>
            <p className="text-sm text-emerald-200">View coverage metrics</p>
          </a>
        </div>
      </div>
    </div>
  );
}

function DeptAdminDashboard() {
  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Department Admin Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a href="/dashboard/scenarios" className="block p-4 bg-amber-700 hover:bg-amber-600 rounded-lg transition-colors">
            <h3 className="font-medium">Strike Scenarios</h3>
            <p className="text-sm text-amber-200">Plan and manage strike coverage scenarios</p>
          </a>
          <a href="/dashboard/services" className="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
            <h3 className="font-medium">Manage Services</h3>
            <p className="text-sm text-slate-400">Create and configure services</p>
          </a>
          <a href="/dashboard/providers" className="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
            <h3 className="font-medium">Manage Providers</h3>
            <p className="text-sm text-slate-400">Add and manage provider staff</p>
          </a>
          <a href="/dashboard/availability" className="block p-4 bg-blue-700 hover:bg-blue-600 rounded-lg transition-colors">
            <h3 className="font-medium">Provider Availability</h3>
            <p className="text-sm text-blue-200">Manage provider availability for scenarios</p>
          </a>
          <a href="/dashboard/matching" className="block p-4 bg-emerald-700 hover:bg-emerald-600 rounded-lg transition-colors">
            <h3 className="font-medium">Start Matching</h3>
            <p className="text-sm text-emerald-200">Match providers to open positions</p>
          </a>
          <a href="/dashboard/coverage" className="block p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
            <h3 className="font-medium">Coverage Dashboard</h3>
            <p className="text-sm text-slate-400">View coverage metrics and export</p>
          </a>
        </div>
      </div>
    </div>
  );
}
