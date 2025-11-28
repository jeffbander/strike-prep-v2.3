"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { toast } from "sonner";
import Link from "next/link";
import { Id } from "../../../../convex/_generated/dataModel";

const CATEGORIES = ["Basic", "Procedural", "Specialty"];

export default function SkillsPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const skills = useQuery(api.skills.listAll);
  const seedDefaults = useMutation(api.skills.seedDefaults);
  const createSkill = useMutation(api.skills.create);
  const updateSkill = useMutation(api.skills.update);
  const toggleActive = useMutation(api.skills.toggleActive);

  const [isCreating, setIsCreating] = useState(false);
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [formData, setFormData] = useState({
    name: "",
    category: "Basic",
    description: "",
  });

  const isSuperAdmin = currentUser?.role === "super_admin";

  const handleSeedDefaults = async () => {
    try {
      const result = await seedDefaults();
      toast.success(result.message);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSkill({
        name: formData.name,
        category: formData.category,
        description: formData.description || undefined,
      });
      toast.success(`Skill "${formData.name}" created`);
      setFormData({ name: "", category: "Basic", description: "" });
      setIsCreating(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpdate = async (skillId: Id<"skills">) => {
    try {
      await updateSkill({
        skillId,
        name: formData.name,
        category: formData.category,
        description: formData.description || undefined,
      });
      toast.success("Skill updated");
      setEditingSkill(null);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleToggleActive = async (skillId: Id<"skills">) => {
    try {
      const result = await toggleActive({ skillId });
      toast.success(result.isActive ? "Skill activated" : "Skill deactivated");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const startEdit = (skill: any) => {
    setFormData({
      name: skill.name,
      category: skill.category,
      description: skill.description || "",
    });
    setEditingSkill(skill._id);
  };

  const filteredSkills = skills?.filter(
    (s) => !filterCategory || s.category === filterCategory
  );

  // Group by category for display
  const groupedSkills = filteredSkills?.reduce((acc, skill) => {
    if (!acc[skill.category]) {
      acc[skill.category] = [];
    }
    acc[skill.category]!.push(skill);
    return acc;
  }, {} as Record<string, NonNullable<typeof skills>>);

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
            <h1 className="text-3xl font-bold">Skills Management</h1>
            <p className="text-slate-400 mt-1">
              System-wide skills that can be assigned to providers and required by services
            </p>
          </div>
          {isSuperAdmin && (
            <div className="flex gap-2">
              {(!skills || skills.length === 0) && (
                <button
                  onClick={handleSeedDefaults}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Seed 32 Default Skills
                </button>
              )}
              <button
                onClick={() => setIsCreating(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                + Add Custom Skill
              </button>
            </div>
          )}
        </div>

        {/* Create Form */}
        {isCreating && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Create New Skill</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Skill Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                    placeholder="e.g., Dialysis"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500"
                  placeholder="Brief description of the skill"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  Create Skill
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

        {/* Filter */}
        <div className="mb-6">
          <label className="text-sm text-slate-400 mr-2">Filter by Category:</label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Skills List */}
        {skills === undefined ? (
          <div className="text-slate-400">Loading...</div>
        ) : skills.length === 0 ? (
          <div className="bg-slate-800 rounded-lg p-8 text-center">
            <p className="text-slate-400 mb-4">No skills configured yet</p>
            {isSuperAdmin && (
              <button
                onClick={handleSeedDefaults}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Seed 32 Default Skills from PRD
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedSkills || {}).map(([category, categorySkills]) => (
              <div key={category}>
                <h3 className="text-lg font-semibold mb-3 text-slate-300">
                  {category} Skills
                  <span className="text-sm font-normal text-slate-500 ml-2">
                    ({categorySkills?.length || 0})
                  </span>
                </h3>
                <div className="bg-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-700/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Skill Name
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Description
                        </th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-slate-300">
                          Status
                        </th>
                        {isSuperAdmin && (
                          <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {categorySkills?.map((skill) => (
                        <tr key={skill._id} className="hover:bg-slate-700/50">
                          {editingSkill === skill._id ? (
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
                                  value={formData.description}
                                  onChange={(e) =>
                                    setFormData({ ...formData, description: e.target.value })
                                  }
                                  className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-emerald-500"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <select
                                  value={formData.category}
                                  onChange={(e) =>
                                    setFormData({ ...formData, category: e.target.value })
                                  }
                                  className="px-2 py-1 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-emerald-500"
                                >
                                  {CATEGORIES.map((cat) => (
                                    <option key={cat} value={cat}>
                                      {cat}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => handleUpdate(skill._id)}
                                  className="text-emerald-400 hover:text-emerald-300 mr-2"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingSkill(null)}
                                  className="text-slate-400 hover:text-white"
                                >
                                  Cancel
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3">
                                <span className="font-medium">{skill.name}</span>
                                {skill.isSystemDefault && (
                                  <span className="ml-2 text-xs text-blue-400">(default)</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-slate-400">
                                {skill.description || "—"}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`px-2 py-1 rounded text-xs ${
                                    skill.isActive ? "bg-emerald-600" : "bg-red-600"
                                  }`}
                                >
                                  {skill.isActive ? "Active" : "Inactive"}
                                </span>
                              </td>
                              {isSuperAdmin && (
                                <td className="px-4 py-3 text-right">
                                  <button
                                    onClick={() => startEdit(skill)}
                                    className="text-blue-400 hover:text-blue-300 mr-3"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleToggleActive(skill._id)}
                                    className={
                                      skill.isActive
                                        ? "text-red-400 hover:text-red-300"
                                        : "text-emerald-400 hover:text-emerald-300"
                                    }
                                  >
                                    {skill.isActive ? "Deactivate" : "Activate"}
                                  </button>
                                </td>
                              )}
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {skills && skills.length > 0 && (
          <div className="mt-8 p-4 bg-slate-800 rounded-lg">
            <p className="text-sm text-slate-400">
              Total: {skills.length} skills &bull; Active:{" "}
              {skills.filter((s) => s.isActive).length} &bull; By Category:{" "}
              {CATEGORIES.map(
                (cat) => `${cat}: ${skills.filter((s) => s.category === cat).length}`
              ).join(", ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
