"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ServiceFormData } from "@/app/services/page"

interface ServiceFormBasicInfoProps {
  formData: ServiceFormData
  updateFormData: (updates: Partial<ServiceFormData>) => void
}

const departments = [
  "Intensive Care Unit",
  "Emergency Department",
  "Medical-Surgical",
  "Labor & Delivery",
  "Pediatrics",
  "Operating Room",
  "Telemetry",
  "Oncology",
]

const facilities = [
  "Memorial General Hospital",
  "St. Mary's Medical Center",
  "Valley Health System",
  "Women's Health Pavilion",
  "Children's Medical Center",
  "Regional Medical Center",
]

const urgencyLevels = [
  { value: "critical", label: "Critical - Fill within 24 hours" },
  { value: "high", label: "High - Fill within 3 days" },
  { value: "medium", label: "Medium - Fill within 1 week" },
  { value: "low", label: "Low - Fill within 2 weeks" },
]

export function ServiceFormBasicInfo({ formData, updateFormData }: ServiceFormBasicInfoProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-foreground mb-1">Basic Information</h3>
        <p className="text-sm text-muted-foreground">Enter the basic details about the position you need to fill.</p>
      </div>

      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="title">Position Title</Label>
          <Input
            id="title"
            placeholder="e.g., ICU Registered Nurse"
            value={formData.title}
            onChange={(e) => updateFormData({ title: e.target.value })}
            className="bg-secondary"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="department">Department</Label>
            <Select value={formData.department} onValueChange={(value) => updateFormData({ department: value })}>
              <SelectTrigger className="bg-secondary">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="facility">Facility</Label>
            <Select value={formData.facility} onValueChange={(value) => updateFormData({ facility: value })}>
              <SelectTrigger className="bg-secondary">
                <SelectValue placeholder="Select facility" />
              </SelectTrigger>
              <SelectContent>
                {facilities.map((fac) => (
                  <SelectItem key={fac} value={fac}>
                    {fac}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="urgency">Urgency Level</Label>
          <Select value={formData.urgency} onValueChange={(value) => updateFormData({ urgency: value })}>
            <SelectTrigger className="bg-secondary">
              <SelectValue placeholder="Select urgency level" />
            </SelectTrigger>
            <SelectContent>
              {urgencyLevels.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  {level.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">Position Description</Label>
          <Textarea
            id="description"
            placeholder="Describe the position responsibilities and requirements..."
            value={formData.description}
            onChange={(e) => updateFormData({ description: e.target.value })}
            className="bg-secondary min-h-32"
          />
        </div>
      </div>
    </div>
  )
}
