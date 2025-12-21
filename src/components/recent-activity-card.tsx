import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { UserPlus, CheckCircle2, FileText, AlertCircle, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

const activities = [
  {
    id: "1",
    type: "assignment",
    title: "Sarah Johnson assigned to ICU position",
    description: "Memorial General Hospital - San Francisco",
    time: "2 hours ago",
    icon: CheckCircle2,
    iconBg: "bg-green-500/10",
    iconColor: "text-green-400",
  },
  {
    id: "2",
    type: "provider",
    title: "New provider onboarded",
    description: "Michael Chen - Emergency Medicine RN",
    time: "4 hours ago",
    icon: UserPlus,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  {
    id: "3",
    type: "document",
    title: "Credentials verified",
    description: "Emily Rodriguez - BLS, ACLS certifications",
    time: "5 hours ago",
    icon: FileText,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400",
  },
  {
    id: "4",
    type: "alert",
    title: "Position unfilled past deadline",
    description: "OR Nurse - Valley Health System",
    time: "1 day ago",
    icon: AlertCircle,
    iconBg: "bg-red-500/10",
    iconColor: "text-red-400",
  },
]

export function RecentActivityCard() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
        <Button variant="ghost" size="sm" className="gap-1 text-primary">
          View All
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity, index) => (
            <div key={activity.id} className="flex gap-3">
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", activity.iconBg)}>
                <activity.icon className={cn("h-4 w-4", activity.iconColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{activity.title}</p>
                <p className="text-xs text-muted-foreground">{activity.description}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{activity.time}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
