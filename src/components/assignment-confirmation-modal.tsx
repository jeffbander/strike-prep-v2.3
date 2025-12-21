"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  MapPin,
  Clock,
  DollarSign,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Star,
  User,
  Building2,
  Send,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Provider {
  id: string
  name: string
  avatar: string
  specialty: string
  rating: number
  credentials: string[]
}

interface Position {
  id: string
  title: string
  facility: string
  department: string
  location: string
  shiftType: string
  startDate: string
  endDate: string
  payRate: string
  requiredCredentials: string[]
}

interface AssignmentConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: Provider | null
  position: Position | null
  onConfirm: (notes: string, sendNotification: boolean) => void
}

export function AssignmentConfirmationModal({
  open,
  onOpenChange,
  provider,
  position,
  onConfirm,
}: AssignmentConfirmationModalProps) {
  const [notes, setNotes] = useState("")
  const [sendNotification, setSendNotification] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!provider || !position) return null

  const missingCredentials = position.requiredCredentials.filter((cred) => !provider.credentials.includes(cred))

  const handleConfirm = async () => {
    setIsSubmitting(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))
    onConfirm(notes, sendNotification)
    setIsSubmitting(false)
    onOpenChange(false)
    setNotes("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl">Confirm Assignment</DialogTitle>
          <DialogDescription>Review the assignment details before confirming.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Provider & Position Summary */}
          <div className="grid grid-cols-2 gap-4">
            {/* Provider Card */}
            <div className="rounded-lg border border-border bg-secondary/50 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <User className="h-3.5 w-3.5" />
                Provider
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-lg font-medium text-primary">
                  {provider.avatar}
                </div>
                <div>
                  <h4 className="font-medium text-foreground">{provider.name}</h4>
                  <p className="text-sm text-muted-foreground">{provider.specialty}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    <span className="text-xs text-muted-foreground">{provider.rating} rating</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Position Card */}
            <div className="rounded-lg border border-border bg-secondary/50 p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <Building2 className="h-3.5 w-3.5" />
                Position
              </div>
              <div>
                <h4 className="font-medium text-foreground">{position.title}</h4>
                <p className="text-sm text-muted-foreground">{position.facility}</p>
                <p className="text-xs text-muted-foreground mt-1">{position.department}</p>
              </div>
            </div>
          </div>

          {/* Assignment Details */}
          <div className="rounded-lg border border-border bg-secondary/50 p-4">
            <h5 className="text-sm font-medium text-foreground mb-3">Assignment Details</h5>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{position.location}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{position.shiftType}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {position.startDate} - {position.endDate}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                <span>{position.payRate}</span>
              </div>
            </div>
          </div>

          {/* Credential Check */}
          <div className="rounded-lg border border-border p-4">
            <h5 className="text-sm font-medium text-foreground mb-3">Credential Verification</h5>
            <div className="flex flex-wrap gap-2">
              {position.requiredCredentials.map((cred) => {
                const hasCredential = provider.credentials.includes(cred)
                return (
                  <Badge
                    key={cred}
                    variant="outline"
                    className={cn(
                      "gap-1",
                      hasCredential
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : "bg-red-500/20 text-red-400 border-red-500/30",
                    )}
                  >
                    {hasCredential ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {cred}
                  </Badge>
                )
              })}
            </div>

            {missingCredentials.length > 0 && (
              <Alert className="mt-4 bg-yellow-500/10 border-yellow-500/30">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="text-yellow-400">
                  Provider is missing {missingCredentials.length} required credential(s). Assignment may require
                  additional verification.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Assignment Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any special instructions or notes for this assignment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-secondary min-h-20"
            />
          </div>

          {/* Notification Checkbox */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-4">
            <Checkbox
              id="notification"
              checked={sendNotification}
              onCheckedChange={(checked) => setSendNotification(checked as boolean)}
            />
            <div className="flex-1">
              <Label htmlFor="notification" className="font-medium cursor-pointer">
                Send notification to provider
              </Label>
              <p className="text-xs text-muted-foreground">
                The provider will receive an email with assignment details
              </p>
            </div>
            <Send className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting} className="gap-2">
            {isSubmitting ? (
              <>Processing...</>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Confirm Assignment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
