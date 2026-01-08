"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";

interface RotationTypeManagerProps {
  healthSystemId: Id<"health_systems">;
  onClose: () => void;
}

const CATEGORY_OPTIONS = [
  { value: "on_service", label: "On Service", color: "#3B82F6" },
  { value: "vacation", label: "Vacation", color: "#EF4444" },
  { value: "sick", label: "Sick", color: "#EF4444" },
  { value: "curtailable", label: "Curtailable", color: "#F59E0B" },
  { value: "unavailable", label: "Unavailable", color: "#EF4444" },
  { value: "administrative", label: "Administrative", color: "#6B7280" },
];

const COLOR_OPTIONS = [
  "#EF4444", // Red
  "#F59E0B", // Amber
  "#10B981", // Emerald
  "#3B82F6", // Blue
  "#6366F1", // Indigo
  "#8B5CF6", // Violet
  "#EC4899", // Pink
  "#6B7280", // Gray
];

export default function RotationTypeManager({
  healthSystemId,
  onClose,
}: RotationTypeManagerProps) {
  const rotationTypes = useQuery(api.rotationTypes.list, { healthSystemId });
  const createRotationType = useMutation(api.rotationTypes.create);
  const updateRotationType = useMutation(api.rotationTypes.update);
  const toggleCurtailable = useMutation(api.rotationTypes.toggleCurtailable);
  const seedDefaults = useMutation(api.rotationTypes.seedDefaults);

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<Id<"rotation_types"> | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formShortCode, setFormShortCode] = useState("");
  const [formCategory, setFormCategory] = useState("on_service");
  const [formColor, setFormColor] = useState("#3B82F6");
  const [formCurtailable, setFormCurtailable] = useState(false);

  const resetForm = () => {
    setFormName("");
    setFormShortCode("");
    setFormCategory("on_service");
    setFormColor("#3B82F6");
    setFormCurtailable(false);
    setIsCreating(false);
    setEditingId(null);
  };

  const handleCreate = async () => {
    if (!formName.trim()) {
      toast.error("Name is required");
      return;
    }

    try {
      await createRotationType({
        healthSystemId,
        name: formName.trim(),
        shortCode: formShortCode.trim() || formName.substring(0, 3).toUpperCase(),
        category: formCategory,
        isCurtailable: formCurtailable,
        color: formColor,
      });
      toast.success("Rotation type created");
      resetForm();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(message);
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;

    try {
      await updateRotationType({
        rotationTypeId: editingId,
        name: formName.trim() || undefined,
        shortCode: formShortCode.trim() || undefined,
        category: formCategory || undefined,
        isCurtailable: formCurtailable,
        color: formColor || undefined,
      });
      toast.success("Rotation type updated");
      resetForm();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(message);
    }
  };

  const handleEdit = (rt: NonNullable<typeof rotationTypes>[0]) => {
    setEditingId(rt._id);
    setFormName(rt.name);
    setFormShortCode(rt.shortCode);
    setFormCategory(rt.category);
    setFormColor(rt.color);
    setFormCurtailable(rt.isCurtailable);
    setIsCreating(true);
  };

  const handleToggleCurtailable = async (id: Id<"rotation_types">) => {
    try {
      await toggleCurtailable({ rotationTypeId: id });
      toast.success("Updated");
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleSeedDefaults = async () => {
    try {
      const result = await seedDefaults({ healthSystemId });
      toast.success(result.message);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(message);
    }
  };

  // Group by category
  const groupedTypes = rotationTypes?.reduce(
    (acc, rt) => {
      if (!acc[rt.category]) {
        acc[rt.category] = [];
      }
      acc[rt.category].push(rt);
      return acc;
    },
    {} as Record<string, typeof rotationTypes>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold">Manage Rotation Types</h2>
              <p className="text-slate-400 text-sm mt-1">
                Configure rotation categories for schedule imports
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-xl"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Create/Edit Form */}
          {isCreating && (
            <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
              <h3 className="font-medium mb-4">
                {editingId ? "Edit Rotation Type" : "New Rotation Type"}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Vacation, Research"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Short Code
                  </label>
                  <input
                    type="text"
                    value={formShortCode}
                    onChange={(e) => setFormShortCode(e.target.value.toUpperCase())}
                    placeholder="e.g., VAC, RES"
                    maxLength={5}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Color</label>
                  <div className="flex gap-2">
                    {COLOR_OPTIONS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setFormColor(color)}
                        className={`w-8 h-8 rounded-full transition-transform ${
                          formColor === color
                            ? "ring-2 ring-white scale-110"
                            : "hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formCurtailable}
                    onChange={(e) => setFormCurtailable(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  <span className="text-sm">
                    Curtailable (provider can be pulled for strike coverage)
                  </span>
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={editingId ? handleUpdate : handleCreate}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                  {editingId ? "Update" : "Create"}
                </button>
                <button
                  onClick={resetForm}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          {!isCreating && (
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setIsCreating(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                + Add Rotation Type
              </button>
              {(!rotationTypes || rotationTypes.length === 0) && (
                <button
                  onClick={handleSeedDefaults}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  Create Default Types
                </button>
              )}
            </div>
          )}

          {/* List */}
          {!rotationTypes ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            </div>
          ) : rotationTypes.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p>No rotation types configured yet</p>
              <p className="text-sm mt-1">
                Add custom types or use the defaults
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedTypes || {}).map(([category, types]) => {
                const categoryLabel =
                  CATEGORY_OPTIONS.find((c) => c.value === category)?.label ||
                  category;

                return (
                  <div key={category}>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">
                      {categoryLabel}
                    </h3>
                    <div className="space-y-2">
                      {types?.map((rt) => (
                        <div
                          key={rt._id}
                          className="flex items-center justify-between bg-slate-700/50 rounded-lg px-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-4 h-4 rounded"
                              style={{ backgroundColor: rt.color }}
                            />
                            <div>
                              <span className="font-medium">{rt.name}</span>
                              <span className="text-slate-400 text-sm ml-2">
                                ({rt.shortCode})
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {rt.isCurtailable && (
                              <span className="px-2 py-1 bg-amber-600/30 text-amber-300 text-xs rounded">
                                Curtailable
                              </span>
                            )}
                            <button
                              onClick={() => handleToggleCurtailable(rt._id)}
                              className={`px-3 py-1 text-xs rounded transition-colors ${
                                rt.isCurtailable
                                  ? "bg-slate-600 hover:bg-slate-500"
                                  : "bg-amber-600/30 hover:bg-amber-600/50 text-amber-300"
                              }`}
                            >
                              {rt.isCurtailable ? "Make Non-curtailable" : "Make Curtailable"}
                            </button>
                            <button
                              onClick={() => handleEdit(rt)}
                              className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-xs rounded transition-colors"
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
