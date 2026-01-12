"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ForecastDay {
  day: number;
  date: string;
  projectedCensus: number;
  predictedDischarges: number;
  predictedDowngrades: number;
  procedureAdmits: number; // Admits from scheduled procedures
  netChange: number;
}

interface UnitForecast {
  unitName: string;
  unitType: "icu" | "floor";
  currentCensus: number;
  days: ForecastDay[];
}

interface CensusForecastChartProps {
  forecast: UnitForecast[];
  selectedUnit: string;
  onUnitSelect: (unitName: string) => void;
}

// Dark theme color palette matching existing UI
const COLORS = {
  census: "#60a5fa", // blue-400
  discharges: "#34d399", // emerald-400
  downgrades: "#fbbf24", // amber-400
  admits: "#a78bfa", // violet-400
  grid: "#334155", // slate-700
  text: "#94a3b8", // slate-400
};

export default function CensusForecastChart({
  forecast,
  selectedUnit,
  onUnitSelect,
}: CensusForecastChartProps) {
  // Transform data for stacked bar chart
  const chartData = useMemo(() => {
    if (!selectedUnit) {
      // Show all units aggregated by day
      const dayMap = new Map<
        number,
        {
          day: number;
          label: string;
          census: number;
          discharges: number;
          downgrades: number;
          procedureAdmits: number;
        }
      >();

      for (const unit of forecast) {
        for (const dayData of unit.days) {
          const existing = dayMap.get(dayData.day) || {
            day: dayData.day,
            label: dayData.day === 0 ? "Today" : `Day ${dayData.day}`,
            census: 0,
            discharges: 0,
            downgrades: 0,
            procedureAdmits: 0,
          };
          existing.census += dayData.projectedCensus;
          existing.discharges += dayData.predictedDischarges;
          existing.downgrades += dayData.predictedDowngrades;
          existing.procedureAdmits += dayData.procedureAdmits;
          dayMap.set(dayData.day, existing);
        }
      }

      return Array.from(dayMap.values()).sort((a, b) => a.day - b.day);
    }

    // Show single unit data
    const unit = forecast.find((u) => u.unitName === selectedUnit);
    if (!unit) return [];

    return unit.days.map((d) => ({
      day: d.day,
      label: d.day === 0 ? "Today" : `Day ${d.day}`,
      census: d.projectedCensus,
      discharges: d.predictedDischarges,
      downgrades: d.predictedDowngrades,
      procedureAdmits: d.procedureAdmits,
    }));
  }, [forecast, selectedUnit]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    if (chartData.length < 2) return null;
    const today = chartData[0];
    const lastDay = chartData[chartData.length - 1];
    const totalDischarges = chartData.reduce((sum, d) => sum + d.discharges, 0);
    const totalDowngrades = chartData.reduce((sum, d) => sum + d.downgrades, 0);
    const totalProcedureAdmits = chartData.reduce((sum, d) => sum + d.procedureAdmits, 0);
    const netChange = lastDay.census - today.census;

    return {
      currentCensus: today.census,
      projectedLastDay: lastDay.census,
      lastDayNum: chartData.length - 1,
      totalDischarges,
      totalDowngrades,
      totalProcedureAdmits,
      netChange,
    };
  }, [chartData]);

  // Custom tooltip for dark theme
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload) return null;

    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-lg">
        <p className="text-white font-medium mb-2">{label}</p>
        {payload.map((entry, idx) => (
          <p key={idx} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">7-Day Census Forecast</h2>
            <p className="text-sm text-slate-400">
              {selectedUnit || "All Units"} - Census + scheduled procedure admissions
            </p>
          </div>
        </div>

        {/* Unit selector dropdown */}
        <select
          value={selectedUnit}
          onChange={(e) => onUnitSelect(e.target.value)}
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
        >
          <option value="">All Units</option>
          {forecast.map((unit) => (
            <option key={unit.unitName} value={unit.unitName}>
              {unit.unitName} ({unit.unitType.toUpperCase()})
            </option>
          ))}
        </select>
      </div>

      {/* Summary Stats */}
      {summaryStats && (
        <div className="grid grid-cols-6 gap-4 mb-6">
          <div className="bg-slate-700/50 rounded-lg p-3 text-center">
            <p className="text-slate-400 text-xs">Current</p>
            <p className="text-2xl font-bold text-white">{summaryStats.currentCensus}</p>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-3 text-center">
            <p className="text-slate-400 text-xs">Day {summaryStats.lastDayNum} Projected</p>
            <p className="text-2xl font-bold text-blue-400">{summaryStats.projectedLastDay}</p>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-3 text-center">
            <p className="text-slate-400 text-xs">Total Discharges</p>
            <p className="text-2xl font-bold text-emerald-400">{summaryStats.totalDischarges}</p>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-3 text-center">
            <p className="text-slate-400 text-xs">ICU Downgrades</p>
            <p className="text-2xl font-bold text-amber-400">{summaryStats.totalDowngrades}</p>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-3 text-center">
            <p className="text-slate-400 text-xs">Procedure Admits</p>
            <p className="text-2xl font-bold text-violet-400">{summaryStats.totalProcedureAdmits}</p>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-3 text-center">
            <p className="text-slate-400 text-xs">Net Change</p>
            <p
              className={`text-2xl font-bold ${
                summaryStats.netChange < 0
                  ? "text-emerald-400"
                  : summaryStats.netChange > 0
                  ? "text-red-400"
                  : "text-slate-400"
              }`}
            >
              {summaryStats.netChange > 0 ? "+" : ""}
              {summaryStats.netChange}
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
            <XAxis dataKey="label" stroke={COLORS.text} tick={{ fill: COLORS.text }} />
            <YAxis stroke={COLORS.text} tick={{ fill: COLORS.text }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: COLORS.text }} />
            <Bar dataKey="census" name="Census" fill={COLORS.census} radius={[4, 4, 0, 0]} />
            <Bar
              dataKey="discharges"
              name="Discharges"
              fill={COLORS.discharges}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="downgrades"
              name="Downgrades"
              fill={COLORS.downgrades}
              radius={[4, 4, 0, 0]}
            />
            <Bar dataKey="procedureAdmits" name="Procedure Admits" fill={COLORS.admits} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend with explanation */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm border-t border-slate-700 pt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.census }} />
          <span className="text-slate-400">Projected Census</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.discharges }} />
          <span className="text-slate-400">Predicted Discharges</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.downgrades }} />
          <span className="text-slate-400">ICU Downgrades</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS.admits }} />
          <span className="text-slate-400">Procedure Admits</span>
        </div>
      </div>
    </div>
  );
}
