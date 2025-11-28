"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import Link from "next/link";
import { Id } from "../../../../convex/_generated/dataModel";

type Role = "health_system_admin" | "hospital_admin" | "departmental_admin";

export default function UsersPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const users = useQuery(api.users.listUsers);
  const healthSystems = useQuery(api.healthSystems.list);
  const hospitals = useQuery(api.hospitals.list, {});
  const departments = useQuery(api.departments.list, {});

  const createAdminUser = useMutation(api.users.createAdminUser);
  const updateUser = useMutation(api.users.updateUser);
  const deactivateUser = useMutation(api.users.deactivateUser);
  const reactivateUser = useMutation(api.users.reactivateUser);

  const [isCreating, setIsCreating] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "health_system_admin" as Role,
    healthSystemId: "" as string,
    hospitalId: "" as string,
    departmentId: "" as string,
  });

  // Filter hospitals by selected health system
  const filteredHospitals = hospitals?.filter((h) =>
    formData.healthSystemId ? h.healthSystemId === formData.healthSystemId : true
  );

  // Filter departments by selected hospital
  const filteredDepartments = departments?.filter((d) =>
    formData.hospitalId ? d.hospitalId === formData.hospitalId : true
  );

  // Helper function to get available roles (defined early so it can be used in useEffect)
  const getDefaultRole = (): Role => {
    if (currentUser?.role === "super_admin") return "health_system_admin";
    if (currentUser?.role === "health_system_admin") return "hospital_admin";
    if (currentUser?.role === "hospital_admin") return "departmental_admin";
    if (currentUser?.role === "departmental_admin") return "departmental_admin";
    return "health_system_admin";
  };

  // Initialize role based on current user's available options
  useEffect(() => {
    if (currentUser) {
      const defaultRole = getDefaultRole();
      setFormData((prev) => ({ ...prev, role: defaultRole }));
    }
  }, [currentUser]);

  // Reset dependent selectors when parent changes, and auto-fill scope for lower-level admins
  useEffect(() => {
    if (formData.role === "health_system_admin") {
      setFormData((prev) => ({ ...prev, hospitalId: "", departmentId: "" }));
    } else if (formData.role === "hospital_admin") {
      setFormData((prev) => ({ ...prev, departmentId: "" }));
    } else if (formData.role === "departmental_admin") {
      // Auto-fill hospital for hospital_admin creating departmental_admin
      if (currentUser?.role === "hospital_admin" && currentUser.hospitalId) {
        setFormData((prev) => ({
          ...prev,
          healthSystemId: currentUser.healthSystemId || "",
          hospitalId: currentUser.hospitalId,
        }));
      }
    }
  }, [formData.role, currentUser]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createAdminUser({
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        healthSystemId: formData.healthSystemId
          ? (formData.healthSystemId as Id<"health_systems">)
          : undefined,
        hospitalId: formData.hospitalId
          ? (formData.hospitalId as Id<"hospitals">)
          : undefined,
        departmentId: formData.departmentId
          ? (formData.departmentId as Id<"departments">)
          : undefined,
      });
      toast.success(`Invitation sent to ${formData.email}`);
      resetForm();
      setIsCreating(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      await updateUser({
        userId: editingUser as Id<"users">,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        healthSystemId: formData.healthSystemId
          ? (formData.healthSystemId as Id<"health_systems">)
          : undefined,
        hospitalId: formData.hospitalId
          ? (formData.hospitalId as Id<"hospitals">)
          : undefined,
        departmentId: formData.departmentId
          ? (formData.departmentId as Id<"departments">)
          : undefined,
      });
      toast.success("User updated successfully");
      setEditingUser(null);
      resetForm();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeactivate = async (userId: string) => {
    try {
      await deactivateUser({ userId: userId as Id<"users"> });
      toast.success("User deactivated");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleReactivate = async (userId: string) => {
    try {
      await reactivateUser({ userId: userId as Id<"users"> });
      toast.success("User reactivated");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const startEdit = (user: any) => {
    setFormData({
      email: user.email,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      role: user.role as Role,
      healthSystemId: user.healthSystemId || "",
      hospitalId: user.hospitalId || "",
      departmentId: user.departmentId || "",
    });
    setEditingUser(user._id);
  };

  const resetForm = () => {
    setFormData({
      email: "",
      firstName: "",
      lastName: "",
      role: "health_system_admin",
      healthSystemId: "",
      hospitalId: "",
      departmentId: "",
    });
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "super_admin":
        return "bg-purple-600";
      case "health_system_admin":
        return "bg-blue-600";
      case "hospital_admin":
        return "bg-emerald-600";
      case "departmental_admin":
        return "bg-amber-600";
      default:
        return "bg-slate-600";
    }
  };

  const getScopeName = (user: any) => {
    if (user.role === "super_admin") return "All Systems";
    if (user.departmentId) {
      const dept = departments?.find((d) => d._id === user.departmentId);
      return dept?.name || "Department";
    }
    if (user.hospitalId) {
      const hospital = hospitals?.find((h) => h._id === user.hospitalId);
      return hospital?.name || "Hospital";
    }
    if (user.healthSystemId) {
      const hs = healthSystems?.find((h) => h._id === user.healthSystemId);
      return hs?.name || "Health System";
    }
    return "No scope assigned";
  };

  const canEditUser = (user: any) => {
    if (!currentUser) return false;
    if (user.role === "super_admin") return false;
    if (currentUser.role === "super_admin") return true;
    if (currentUser.role === "health_system_admin") {
      return user.healthSystemId === currentUser.healthSystemId;
    }
    if (currentUser.role === "hospital_admin") {
      return user.hospitalId === currentUser.hospitalId;
    }
    return false;
  };

  // Determine which roles can be assigned based on current user
  const getAvailableRoles = (): { value: Role; label: string }[] => {
    if (currentUser?.role === "super_admin") {
      return [
        { value: "health_system_admin", label: "Health System Admin" },
        { value: "hospital_admin", label: "Hospital Admin" },
        { value: "departmental_admin", label: "Departmental Admin" },
      ];
    }
    if (currentUser?.role === "health_system_admin") {
      return [
        { value: "hospital_admin", label: "Hospital Admin" },
        { value: "departmental_admin", label: "Departmental Admin" },
      ];
    }
    if (currentUser?.role === "hospital_admin") {
      return [{ value: "departmental_admin", label: "Departmental Admin" }];
    }
    return [];
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
            <h1 className="text-3xl font-bold">User Management</h1>
            <p className="text-slate-400 mt-1">
              Manage admin users and their access permissions
            </p>
          </div>
          {(currentUser?.role === "super_admin" ||
            currentUser?.role === "health_system_admin" ||
            currentUser?.role === "hospital_admin") && (
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              + Invite Admin
            </button>
          )}
        </div>

        {/* Create/Edit Form */}
        {(isCreating || editingUser) && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">
              {editingUser ? "Edit User" : "Invite New Admin"}
            </h2>
            <form onSubmit={editingUser ? handleUpdate : handleCreate} className="space-y-4">
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

              {!editingUser && (
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
              )}

              <div>
                <label className="block text-sm text-slate-400 mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                >
                  {getAvailableRoles().map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Health System Selector - for super_admin creating health_system_admin */}
              {formData.role === "health_system_admin" &&
                currentUser?.role === "super_admin" &&
                healthSystems && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Health System</label>
                    <select
                      value={formData.healthSystemId}
                      onChange={(e) =>
                        setFormData({ ...formData, healthSystemId: e.target.value })
                      }
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                      required
                    >
                      <option value="">Select Health System</option>
                      {healthSystems.map((hs) => (
                        <option key={hs._id} value={hs._id}>
                          {hs.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

              {/* Hospital Selector - for hospital_admin */}
              {formData.role === "hospital_admin" && (
                <>
                  {currentUser?.role === "super_admin" && healthSystems && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Health System</label>
                      <select
                        value={formData.healthSystemId}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            healthSystemId: e.target.value,
                            hospitalId: "",
                          })
                        }
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                        required
                      >
                        <option value="">Select Health System</option>
                        {healthSystems.map((hs) => (
                          <option key={hs._id} value={hs._id}>
                            {hs.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Hospital</label>
                    <select
                      value={formData.hospitalId}
                      onChange={(e) => setFormData({ ...formData, hospitalId: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                      required
                    >
                      <option value="">Select Hospital</option>
                      {filteredHospitals?.map((h) => (
                        <option key={h._id} value={h._id}>
                          {h.name} ({h.shortCode})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Department Selector - for departmental_admin */}
              {formData.role === "departmental_admin" && (
                <>
                  {currentUser?.role === "super_admin" && healthSystems && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Health System</label>
                      <select
                        value={formData.healthSystemId}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            healthSystemId: e.target.value,
                            hospitalId: "",
                            departmentId: "",
                          })
                        }
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                        required
                      >
                        <option value="">Select Health System</option>
                        {healthSystems.map((hs) => (
                          <option key={hs._id} value={hs._id}>
                            {hs.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {(currentUser?.role === "super_admin" ||
                    currentUser?.role === "health_system_admin") && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Hospital</label>
                      <select
                        value={formData.hospitalId}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            hospitalId: e.target.value,
                            departmentId: "",
                          })
                        }
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                        required
                      >
                        <option value="">Select Hospital</option>
                        {filteredHospitals?.map((h) => (
                          <option key={h._id} value={h._id}>
                            {h.name} ({h.shortCode})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Department</label>
                    <select
                      value={formData.departmentId}
                      onChange={(e) =>
                        setFormData({ ...formData, departmentId: e.target.value })
                      }
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                      required
                    >
                      <option value="">Select Department</option>
                      {filteredDepartments?.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  {editingUser ? "Save Changes" : "Send Invitation"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingUser(null);
                    resetForm();
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
            {!editingUser && (
              <p className="text-sm text-slate-400 mt-4">
                User will need to sign up with this email. Their role will be activated upon
                first login.
              </p>
            )}
          </div>
        )}

        {/* Users List */}
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">User</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Role</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Scope</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {users === undefined ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user._id} className="hover:bg-slate-700/50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="text-sm text-slate-400">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs ${getRoleBadgeColor(user.role)}`}
                      >
                        {user.role.replace(/_/g, " ").toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{getScopeName(user)}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          user.isActive ? "bg-emerald-600" : "bg-red-600"
                        }`}
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                      {!user.clerkId && (
                        <span className="ml-2 px-2 py-1 rounded text-xs bg-amber-600">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canEditUser(user) && (
                        <>
                          <button
                            onClick={() => startEdit(user)}
                            className="text-blue-400 hover:text-blue-300 mr-3"
                          >
                            Edit
                          </button>
                          {user.isActive ? (
                            <button
                              onClick={() => handleDeactivate(user._id)}
                              className="text-red-400 hover:text-red-300"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReactivate(user._id)}
                              className="text-emerald-400 hover:text-emerald-300"
                            >
                              Reactivate
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Role Hierarchy Info */}
        <div className="mt-6 p-4 bg-slate-800/50 rounded-lg">
          <h3 className="font-medium mb-2">Role Hierarchy</h3>
          <ul className="text-sm text-slate-400 space-y-1">
            <li>
              &bull; <span className="text-purple-400">Super Admin</span> - Full system access,
              can manage all health systems
            </li>
            <li>
              &bull; <span className="text-blue-400">Health System Admin</span> - Manages one
              health system and all its hospitals
            </li>
            <li>
              &bull; <span className="text-emerald-400">Hospital Admin</span> - Manages one
              hospital and its departments
            </li>
            <li>
              &bull; <span className="text-amber-400">Departmental Admin</span> - Manages one
              department only
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
