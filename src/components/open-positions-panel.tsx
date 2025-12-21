"use client"

import { useState } from "react"
import { Search, Filter, MapPin, Clock, DollarSign, ChevronRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Position {
  id: string
  title: string
  department: string
  facility: string
  location: string
  shiftType: string
  startDate: string
  endDate: string
  payRate: string
  urgency: "critical" | "high" | "medium" | "low"
  requiredCredentials: string[]
}

const mockPositions: Position[] = [
  {
    id: "1",
    title: "ICU Registered Nurse",
    department: "Intensive Care Unit",
    facility: "Memorial General Hospital",
    location: "San Francisco, CA",
    shiftType: "12-hour Day",
    startDate: "Dec 1, 2024",
    endDate: "Dec 15, 2024",
    payRate: "$85/hr",
    urgency: "critical",
    requiredCredentials: ["RN License", "BLS", "ACLS"],
  },
  {
    id: "2",
    title: "Emergency Room Nurse",
    department: "Emergency Department",
    facility: "St. Mary's Medical Center",
    location: "Oakland, CA",
    shiftType: "12-hour Night",
    startDate: "Dec 5, 2024",
    endDate: "Dec 20, 2024",
    payRate: "$82/hr",
    urgency: "high",
    requiredCredentials: ["RN License", "BLS", "ACLS", "PALS"],
  },
  {
    id: "3",
    title: "Medical-Surgical Nurse",
    department: "Med-Surg Floor",
    facility: "Valley Health System",
    location: "San Jose, CA",
    shiftType: "8-hour Day",
    startDate: "Dec 10, 2024",
    endDate: "Jan 10, 2025",
    payRate: "$72/hr",
    urgency: "medium",
    requiredCredentials: ["RN License", "BLS"],
  },
  {
    id: "4",
    title: "Labor & Delivery Nurse",
    department: "Obstetrics",
    facility: "Women's Health Pavilion",
    location: "Palo Alto, CA",
    shiftType: "12-hour Day",
    startDate: "Dec 8, 2024",
    endDate: "Dec 22, 2024",
    payRate: "$88/hr",
    urgency: "high",
    requiredCredentials: ["RN License", "BLS", "NRP"],
  },
  {
    id: "5",
    title: "Pediatric Nurse",
    department: "Pediatrics",
    facility: "Children's Medical Center",
    location: "Berkeley, CA",
    shiftType: "12-hour Night",
    startDate: "Dec 12, 2024",
    endDate: "Dec 26, 2024",
    payRate: "$78/hr",
    urgency: "low",
    requiredCredentials: ["RN License", "BLS", "PALS"],
  },
]

const urgencyColors = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-green-500/20 text-green-400 border-green-500/30",
}

interface OpenPositionsPanelProps {
  selectedPosition: Position | null
  onSelectPosition: (position: Position) => void
}

export function OpenPositionsPanel({ selectedPosition, onSelectPosition }: OpenPositionsPanelProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredPositions = mockPositions.filter(
    (position) =>
      position.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      position.facility.toLowerCase().includes(searchQuery.toLowerCase()) ||
      position.department.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Open Positions</h2>
            <p className="text-sm text-muted-foreground">{filteredPositions.length} positions available</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 bg-transparent">
            <Filter className="h-4 w-4" />
            Filter
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search positions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-secondary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-2">
          {filteredPositions.map((position) => (
            <button
              key={position.id}
              onClick={() => onSelectPosition(position)}
              className={cn(
                "w-full rounded-lg border p-4 text-left transition-all",
                selectedPosition?.id === position.id
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/50 hover:bg-secondary",
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground truncate">{position.title}</h3>
                  <p className="text-sm text-muted-foreground truncate">{position.department}</p>
                </div>
                <Badge variant="outline" className={cn("shrink-0 text-xs", urgencyColors[position.urgency])}>
                  {position.urgency}
                </Badge>
              </div>

              <p className="text-sm font-medium text-foreground mb-3">{position.facility}</p>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-3">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="truncate">{position.location}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{position.shiftType}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span>{position.payRate}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>
                    {position.startDate} - {position.endDate}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {position.requiredCredentials.slice(0, 3).map((cred) => (
                  <Badge key={cred} variant="secondary" className="text-xs">
                    {cred}
                  </Badge>
                ))}
                {position.requiredCredentials.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{position.requiredCredentials.length - 3}
                  </Badge>
                )}
              </div>

              {selectedPosition?.id === position.id && (
                <div className="mt-3 flex items-center justify-end text-primary">
                  <span className="text-xs font-medium">View Matches</span>
                  <ChevronRight className="h-4 w-4" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export type { Position }
