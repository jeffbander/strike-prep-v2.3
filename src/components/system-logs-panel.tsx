"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Filter, User, Shield, FileText, AlertTriangle, CheckCircle2, Info } from "lucide-react"
import { cn } from "@/lib/utils"

interface LogEntry {
  id: string
  type: "auth" | "user" | "system" | "assignment" | "error"
  action: string
  description: string
  user: string
  timestamp: string
  severity: "info" | "warning" | "error" | "success"
}

const mockLogs: LogEntry[] = [
  {
    id: "1",
    type: "auth",
    action: "Login",
    description: "User logged in successfully",
    user: "john.doe@strikeprep.com",
    timestamp: "2024-11-26 14:32:15",
    severity: "success",
  },
  {
    id: "2",
    type: "assignment",
    action: "Provider Assigned",
    description: "Sarah Johnson assigned to ICU Registered Nurse position at Memorial General Hospital",
    user: "jane.smith@strikeprep.com",
    timestamp: "2024-11-26 14:28:42",
    severity: "info",
  },
  {
    id: "3",
    type: "user",
    action: "Role Changed",
    description: "User role updated from Coordinator to Manager",
    user: "john.doe@strikeprep.com",
    timestamp: "2024-11-26 13:45:20",
    severity: "warning",
  },
  {
    id: "4",
    type: "error",
    action: "Failed Login",
    description: "Multiple failed login attempts detected",
    user: "unknown@example.com",
    timestamp: "2024-11-26 12:15:33",
    severity: "error",
  },
  {
    id: "5",
    type: "system",
    action: "CSV Import",
    description: "Bulk import completed: 45 providers added, 3 errors",
    user: "mike.johnson@strikeprep.com",
    timestamp: "2024-11-26 11:20:00",
    severity: "warning",
  },
  {
    id: "6",
    type: "user",
    action: "User Created",
    description: "New user account created",
    user: "john.doe@strikeprep.com",
    timestamp: "2024-11-26 10:05:12",
    severity: "success",
  },
  {
    id: "7",
    type: "auth",
    action: "Password Reset",
    description: "Password reset requested",
    user: "sarah.williams@strikeprep.com",
    timestamp: "2024-11-25 16:42:30",
    severity: "info",
  },
  {
    id: "8",
    type: "assignment",
    action: "Assignment Cancelled",
    description: "Assignment cancelled: Michael Chen at St. Mary's Medical Center",
    user: "jane.smith@strikeprep.com",
    timestamp: "2024-11-25 15:30:45",
    severity: "warning",
  },
]

const typeConfig = {
  auth: { label: "Auth", icon: Shield, color: "bg-blue-500/20 text-blue-400" },
  user: { label: "User", icon: User, color: "bg-purple-500/20 text-purple-400" },
  system: { label: "System", icon: FileText, color: "bg-gray-500/20 text-gray-400" },
  assignment: { label: "Assignment", icon: CheckCircle2, color: "bg-primary/20 text-primary" },
  error: { label: "Error", icon: AlertTriangle, color: "bg-red-500/20 text-red-400" },
}

const severityConfig = {
  info: { icon: Info, color: "text-blue-400" },
  warning: { icon: AlertTriangle, color: "text-yellow-400" },
  error: { icon: AlertTriangle, color: "text-red-400" },
  success: { icon: CheckCircle2, color: "text-green-400" },
}

export function SystemLogsPanel() {
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")

  const filteredLogs = mockLogs.filter((log) => {
    if (
      searchQuery &&
      !log.description.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !log.user.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false
    }
    if (typeFilter !== "all" && log.type !== typeFilter) {
      return false
    }
    return true
  })

  return (
    <div className="flex h-full flex-col">
      {/* Filters */}
      <div className="flex items-center gap-3 border-b border-border bg-card p-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-secondary"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 bg-secondary">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="auth">Authentication</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="assignment">Assignment</SelectItem>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" className="gap-2 bg-transparent">
          <Filter className="h-4 w-4" />
          More Filters
        </Button>
      </div>

      {/* Logs List */}
      <div className="flex-1 overflow-auto">
        <div className="divide-y divide-border">
          {filteredLogs.map((log) => {
            const TypeIcon = typeConfig[log.type].icon
            const SeverityIcon = severityConfig[log.severity].icon
            return (
              <div key={log.id} className="flex items-start gap-4 p-4 hover:bg-secondary/50 transition-colors">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    typeConfig[log.type].color,
                  )}
                >
                  <TypeIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-foreground">{log.action}</span>
                    <Badge variant="outline" className={cn("text-xs", typeConfig[log.type].color)}>
                      {typeConfig[log.type].label}
                    </Badge>
                    <SeverityIcon className={cn("h-4 w-4", severityConfig[log.severity].color)} />
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">{log.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {log.user}
                    </span>
                    <span>{log.timestamp}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {filteredLogs.length} log entries</span>
          <Button variant="outline" size="sm">
            Load More
          </Button>
        </div>
      </div>
    </div>
  )
}
