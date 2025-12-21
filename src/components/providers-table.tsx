"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  MoreHorizontal,
  Mail,
  MapPin,
  Star,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronUp,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Provider {
  id: string
  name: string
  email: string
  phone: string
  title: string
  specialty: string
  location: string
  status: "active" | "inactive" | "pending"
  credentialStatus: "verified" | "pending" | "expired"
  rating: number
  completedAssignments: number
  credentials: string[]
  avatar: string
  lastActive: string
}

const mockProviders: Provider[] = [
  {
    id: "1",
    name: "Sarah Johnson",
    email: "sarah.johnson@email.com",
    phone: "(415) 555-0123",
    title: "Registered Nurse",
    specialty: "ICU/Critical Care",
    location: "San Francisco, CA",
    status: "active",
    credentialStatus: "verified",
    rating: 4.9,
    completedAssignments: 47,
    credentials: ["RN License", "BLS", "ACLS", "CCRN"],
    avatar: "SJ",
    lastActive: "2 hours ago",
  },
  {
    id: "2",
    name: "Michael Chen",
    email: "michael.chen@email.com",
    phone: "(510) 555-0456",
    title: "Registered Nurse",
    specialty: "Emergency Medicine",
    location: "Oakland, CA",
    status: "active",
    credentialStatus: "verified",
    rating: 4.8,
    completedAssignments: 32,
    credentials: ["RN License", "BLS", "ACLS", "PALS", "TNCC"],
    avatar: "MC",
    lastActive: "5 hours ago",
  },
  {
    id: "3",
    name: "Emily Rodriguez",
    email: "emily.rodriguez@email.com",
    phone: "(408) 555-0789",
    title: "Registered Nurse",
    specialty: "Medical-Surgical",
    location: "San Jose, CA",
    status: "active",
    credentialStatus: "pending",
    rating: 4.7,
    completedAssignments: 28,
    credentials: ["RN License", "BLS", "ACLS"],
    avatar: "ER",
    lastActive: "1 day ago",
  },
  {
    id: "4",
    name: "David Kim",
    email: "david.kim@email.com",
    phone: "(510) 555-1234",
    title: "Registered Nurse",
    specialty: "ICU/Critical Care",
    location: "Berkeley, CA",
    status: "active",
    credentialStatus: "verified",
    rating: 4.9,
    completedAssignments: 63,
    credentials: ["RN License", "BLS", "ACLS", "CCRN"],
    avatar: "DK",
    lastActive: "3 hours ago",
  },
  {
    id: "5",
    name: "Lisa Thompson",
    email: "lisa.thompson@email.com",
    phone: "(650) 555-5678",
    title: "Registered Nurse",
    specialty: "Pediatrics",
    location: "Palo Alto, CA",
    status: "inactive",
    credentialStatus: "expired",
    rating: 4.6,
    completedAssignments: 21,
    credentials: ["RN License", "BLS", "PALS"],
    avatar: "LT",
    lastActive: "2 weeks ago",
  },
  {
    id: "6",
    name: "James Wilson",
    email: "james.wilson@email.com",
    phone: "(925) 555-9012",
    title: "Registered Nurse",
    specialty: "Operating Room",
    location: "Walnut Creek, CA",
    status: "pending",
    credentialStatus: "pending",
    rating: 0,
    completedAssignments: 0,
    credentials: ["RN License", "BLS"],
    avatar: "JW",
    lastActive: "Just now",
  },
  {
    id: "7",
    name: "Amanda Foster",
    email: "amanda.foster@email.com",
    phone: "(415) 555-3456",
    title: "Registered Nurse",
    specialty: "Labor & Delivery",
    location: "San Francisco, CA",
    status: "active",
    credentialStatus: "verified",
    rating: 4.8,
    completedAssignments: 39,
    credentials: ["RN License", "BLS", "ACLS", "NRP"],
    avatar: "AF",
    lastActive: "6 hours ago",
  },
  {
    id: "8",
    name: "Robert Martinez",
    email: "robert.martinez@email.com",
    phone: "(510) 555-7890",
    title: "Registered Nurse",
    specialty: "Emergency Medicine",
    location: "Fremont, CA",
    status: "active",
    credentialStatus: "verified",
    rating: 4.7,
    completedAssignments: 45,
    credentials: ["RN License", "BLS", "ACLS", "TNCC"],
    avatar: "RM",
    lastActive: "1 hour ago",
  },
]

const statusConfig = {
  active: { label: "Active", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  inactive: { label: "Inactive", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  pending: { label: "Pending", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
}

const credentialConfig = {
  verified: { label: "Verified", icon: CheckCircle2, color: "text-green-400" },
  pending: { label: "Pending", icon: Clock, color: "text-yellow-400" },
  expired: { label: "Expired", icon: AlertCircle, color: "text-red-400" },
}

interface ProvidersTableProps {
  filters: {
    search: string
    status: string
    specialty: string
    credentialStatus: string
  }
}

export function ProvidersTable({ filters }: ProvidersTableProps) {
  const [selectedProviders, setSelectedProviders] = useState<string[]>([])
  const [sortField, setSortField] = useState<string>("name")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")

  const filteredProviders = mockProviders.filter((provider) => {
    if (
      filters.search &&
      !provider.name.toLowerCase().includes(filters.search.toLowerCase()) &&
      !provider.email.toLowerCase().includes(filters.search.toLowerCase())
    ) {
      return false
    }
    if (filters.status !== "all" && provider.status !== filters.status) {
      return false
    }
    if (filters.credentialStatus !== "all" && provider.credentialStatus !== filters.credentialStatus) {
      return false
    }
    return true
  })

  const toggleAll = () => {
    if (selectedProviders.length === filteredProviders.length) {
      setSelectedProviders([])
    } else {
      setSelectedProviders(filteredProviders.map((p) => p.id))
    }
  }

  const toggleProvider = (id: string) => {
    setSelectedProviders((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null
    return sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-secondary">
            <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
              <th className="p-4 w-12">
                <Checkbox
                  checked={selectedProviders.length === filteredProviders.length && filteredProviders.length > 0}
                  onCheckedChange={toggleAll}
                />
              </th>
              <th className="p-4">
                <button onClick={() => handleSort("name")} className="flex items-center gap-1 hover:text-foreground">
                  Provider <SortIcon field="name" />
                </button>
              </th>
              <th className="p-4">
                <button
                  onClick={() => handleSort("specialty")}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Specialty <SortIcon field="specialty" />
                </button>
              </th>
              <th className="p-4">Location</th>
              <th className="p-4">Status</th>
              <th className="p-4">Credentials</th>
              <th className="p-4">
                <button onClick={() => handleSort("rating")} className="flex items-center gap-1 hover:text-foreground">
                  Rating <SortIcon field="rating" />
                </button>
              </th>
              <th className="p-4">Assignments</th>
              <th className="p-4 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredProviders.map((provider) => {
              const CredIcon = credentialConfig[provider.credentialStatus].icon
              return (
                <tr
                  key={provider.id}
                  className={cn(
                    "hover:bg-secondary/50 transition-colors",
                    selectedProviders.includes(provider.id) && "bg-primary/5",
                  )}
                >
                  <td className="p-4">
                    <Checkbox
                      checked={selectedProviders.includes(provider.id)}
                      onCheckedChange={() => toggleProvider(provider.id)}
                    />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary">
                        {provider.avatar}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{provider.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {provider.email}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div>
                      <p className="text-sm text-foreground">{provider.specialty}</p>
                      <p className="text-xs text-muted-foreground">{provider.title}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {provider.location}
                    </span>
                  </td>
                  <td className="p-4">
                    <Badge variant="outline" className={statusConfig[provider.status].color}>
                      {statusConfig[provider.status].label}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <CredIcon className={cn("h-4 w-4", credentialConfig[provider.credentialStatus].color)} />
                      <span className="text-sm text-muted-foreground">
                        {credentialConfig[provider.credentialStatus].label}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    {provider.rating > 0 ? (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="text-sm font-medium text-foreground">{provider.rating}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">No ratings</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className="text-sm text-foreground">{provider.completedAssignments}</span>
                  </td>
                  <td className="p-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>View Profile</DropdownMenuItem>
                        <DropdownMenuItem>Edit Provider</DropdownMenuItem>
                        <DropdownMenuItem>View Assignments</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>Verify Credentials</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Deactivate</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {selectedProviders.length > 0
              ? `${selectedProviders.length} of ${filteredProviders.length} selected`
              : `${filteredProviders.length} providers`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <span className="text-sm">Page 1 of 1</span>
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
