import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRight, Calendar } from "lucide-react"

const assignments = [
  {
    id: "1",
    provider: "Sarah Johnson",
    avatar: "SJ",
    facility: "Memorial General Hospital",
    date: "Dec 1, 2024",
    shift: "Day Shift",
  },
  {
    id: "2",
    provider: "Michael Chen",
    avatar: "MC",
    facility: "St. Mary's Medical Center",
    date: "Dec 2, 2024",
    shift: "Night Shift",
  },
  {
    id: "3",
    provider: "David Kim",
    avatar: "DK",
    facility: "Valley Health System",
    date: "Dec 3, 2024",
    shift: "Day Shift",
  },
]

export function UpcomingAssignmentsCard() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-base font-semibold">Upcoming Assignments</CardTitle>
        <Button variant="ghost" size="sm" className="gap-1 text-primary">
          View All
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignments.map((assignment) => (
          <div
            key={assignment.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary">
              {assignment.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{assignment.provider}</p>
              <p className="text-xs text-muted-foreground truncate">{assignment.facility}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {assignment.date}
              </p>
              <p className="text-xs text-muted-foreground">{assignment.shift}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
