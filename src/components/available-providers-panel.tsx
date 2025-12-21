"use client"

import { useState } from "react"
import { Search, Filter, Star, MapPin, CheckCircle2, AlertCircle, Clock } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import type { Position } from "./open-positions-panel"

interface Provider {
  id: string
  name: string
  title: string
  specialty: string
  location: string
  distance: string
  rating: number
  yearsExperience: number
  credentials: string[]
  availability: "available" | "partial" | "unavailable"
  matchScore: number
  hourlyRate: string
  avatar: string
}

const mockProviders: Provider[] = [
  {
    id: "1",
    name: "Sarah Johnson",
    title: "Registered Nurse",
    specialty: "ICU/Critical Care",
    location: "San Francisco, CA",
    distance: "2.5 miles",
    rating: 4.9,
    yearsExperience: 8,
    credentials: ["RN License", "BLS", "ACLS", "CCRN"],
    availability: "available",
    matchScore: 98,
    hourlyRate: "$82/hr",
    avatar: "SJ",
  },
  {
    id: "2",
    name: "Michael Chen",
    title: "Registered Nurse",
    specialty: "Emergency Medicine",
    location: "Oakland, CA",
    distance: "8 miles",
    rating: 4.8,
    yearsExperience: 6,
    credentials: ["RN License", "BLS", "ACLS", "PALS", "TNCC"],
    availability: "available",
    matchScore: 94,
    hourlyRate: "$80/hr",
    avatar: "MC",
  },
  {
    id: "3",
    name: "Emily Rodriguez",
    title: "Registered Nurse",
    specialty: "Medical-Surgical",
    location: "San Jose, CA",
    distance: "15 miles",
    rating: 4.7,
    yearsExperience: 5,
    credentials: ["RN License", "BLS", "ACLS"],
    availability: "partial",
    matchScore: 87,
    hourlyRate: "$75/hr",
    avatar: "ER",
  },
  {
    id: "4",
    name: "David Kim",
    title: "Registered Nurse",
    specialty: "ICU/Critical Care",
    location: "Berkeley, CA",
    distance: "12 miles",
    rating: 4.9,
    yearsExperience: 10,
    credentials: ["RN License", "BLS", "ACLS", "CCRN"],
    availability: "available",
    matchScore: 96,
    hourlyRate: "$85/hr",
    avatar: "DK",
  },
  {
    id: "5",
    name: "Lisa Thompson",
    title: "Registered Nurse",
    specialty: "Pediatrics",
    location: "Palo Alto, CA",
    distance: "20 miles",
    rating: 4.6,
    yearsExperience: 4,
    credentials: ["RN License", "BLS", "PALS"],
    availability: "unavailable",
    matchScore: 72,
    hourlyRate: "$70/hr",
    avatar: "LT",
  },
]

const availabilityConfig = {
  available: { label: "Available", color: "text-green-400", bg: "bg-green-500/20", icon: CheckCircle2 },
  partial: { label: "Partial", color: "text-yellow-400", bg: "bg-yellow-500/20", icon: Clock },
  unavailable: { label: "Unavailable", color: "text-red-400", bg: "bg-red-500/20", icon: AlertCircle },
}

interface AvailableProvidersPanelProps {
  selectedPosition: Position | null
  selectedProviders: string[]
  onToggleProvider: (providerId: string) => void
  onAssignClick?: () => void
}

export function AvailableProvidersPanel({
  selectedPosition,
  selectedProviders,
  onToggleProvider,
  onAssignClick,
}: AvailableProvidersPanelProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredProviders = mockProviders
    .filter(
      (provider) =>
        provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.specialty.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => b.matchScore - a.matchScore)

  if (!selectedPosition) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">Select a Position</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Choose an open position from the left panel to view matching available providers
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Available Providers</h2>
            <p className="text-sm text-muted-foreground">
              {filteredProviders.length} providers match &quot;{selectedPosition.title}&quot;
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 bg-transparent">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
            {selectedProviders.length > 0 && (
              <Button size="sm" className="gap-2" onClick={onAssignClick}>
                Assign ({selectedProviders.length})
              </Button>
            )}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search providers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-secondary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-2">
          {filteredProviders.map((provider) => {
            const availConfig = availabilityConfig[provider.availability]
            const AvailIcon = availConfig.icon
            const isSelected = selectedProviders.includes(provider.id)

            return (
              <div
                key={provider.id}
                className={cn(
                  "rounded-lg border p-4 transition-all",
                  isSelected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50",
                )}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleProvider(provider.id)}
                    disabled={provider.availability === "unavailable"}
                    className="mt-1"
                  />

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary">
                    {provider.avatar}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <h3 className="font-medium text-foreground">{provider.name}</h3>
                        <p className="text-sm text-muted-foreground">{provider.specialty}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                            availConfig.bg,
                            availConfig.color,
                          )}
                        >
                          <AvailIcon className="h-3 w-3" />
                          {availConfig.label}
                        </div>
                        <Badge className="bg-primary/20 text-primary border-primary/30">
                          {provider.matchScore}% Match
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mb-3">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{provider.distance}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                        <span>{provider.rating} rating</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>{provider.yearsExperience} yrs exp</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {provider.credentials.map((cred) => {
                        const isRequired = selectedPosition.requiredCredentials.includes(cred)
                        return (
                          <Badge
                            key={cred}
                            variant="secondary"
                            className={cn(
                              "text-xs",
                              isRequired && "bg-green-500/20 text-green-400 border-green-500/30",
                            )}
                          >
                            {isRequired && <CheckCircle2 className="h-3 w-3 mr-1" />}
                            {cred}
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
