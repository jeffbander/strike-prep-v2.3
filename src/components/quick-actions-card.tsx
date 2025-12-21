import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Upload, UserPlus, FileSpreadsheet } from "lucide-react"
import Link from "next/link"

const actions = [
  {
    label: "New Position",
    description: "Create a new service request",
    icon: Plus,
    href: "/services",
    variant: "default" as const,
  },
  {
    label: "Add Provider",
    description: "Onboard a new provider",
    icon: UserPlus,
    href: "/providers",
    variant: "secondary" as const,
  },
  {
    label: "Upload CSV",
    description: "Bulk import providers",
    icon: Upload,
    href: "/upload",
    variant: "secondary" as const,
  },
  {
    label: "Generate Report",
    description: "Export staffing data",
    icon: FileSpreadsheet,
    href: "#",
    variant: "secondary" as const,
  },
]

export function QuickActionsCard() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant}
            className="w-full justify-start gap-3 h-auto py-3"
            asChild
          >
            <Link href={action.href}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <action.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-medium">{action.label}</p>
                <p className="text-xs text-muted-foreground font-normal">{action.description}</p>
              </div>
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}
