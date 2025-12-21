"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Shield, Users, Eye, Edit2, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

interface Permission {
  id: string
  name: string
  description: string
}

interface Role {
  id: string
  name: string
  description: string
  userCount: number
  permissions: Record<string, boolean>
  color: string
  icon: string
}

const permissions: Permission[] = [
  { id: "view_dashboard", name: "View Dashboard", description: "Access to main dashboard and statistics" },
  { id: "manage_providers", name: "Manage Providers", description: "Add, edit, and remove healthcare providers" },
  { id: "manage_positions", name: "Manage Positions", description: "Create and edit open positions" },
  { id: "assign_providers", name: "Assign Providers", description: "Match and assign providers to positions" },
  { id: "manage_users", name: "Manage Users", description: "Add, edit, and remove system users" },
  { id: "view_reports", name: "View Reports", description: "Access analytics and reporting features" },
  { id: "system_settings", name: "System Settings", description: "Configure system-wide settings" },
]

const roles: Role[] = [
  {
    id: "admin",
    name: "Administrator",
    description: "Full system access with all permissions",
    userCount: 2,
    permissions: {
      view_dashboard: true,
      manage_providers: true,
      manage_positions: true,
      assign_providers: true,
      manage_users: true,
      view_reports: true,
      system_settings: true,
    },
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    icon: "Admin",
  },
  {
    id: "manager",
    name: "Manager",
    description: "Manage providers and positions, view reports",
    userCount: 4,
    permissions: {
      view_dashboard: true,
      manage_providers: true,
      manage_positions: true,
      assign_providers: true,
      manage_users: false,
      view_reports: true,
      system_settings: false,
    },
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: "Mgr",
  },
  {
    id: "coordinator",
    name: "Coordinator",
    description: "Assign providers and manage day-to-day operations",
    userCount: 8,
    permissions: {
      view_dashboard: true,
      manage_providers: false,
      manage_positions: false,
      assign_providers: true,
      manage_users: false,
      view_reports: false,
      system_settings: false,
    },
    color: "bg-primary/20 text-primary border-primary/30",
    icon: "Crd",
  },
  {
    id: "viewer",
    name: "Viewer",
    description: "Read-only access to dashboard and data",
    userCount: 12,
    permissions: {
      view_dashboard: true,
      manage_providers: false,
      manage_positions: false,
      assign_providers: false,
      manage_users: false,
      view_reports: true,
      system_settings: false,
    },
    color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    icon: "Vwr",
  },
]

export function RoleManagementPanel() {
  return (
    <div className="h-full overflow-auto bg-card p-6">
      <div className="grid gap-6">
        {roles.map((role) => (
          <Card key={role.id} className="bg-secondary/50 border-border">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn("flex h-10 w-10 items-center justify-center rounded-lg", role.color.split(" ")[0])}
                  >
                    <Shield className={cn("h-5 w-5", role.color.split(" ")[1])} />
                  </div>
                  <div>
                    <CardTitle className="text-base">{role.name}</CardTitle>
                    <CardDescription>{role.description}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="gap-1">
                    <Users className="h-3 w-3" />
                    {role.userCount} users
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {permissions.map((permission) => (
                  <div
                    key={permission.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
                        {permission.id === "view_dashboard" && <Eye className="h-4 w-4 text-muted-foreground" />}
                        {permission.id === "manage_providers" && <Users className="h-4 w-4 text-muted-foreground" />}
                        {permission.id === "manage_positions" && <Edit2 className="h-4 w-4 text-muted-foreground" />}
                        {permission.id === "assign_providers" && <Shield className="h-4 w-4 text-muted-foreground" />}
                        {permission.id === "manage_users" && <Users className="h-4 w-4 text-muted-foreground" />}
                        {permission.id === "view_reports" && <Eye className="h-4 w-4 text-muted-foreground" />}
                        {permission.id === "system_settings" && <Settings className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{permission.name}</p>
                        <p className="text-xs text-muted-foreground">{permission.description}</p>
                      </div>
                    </div>
                    <Switch checked={role.permissions[permission.id]} disabled={role.id === "admin"} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
