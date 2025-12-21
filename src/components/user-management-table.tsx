"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Search, Mail, Shield, CheckCircle2, XCircle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

interface User {
  id: string
  name: string
  email: string
  role: "admin" | "manager" | "coordinator" | "viewer"
  status: "active" | "inactive" | "pending"
  lastLogin: string
  avatar: string
  createdAt: string
}

const mockUsers: User[] = [
  {
    id: "1",
    name: "John Doe",
    email: "john.doe@strikeprep.com",
    role: "admin",
    status: "active",
    lastLogin: "2 hours ago",
    avatar: "JD",
    createdAt: "Jan 15, 2024",
  },
  {
    id: "2",
    name: "Jane Smith",
    email: "jane.smith@strikeprep.com",
    role: "manager",
    status: "active",
    lastLogin: "5 hours ago",
    avatar: "JS",
    createdAt: "Feb 20, 2024",
  },
  {
    id: "3",
    name: "Mike Johnson",
    email: "mike.johnson@strikeprep.com",
    role: "coordinator",
    status: "active",
    lastLogin: "1 day ago",
    avatar: "MJ",
    createdAt: "Mar 10, 2024",
  },
  {
    id: "4",
    name: "Sarah Williams",
    email: "sarah.williams@strikeprep.com",
    role: "coordinator",
    status: "inactive",
    lastLogin: "2 weeks ago",
    avatar: "SW",
    createdAt: "Apr 5, 2024",
  },
  {
    id: "5",
    name: "Alex Brown",
    email: "alex.brown@strikeprep.com",
    role: "viewer",
    status: "pending",
    lastLogin: "Never",
    avatar: "AB",
    createdAt: "Nov 20, 2024",
  },
  {
    id: "6",
    name: "Emily Davis",
    email: "emily.davis@strikeprep.com",
    role: "manager",
    status: "active",
    lastLogin: "3 hours ago",
    avatar: "ED",
    createdAt: "May 15, 2024",
  },
]

const roleConfig = {
  admin: { label: "Admin", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  manager: { label: "Manager", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  coordinator: { label: "Coordinator", color: "bg-primary/20 text-primary border-primary/30" },
  viewer: { label: "Viewer", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
}

const statusConfig = {
  active: { label: "Active", icon: CheckCircle2, color: "text-green-400" },
  inactive: { label: "Inactive", icon: XCircle, color: "text-gray-400" },
  pending: { label: "Pending", icon: Clock, color: "text-yellow-400" },
}

export function UserManagementTable() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])

  const filteredUsers = mockUsers.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const toggleAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([])
    } else {
      setSelectedUsers(filteredUsers.map((u) => u.id))
    }
  }

  const toggleUser = (id: string) => {
    setSelectedUsers((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]))
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search Bar */}
      <div className="border-b border-border bg-card p-4">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-secondary"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-secondary">
            <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
              <th className="p-4 w-12">
                <Checkbox
                  checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                  onCheckedChange={toggleAll}
                />
              </th>
              <th className="p-4">User</th>
              <th className="p-4">Role</th>
              <th className="p-4">Status</th>
              <th className="p-4">Last Login</th>
              <th className="p-4">Created</th>
              <th className="p-4 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredUsers.map((user) => {
              const StatusIcon = statusConfig[user.status].icon
              return (
                <tr
                  key={user.id}
                  className={cn(
                    "hover:bg-secondary/50 transition-colors",
                    selectedUsers.includes(user.id) && "bg-primary/5",
                  )}
                >
                  <td className="p-4">
                    <Checkbox checked={selectedUsers.includes(user.id)} onCheckedChange={() => toggleUser(user.id)} />
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary">
                        {user.avatar}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{user.name}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <Badge variant="outline" className={roleConfig[user.role].color}>
                      <Shield className="h-3 w-3 mr-1" />
                      {roleConfig[user.role].label}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <div className={cn("flex items-center gap-1.5 text-sm", statusConfig[user.status].color)}>
                      <StatusIcon className="h-4 w-4" />
                      {statusConfig[user.status].label}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-muted-foreground">{user.lastLogin}</td>
                  <td className="p-4 text-sm text-muted-foreground">{user.createdAt}</td>
                  <td className="p-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Edit User</DropdownMenuItem>
                        <DropdownMenuItem>Change Role</DropdownMenuItem>
                        <DropdownMenuItem>Reset Password</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {user.status === "active" ? (
                          <DropdownMenuItem className="text-yellow-400">Deactivate</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="text-green-400">Activate</DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive">Delete User</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {selectedUsers.length > 0
              ? `${selectedUsers.length} of ${filteredUsers.length} selected`
              : `${filteredUsers.length} users`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <span>Page 1 of 1</span>
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
