import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { MapPin, Clock, DollarSign, Calendar, Briefcase, Award } from "lucide-react"
import type { ServiceFormData } from "@/components/service-form-types"

interface ServiceFormReviewProps {
  formData: ServiceFormData
}

const urgencyLabels: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
}

const urgencyColors: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-green-500/20 text-green-400 border-green-500/30",
}

export function ServiceFormReview({ formData }: ServiceFormReviewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-foreground mb-1">Review & Submit</h3>
        <p className="text-sm text-muted-foreground">Review the service request details before submitting.</p>
      </div>

      <Card className="bg-secondary/50 border-border">
        <CardContent className="p-6 space-y-6">
          {/* Position Header */}
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-xl font-semibold text-foreground">{formData.title || "Untitled Position"}</h4>
              <p className="text-muted-foreground">{formData.department}</p>
            </div>
            {formData.urgency && (
              <Badge variant="outline" className={urgencyColors[formData.urgency]}>
                {urgencyLabels[formData.urgency]}
              </Badge>
            )}
          </div>

          {/* Facility Info */}
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {formData.facility || "No facility selected"}
            </span>
          </div>

          {/* Description */}
          {formData.description && (
            <div>
              <h5 className="text-sm font-medium text-foreground mb-2">Description</h5>
              <p className="text-sm text-muted-foreground">{formData.description}</p>
            </div>
          )}

          <div className="border-t border-border pt-6 grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              <div>
                <h5 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" />
                  Required Credentials
                </h5>
                <div className="flex flex-wrap gap-1.5">
                  {formData.requiredCredentials.length > 0 ? (
                    formData.requiredCredentials.map((cred) => (
                      <Badge key={cred} className="bg-primary/20 text-primary border-primary/30">
                        {cred}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">None specified</span>
                  )}
                </div>
              </div>

              {formData.preferredCredentials.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-foreground mb-2">Preferred Credentials</h5>
                  <div className="flex flex-wrap gap-1.5">
                    {formData.preferredCredentials.map((cred) => (
                      <Badge key={cred} variant="secondary">
                        {cred}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {formData.yearsExperience && (
                <div>
                  <h5 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-primary" />
                    Experience Required
                  </h5>
                  <p className="text-sm text-muted-foreground">{formData.yearsExperience} years</p>
                </div>
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <div>
                <h5 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Schedule
                </h5>
                <p className="text-sm text-muted-foreground">
                  {formData.shiftType || "Not specified"}
                  {formData.shiftsPerWeek && ` • ${formData.shiftsPerWeek} shifts/week`}
                </p>
              </div>

              {(formData.startDate || formData.endDate) && (
                <div>
                  <h5 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    Duration
                  </h5>
                  <p className="text-sm text-muted-foreground">
                    {formData.startDate || "TBD"} to {formData.endDate || "TBD"}
                  </p>
                </div>
              )}

              {formData.payRate && (
                <div>
                  <h5 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    Compensation
                  </h5>
                  <p className="text-sm text-muted-foreground">
                    ${formData.payRate}/
                    {formData.payType === "hourly" ? "hr" : formData.payType === "daily" ? "day" : "contract"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {formData.specialSkills.length > 0 && (
            <div className="border-t border-border pt-6">
              <h5 className="text-sm font-medium text-foreground mb-2">Special Skills</h5>
              <div className="flex flex-wrap gap-1.5">
                {formData.specialSkills.map((skill) => (
                  <Badge key={skill} variant="outline">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
