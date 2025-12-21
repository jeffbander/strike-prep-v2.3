"use client"

import { useState } from "react"
import { Search, Filter, Star, CheckCircle2, Clock } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Provider {
  id: string
  name: string
  type: "Resident" | "Fellow" | "PA" | "NP" | "Attending"
  specialty: string
  rating: number
  credentials: string[]
  availability: "available" | "partial" | "unavailable"
  avatar: string
}

const mockProviders: Provider[] = [
  {
    id: "1",
    name: "Sarah Johnson",
    type: "Resident",
    specialty: "ICU/Critical Care",
    rating: 4.9,
    credentials: ["RN License", "BLS", "ACLS", "CCRN"],
    availability: "available",
    avatar: "SJ",
  },
  {
    id: "2",
    name: "Michael Chen",
    type: "Fellow",
    specialty: "Emergency Medicine",
    rating: 4.8,
    credentials: ["MD", "BLS", "ACLS", "PALS"],
    availability: "available",
    avatar: "MC",
  },
  {
    id: "3",
    name: "Emily Rodriguez",
    type: "PA",
    specialty: "Medical-Surgical",
    rating: 4.7,
    credentials: ["PA-C", "BLS", "ACLS"],
    availability: "partial",
    avatar: "ER",
  },
  {
    id: "4",
    name: "David Kim",
    type: "NP",
    specialty: "ICU/Critical Care",
    rating: 4.9,
    credentials: ["NP", "BLS", "ACLS", "CCRN"],
    availability: "available",
    avatar: "DK",
  },
  {
    id: "5",
    name: "Lisa Thompson",
    type: "Attending",
    specialty: "Cardiology",
    rating: 4.9,
    credentials: ["MD", "BLS", "ACLS", "Board Certified"],
    availability: "available",
    avatar: "LT",
  },
  {
    id: "6",
    name: "Jordan Lee",
    type: "Resident",
    specialty: "Pediatrics",
    rating: 4.6,
    credentials: ["MD", "BLS", "PALS"],
    availability: "available",
    avatar: "JL",
  },
]

const providerTypeColors = {
  Resident: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Fellow: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  PA: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  NP: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  Attending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
}

export function ProviderPoolPanel() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedType, setSelectedType] = useState<string | null>(null)

  const filteredProviders = mockProviders.filter(
    (provider) =>
      (provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.type.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (!selectedType || provider.type === selectedType),
  )

  const providerTypes = ["Resident", "Fellow", "PA", "NP", "Attending"]

  return (
    <div className="flex h-full flex-col bg-card border-r border-border">
      <div className="border-b border-border p-4">
        <h2 className="text-base font-semibold text-foreground mb-1">Provider Pool</h2>
        <p className="text-sm text-muted-foreground mb-4">{filteredProviders.length} available providers</p>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search providers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-secondary"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {providerTypes.map((type) => (
            <Button
              key={type}
              variant="outline"
              size="sm"
              onClick={() => setSelectedType(selectedType === type ? null : type)}
              className={cn("text-xs", selectedType === type && "bg-primary/20 border-primary text-primary")}
            >
              {type}
            </Button>
          ))}
          <Button variant="outline" size="sm" className="gap-2 bg-transparent">
            <Filter className="h-3 w-3" />
            More
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-2">
          {filteredProviders.map((provider) => (
            <div
              key={provider.id}
              className={cn(
                "rounded-lg border p-3 transition-all cursor-move",
                "border-border bg-card hover:border-primary/50 hover:bg-card/80",
              )}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("providerId", provider.id)
                e.dataTransfer.effectAllowed = "copy"
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary">
                  {provider.avatar}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <h3 className="font-medium text-foreground text-sm">{provider.name}</h3>
                      <p className="text-xs text-muted-foreground">{provider.specialty}</p>
                    </div>
                    <Badge className={cn("text-xs", providerTypeColors[provider.type])}>{provider.type}</Badge>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span>{provider.rating}</span>
                    </div>
                    {provider.availability === "available" && (
                      <div className="flex items-center gap-1 text-green-400">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Available</span>
                      </div>
                    )}
                    {provider.availability === "partial" && (
                      <div className="flex items-center gap-1 text-yellow-400">
                        <Clock className="h-3 w-3" />
                        <span>Partial</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {provider.credentials.slice(0, 3).map((cred) => (
                      <Badge key={cred} variant="secondary" className="text-xs">
                        {cred}
                      </Badge>
                    ))}
                    {provider.credentials.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{provider.credentials.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
