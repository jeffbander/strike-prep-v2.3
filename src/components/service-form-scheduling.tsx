"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { ServiceFormData } from "@/app/services/page"

interface ServiceFormSchedulingProps {
  formData: ServiceFormData
  updateFormData: (updates: Partial<ServiceFormData>) => void
}

const shiftTypes = [
  { value: "8-day", label: "8-hour Day Shift" },
  { value: "8-evening", label: "8-hour Evening Shift" },
  { value: "8-night", label: "8-hour Night Shift" },
  { value: "12-day", label: "12-hour Day Shift" },
  { value: "12-night", label: "12-hour Night Shift" },
  { value: "flexible", label: "Flexible Schedule" },
]

const shiftsPerWeekOptions = [
  { value: "1-2", label: "1-2 shifts" },
  { value: "3-4", label: "3-4 shifts" },
  { value: "5+", label: "5+ shifts" },
  { value: "prn", label: "PRN (As Needed)" },
]

export function ServiceFormScheduling({ formData, updateFormData }: ServiceFormSchedulingProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-foreground mb-1">Scheduling & Compensation</h3>
        <p className="text-sm text-muted-foreground">Set the schedule and pay rate for this position.</p>
      </div>

      <div className="grid gap-6">
        {/* Shift Type */}
        <div className="grid gap-2">
          <Label htmlFor="shiftType">Shift Type</Label>
          <Select value={formData.shiftType} onValueChange={(value) => updateFormData({ shiftType: value })}>
            <SelectTrigger className="bg-secondary">
              <SelectValue placeholder="Select shift type" />
            </SelectTrigger>
            <SelectContent>
              {shiftTypes.map((shift) => (
                <SelectItem key={shift.value} value={shift.value}>
                  {shift.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="startDate">Start Date</Label>
            <Input
              id="startDate"
              type="date"
              value={formData.startDate}
              onChange={(e) => updateFormData({ startDate: e.target.value })}
              className="bg-secondary"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="endDate">End Date</Label>
            <Input
              id="endDate"
              type="date"
              value={formData.endDate}
              onChange={(e) => updateFormData({ endDate: e.target.value })}
              className="bg-secondary"
            />
          </div>
        </div>

        {/* Shifts Per Week */}
        <div className="grid gap-2">
          <Label htmlFor="shiftsPerWeek">Shifts Per Week</Label>
          <Select value={formData.shiftsPerWeek} onValueChange={(value) => updateFormData({ shiftsPerWeek: value })}>
            <SelectTrigger className="bg-secondary w-48">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              {shiftsPerWeekOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Pay Rate */}
        <div className="grid gap-4">
          <Label>Compensation</Label>

          <RadioGroup
            value={formData.payType}
            onValueChange={(value) => updateFormData({ payType: value })}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="hourly" id="hourly" />
              <Label htmlFor="hourly" className="font-normal cursor-pointer">
                Hourly Rate
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="daily" id="daily" />
              <Label htmlFor="daily" className="font-normal cursor-pointer">
                Daily Rate
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="contract" id="contract" />
              <Label htmlFor="contract" className="font-normal cursor-pointer">
                Contract Total
              </Label>
            </div>
          </RadioGroup>

          <div className="relative w-48">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              id="payRate"
              type="number"
              placeholder="0.00"
              value={formData.payRate}
              onChange={(e) => updateFormData({ payRate: e.target.value })}
              className="bg-secondary pl-7"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
