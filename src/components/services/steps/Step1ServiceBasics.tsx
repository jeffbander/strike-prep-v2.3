"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { WizardStepProps } from "../types";
import { Id } from "../../../../convex/_generated/dataModel";
import { useEffect, useState } from "react";

export default function Step1ServiceBasics({
  wizardState,
  updateWizardState,
  onNext,
}: WizardStepProps) {
  const hospitals = useQuery(api.hospitals.list, {});
  const departments = useQuery(api.departments.list, {});
  const [selectedHospitalId, setSelectedHospitalId] = useState(
    wizardState.hospitalId
  );

  // Units for the selected hospital
  const units = useQuery(
    api.units.list,
    selectedHospitalId
      ? { hospitalId: selectedHospitalId as Id<"hospitals"> }
      : "skip"
  );

  const filteredDepartments = selectedHospitalId
    ? departments?.filter((d) => d.hospitalId === selectedHospitalId)
    : departments;

  // Auto-select hospital if only one option
  useEffect(() => {
    if (hospitals && hospitals.length === 1 && !selectedHospitalId) {
      const hospitalId = hospitals[0]._id;
      setSelectedHospitalId(hospitalId);
      updateWizardState({ hospitalId });
    }
  }, [hospitals, selectedHospitalId]);

  // Auto-select department if only one option
  useEffect(() => {
    if (
      filteredDepartments &&
      filteredDepartments.length === 1 &&
      !wizardState.departmentId
    ) {
      updateWizardState({ departmentId: filteredDepartments[0]._id });
    }
  }, [filteredDepartments, wizardState.departmentId]);

  // Update wizard state when hospital changes
  useEffect(() => {
    if (wizardState.hospitalId && wizardState.hospitalId !== selectedHospitalId) {
      setSelectedHospitalId(wizardState.hospitalId);
    }
  }, [wizardState.hospitalId]);

  const handleHospitalChange = (hospitalId: string) => {
    setSelectedHospitalId(hospitalId);
    updateWizardState({
      hospitalId,
      departmentId: "",
      unitId: undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-2">Service Information</h3>
        <p className="text-slate-400 text-sm">
          Let's start with the basics. Where will this service operate?
        </p>
      </div>

      {/* Hospital & Department Selection */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-slate-400 mb-2">
            Hospital <span className="text-red-400">*</span>
          </label>
          <select
            value={selectedHospitalId}
            onChange={(e) => handleHospitalChange(e.target.value)}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500 text-white"
          >
            <option value="">Select Hospital</option>
            {hospitals?.map((hospital) => (
              <option key={hospital._id} value={hospital._id}>
                {hospital.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">
            Department <span className="text-red-400">*</span>
          </label>
          <select
            value={wizardState.departmentId}
            onChange={(e) =>
              updateWizardState({ departmentId: e.target.value })
            }
            disabled={!selectedHospitalId}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Select Department</option>
            {filteredDepartments?.map((dept) => (
              <option key={dept._id} value={dept._id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Service Name & Code */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-slate-400 mb-2">
            Service Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={wizardState.name}
            onChange={(e) => updateWizardState({ name: e.target.value })}
            placeholder="e.g., Cardiac ICU"
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500 text-white placeholder-slate-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            Descriptive name for the service
          </p>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">
            Short Code <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={wizardState.shortCode}
            onChange={(e) =>
              updateWizardState({
                shortCode: e.target.value.toUpperCase().slice(0, 6),
              })
            }
            placeholder="e.g., CICU"
            maxLength={6}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500 text-white placeholder-slate-500 font-mono"
          />
          <p className="text-xs text-slate-500 mt-1">
            Used in job codes (max 6 chars)
          </p>
        </div>
      </div>

      {/* Unit Selection */}
      <div>
        <label className="block text-sm text-slate-400 mb-2">
          Unit (Optional)
        </label>
        <select
          value={wizardState.unitId || ""}
          onChange={(e) =>
            updateWizardState({
              unitId: e.target.value || undefined,
            })
          }
          disabled={!selectedHospitalId}
          className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:border-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">No specific unit</option>
          {units
            ?.filter((u) => u.isActive)
            .map((unit) => (
              <option key={unit._id} value={unit._id}>
                {unit.name}{" "}
                {unit.floorNumber ? `(Floor ${unit.floorNumber})` : ""}
              </option>
            ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">
          Optional: Assign this service to a specific floor or unit
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
        <button
          onClick={onNext}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors font-medium"
        >
          Next: Select Roles →
        </button>
      </div>
    </div>
  );
}
