"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ProviderFiltersProps {
  filters: {
    search: string
    status: string
    specialty: string
    credentialStatus: string
  }
  onFiltersChange: (filters: ProviderFiltersProps["filters"]) => void
}

export function ProviderFilters({ filters, onFiltersChange }: ProviderFiltersProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search providers..."
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="w-64 pl-9 bg-secondary"
        />
      </div>

      <Select value={filters.status} onValueChange={(value) => onFiltersChange({ ...filters, status: value })}>
        <SelectTrigger className="w-36 bg-secondary">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.specialty} onValueChange={(value) => onFiltersChange({ ...filters, specialty: value })}>
        <SelectTrigger className="w-44 bg-secondary">
          <SelectValue placeholder="Specialty" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Specialties</SelectItem>
          <SelectItem value="icu">ICU/Critical Care</SelectItem>
          <SelectItem value="er">Emergency</SelectItem>
          <SelectItem value="medsurg">Med-Surg</SelectItem>
          <SelectItem value="labor">Labor & Delivery</SelectItem>
          <SelectItem value="peds">Pediatrics</SelectItem>
          <SelectItem value="or">Operating Room</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.credentialStatus}
        onValueChange={(value) => onFiltersChange({ ...filters, credentialStatus: value })}
      >
        <SelectTrigger className="w-44 bg-secondary">
          <SelectValue placeholder="Credentials" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Credentials</SelectItem>
          <SelectItem value="verified">Verified</SelectItem>
          <SelectItem value="pending">Pending Review</SelectItem>
          <SelectItem value="expired">Expired</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
