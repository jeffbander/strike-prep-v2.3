"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileSpreadsheet,
  Building2,
  AlertTriangle,
  ArrowLeftRight,
  ClipboardList,
  LogOut,
  CalendarDays,
} from "lucide-react"
import { SignOutButton } from "@clerk/nextjs"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Scenarios", href: "/dashboard/scenarios", icon: AlertTriangle },
  { name: "Providers", href: "/dashboard/providers", icon: Users },
  { name: "Services", href: "/dashboard/services", icon: Calendar },
  { name: "Amion Schedule", href: "/dashboard/amion", icon: CalendarDays },
  { name: "Hospitals", href: "/dashboard/hospitals", icon: Building2 },
  { name: "Coverage", href: "/dashboard/coverage", icon: ClipboardList },
]

export function Sidebar() {
  const pathname = usePathname()
  const currentUser = useQuery(api.users.getCurrentUser)

  const userInitials = currentUser
    ? `${currentUser.firstName?.[0] || ""}${currentUser.lastName?.[0] || ""}`.toUpperCase() || "?"
    : "..."

  const userName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim() || currentUser.email
    : "Loading..."

  const userRole = currentUser?.role?.replace(/_/g, " ") || "..."

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-700 bg-slate-800">
      <div className="flex h-16 items-center gap-3 border-b border-slate-700 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
          <FileSpreadsheet className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-white">Strike Prep</h1>
          <p className="text-xs text-slate-400">v2.0</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-slate-400 hover:bg-slate-700 hover:text-white",
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-slate-700 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600/20 text-sm font-medium text-blue-400">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <p className="text-xs text-slate-400 truncate capitalize">{userRole}</p>
          </div>
          <SignOutButton>
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
              <LogOut className="h-4 w-4" />
            </button>
          </SignOutButton>
        </div>
      </div>
    </aside>
  )
}
