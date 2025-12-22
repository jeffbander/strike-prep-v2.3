"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { X, Plus } from "lucide-react"
import type { ServiceFormData } from "@/app/services/page"

interface ServiceFormRequirementsProps {
  formData: ServiceFormData
  updateFormData: (updates: Partial<ServiceFormData>) => void
}

const commonCredentials = ["RN License", "BLS", "ACLS", "PALS", "NRP", "CCRN", "TNCC", "CEN", "ENPC"]

const experienceLevels = [
  { value: "0-1", label: "0-1 years" },
  { value: "1-3", label: "1-3 years" },
  { value: "3-5", label: "3-5 years" },
  { value: "5-10", label: "5-10 years" },
  { value: "10+", label: "10+ years" },
]

export function ServiceFormRequirements({ formData, updateFormData }: ServiceFormRequirementsProps) {
  const [newSkill, setNewSkill] = useState("")

  const addCredential = (credential: string, type: "required" | "preferred") => {
    const field = type === "required" ? "requiredCredentials" : "preferredCredentials"
    if (!formData[field].includes(credential)) {
      updateFormData({ [field]: [...formData[field], credential] })
    }
  }

  const removeCredential = (credential: string, type: "required" | "preferred") => {
    const field = type === "required" ? "requiredCredentials" : "preferredCredentials"
    updateFormData({ [field]: formData[field].filter((c) => c !== credential) })
  }

  const addSkill = () => {
    if (newSkill && !formData.specialSkills.includes(newSkill)) {
      updateFormData({ specialSkills: [...formData.specialSkills, newSkill] })
      setNewSkill("")
    }
  }

  const removeSkill = (skill: string) => {
    updateFormData({ specialSkills: formData.specialSkills.filter((s) => s !== skill) })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-foreground mb-1">Requirements</h3>
        <p className="text-sm text-muted-foreground">Specify the credentials and skills needed for this position.</p>
      </div>

      <div className="grid gap-6">
        {/* Required Credentials */}
        <div className="grid gap-3">
          <Label>Required Credentials</Label>
          <div className="flex flex-wrap gap-2">
            {commonCredentials.map((cred) => (
              <Badge
                key={cred}
                variant={formData.requiredCredentials.includes(cred) ? "default" : "outline"}
                className="cursor-pointer transition-colors"
                onClick={() =>
                  formData.requiredCredentials.includes(cred)
                    ? removeCredential(cred, "required")
                    : addCredential(cred, "required")
                }
              >
                {cred}
              </Badge>
            ))}
          </div>
          {formData.requiredCredentials.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs text-muted-foreground">Selected:</span>
              {formData.requiredCredentials.map((cred) => (
                <Badge key={cred} className="gap-1 bg-primary/20 text-primary border-primary/30">
                  {cred}
                  <button onClick={() => removeCredential(cred, "required")}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Preferred Credentials */}
        <div className="grid gap-3">
          <Label>Preferred Credentials (Optional)</Label>
          <div className="flex flex-wrap gap-2">
            {commonCredentials
              .filter((cred) => !formData.requiredCredentials.includes(cred))
              .map((cred) => (
                <Badge
                  key={cred}
                  variant={formData.preferredCredentials.includes(cred) ? "secondary" : "outline"}
                  className="cursor-pointer transition-colors"
                  onClick={() =>
                    formData.preferredCredentials.includes(cred)
                      ? removeCredential(cred, "preferred")
                      : addCredential(cred, "preferred")
                  }
                >
                  {cred}
                </Badge>
              ))}
          </div>
        </div>

        {/* Experience */}
        <div className="grid gap-2">
          <Label htmlFor="experience">Minimum Experience</Label>
          <Select
            value={formData.yearsExperience}
            onValueChange={(value) => updateFormData({ yearsExperience: value })}
          >
            <SelectTrigger className="bg-secondary w-48">
              <SelectValue placeholder="Select experience" />
            </SelectTrigger>
            <SelectContent>
              {experienceLevels.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  {level.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Special Skills */}
        <div className="grid gap-3">
          <Label>Special Skills (Optional)</Label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g., Ventilator management"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
              className="bg-secondary"
            />
            <Button type="button" variant="secondary" onClick={addSkill} className="gap-1">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
          {formData.specialSkills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.specialSkills.map((skill) => (
                <Badge key={skill} variant="secondary" className="gap-1">
                  {skill}
                  <button onClick={() => removeSkill(skill)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
