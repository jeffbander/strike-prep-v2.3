"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

interface ServiceStaffingDisplayProps {
  serviceId: Id<"services">;
}

export default function ServiceStaffingDisplay({ serviceId }: ServiceStaffingDisplayProps) {
  const serviceDetails = useQuery(api.services.getWithDetails, { serviceId });

  if (!serviceDetails) {
    return <div className="text-slate-400 text-sm">Loading staffing...</div>;
  }

  // Group shifts by job type
  const jobTypeStaffing = serviceDetails.serviceJobTypes.map((sjt) => {
    const jobTypeName = sjt.jobType?.name || "Unknown";
    const jobTypeCode = sjt.jobType?.code || "?";

    // Group shifts by type
    const shiftsByType: Record<string, { count: number; times: string; active: boolean }> = {};

    sjt.shifts.forEach((shift) => {
      if (!shiftsByType[shift.shiftType]) {
        shiftsByType[shift.shiftType] = {
          count: shift.positionsNeeded,
          times: `${shift.startTime} - ${shift.endTime}`,
          active: shift.isActive
        };
      }
    });

    return {
      jobTypeName,
      jobTypeCode,
      shiftsByType,
      totalPositions: sjt.shifts.reduce((sum, s) => sum + (s.isActive ? s.positionsNeeded : 0), 0)
    };
  });

  const shiftTypeLabels: Record<string, { label: string; color: string }> = {
    "Weekday_AM": { label: "Weekday AM", color: "bg-yellow-500" },
    "Weekday_PM": { label: "Weekday PM", color: "bg-indigo-500" },
    "Weekend_AM": { label: "Weekend AM", color: "bg-orange-500" },
    "Weekend_PM": { label: "Weekend PM", color: "bg-purple-500" },
  };

  return (
    <div className="space-y-3">
      <p className="font-medium text-white text-sm">Staffing</p>
      {jobTypeStaffing.length === 0 ? (
        <p className="text-slate-500 text-sm">No job types configured</p>
      ) : (
        <div className="space-y-2">
          {jobTypeStaffing.map((jt, idx) => (
            <div key={idx} className="bg-slate-700/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white text-sm">{jt.jobTypeName}</span>
                <span className="text-xs text-slate-400 font-mono">({jt.jobTypeCode})</span>
                <span className="text-xs text-slate-500">
                  • {jt.totalPositions} position{jt.totalPositions !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-1">
                {Object.entries(jt.shiftsByType).map(([shiftType, data]) => {
                  const shiftInfo = shiftTypeLabels[shiftType] || { label: shiftType, color: "bg-gray-500" };
                  return (
                    <div key={shiftType} className="flex items-center gap-2 text-xs">
                      <span className={`inline-block w-2 h-2 ${shiftInfo.color} rounded-full ${!data.active ? 'opacity-30' : ''}`}></span>
                      <span className={`${!data.active ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                        {shiftInfo.label}: {data.count} staff @ {data.times}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
