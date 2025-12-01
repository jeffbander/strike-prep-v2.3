"use client";

import { useState } from "react";
import { ShiftConfig, SHIFT_TYPES, ShiftType } from "./types";

interface ShiftEditorProps {
  jobTypeName: string;
  jobTypeCode: string;
  shiftConfig: {
    [key in ShiftType]?: ShiftConfig;
  };
  onShiftChange: (shiftType: ShiftType, config: ShiftConfig) => void;
  defaultDayStart: string;
  defaultDayEnd: string;
  defaultNightStart: string;
  defaultNightEnd: string;
}

export default function ShiftEditor({
  jobTypeName,
  jobTypeCode,
  shiftConfig,
  onShiftChange,
  defaultDayStart,
  defaultDayEnd,
  defaultNightStart,
  defaultNightEnd,
}: ShiftEditorProps) {
  const [editingCustomTime, setEditingCustomTime] = useState<ShiftType | null>(
    null
  );

  const getShiftTimes = (shiftType: ShiftType): { start: string; end: string } => {
    const config = shiftConfig[shiftType];
    if (config?.customTimes) {
      return {
        start: config.customTimes.startTime,
        end: config.customTimes.endTime,
      };
    }

    // Use default times based on shift type
    if (shiftType === "Weekday_AM" || shiftType === "Weekend_AM") {
      return { start: defaultDayStart, end: defaultDayEnd };
    } else {
      return { start: defaultNightStart, end: defaultNightEnd };
    }
  };

  const handleToggleShift = (shiftType: ShiftType) => {
    const currentConfig = shiftConfig[shiftType];
    const isEnabled = currentConfig?.enabled ?? false;

    onShiftChange(shiftType, {
      enabled: !isEnabled,
      positions: currentConfig?.positions ?? 1,
      capacity: currentConfig?.capacity,
      customTimes: currentConfig?.customTimes,
    });
  };

  const handlePositionsChange = (shiftType: ShiftType, positions: number) => {
    const currentConfig = shiftConfig[shiftType];
    onShiftChange(shiftType, {
      ...(currentConfig || { enabled: true }),
      positions: Math.max(0, positions),
    });
  };

  const handleCapacityChange = (shiftType: ShiftType, capacity: number | undefined) => {
    const currentConfig = shiftConfig[shiftType];
    onShiftChange(shiftType, {
      ...(currentConfig || { enabled: true, positions: 1 }),
      capacity: capacity ? Math.max(1, capacity) : undefined,
    });
  };

  const handleCustomTimeChange = (
    shiftType: ShiftType,
    field: "startTime" | "endTime",
    value: string
  ) => {
    const currentConfig = shiftConfig[shiftType];
    const currentCustomTimes = currentConfig?.customTimes || getShiftTimes(shiftType);

    onShiftChange(shiftType, {
      ...(currentConfig || { enabled: true, positions: 1 }),
      customTimes: {
        ...currentCustomTimes,
        [field]: value,
      },
    });
  };

  const handleRemoveCustomTime = (shiftType: ShiftType) => {
    const currentConfig = shiftConfig[shiftType];
    if (currentConfig) {
      onShiftChange(shiftType, {
        ...currentConfig,
        customTimes: undefined,
      });
    }
    setEditingCustomTime(null);
  };

  const renderShift = (shiftType: ShiftType) => {
    const config = shiftConfig[shiftType];
    if (!config) return null;

    const { label, dotColor } = SHIFT_TYPES[shiftType];
    const times = getShiftTimes(shiftType);
    const isCustom = !!config.customTimes;
    const isEditing = editingCustomTime === shiftType;

    return (
      <div
        key={shiftType}
        className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
          config.enabled
            ? "bg-slate-600 border-slate-500"
            : "bg-slate-800/50 border-slate-700 opacity-60"
        }`}
      >
        <div className="flex items-center gap-3 flex-1">
          <span
            className={`inline-block w-2 h-2 ${dotColor} rounded-full ${
              !config.enabled ? "opacity-50" : ""
            }`}
          ></span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`font-medium ${
                  !config.enabled ? "text-slate-400" : "text-white"
                }`}
              >
                {label}
              </span>
              {isCustom && (
                <span className="px-2 py-0.5 bg-emerald-600 text-xs rounded text-white">
                  Custom
                </span>
              )}
              {!config.enabled && (
                <span className="px-2 py-0.5 bg-slate-600 text-slate-400 text-xs rounded">
                  Deactivated
                </span>
              )}
            </div>

            {isEditing ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="time"
                  value={times.start}
                  onChange={(e) =>
                    handleCustomTimeChange(shiftType, "startTime", e.target.value)
                  }
                  className="px-2 py-1 bg-slate-700 border border-slate-500 rounded text-sm text-white"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="time"
                  value={times.end}
                  onChange={(e) =>
                    handleCustomTimeChange(shiftType, "endTime", e.target.value)
                  }
                  className="px-2 py-1 bg-slate-700 border border-slate-500 rounded text-sm text-white"
                />
                <button
                  onClick={() => setEditingCustomTime(null)}
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded"
                >
                  Done
                </button>
                {isCustom && (
                  <button
                    onClick={() => handleRemoveCustomTime(shiftType)}
                    className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded"
                  >
                    Reset to Default
                  </button>
                )}
              </div>
            ) : (
              <div className="text-sm text-slate-400 flex items-center gap-2">
                <span>
                  {times.start} - {times.end}
                </span>
                {config.enabled && (
                  <button
                    onClick={() => setEditingCustomTime(shiftType)}
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    Edit Times
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {config.enabled && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Positions:</label>
                <input
                  type="number"
                  min={0}
                  value={config.positions}
                  onChange={(e) =>
                    handlePositionsChange(
                      shiftType,
                      parseInt(e.target.value) || 0
                    )
                  }
                  className="w-16 px-2 py-1 bg-slate-500 border border-slate-400 rounded text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Capacity:</label>
                <input
                  type="number"
                  min={1}
                  value={config.capacity || ""}
                  onChange={(e) =>
                    handleCapacityChange(
                      shiftType,
                      e.target.value ? parseInt(e.target.value) : undefined
                    )
                  }
                  placeholder="N/A"
                  className="w-16 px-2 py-1 bg-slate-500 border border-slate-400 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </>
          )}
          <button
            onClick={() => handleToggleShift(shiftType)}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              config.enabled
                ? "bg-amber-600 hover:bg-amber-700 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }`}
          >
            {config.enabled ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-slate-700 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-medium text-white">{jobTypeName}</span>
        <span className="text-sm text-slate-400 font-mono">({jobTypeCode})</span>
      </div>

      <div className="space-y-3">
        {(["Weekday_AM", "Weekday_PM", "Weekend_AM", "Weekend_PM"] as ShiftType[]).map(
          (shiftType) => renderShift(shiftType)
        )}
      </div>
    </div>
  );
}
