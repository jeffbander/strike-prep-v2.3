import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, MapPin, Clock } from "lucide-react"
import Link from "next/link"

const urgentPositions = [
  {
    id: "1",
    title: "ICU Registered Nurse",
    facility: "Memorial General Hospital",
    location: "San Francisco, CA",
    urgency: "critical",
    daysOpen: 3,
    matchCount: 12,
  },
  {
    id: "2",
    title: "Emergency Room Nurse",
    facility: "St. Mary's Medical Center",
    location: "Oakland, CA",
    urgency: "critical",
    daysOpen: 2,
    matchCount: 8,
  },
  {
    id: "3",
    title: "Labor & Delivery Nurse",
    facility: "Women's Health Pavilion",
    location: "Palo Alto, CA",
    urgency: "high",
    daysOpen: 5,
    matchCount: 15,
  },
]

const urgencyColors = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
}

export function UrgentPositionsCard() {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-base font-semibold">Urgent Positions</CardTitle>
        <Button variant="ghost" size="sm" className="gap-1 text-primary" asChild>
          <Link href="/">
            View All
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {urgentPositions.map((position) => (
          <div
            key={position.id}
            className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-4"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-foreground truncate">{position.title}</h4>
                <Badge variant="outline" className={urgencyColors[position.urgency as keyof typeof urgencyColors]}>
                  {position.urgency}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-2">{position.facility}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {position.location}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Open {position.daysOpen} days
                </span>
              </div>
            </div>
            <div className="text-right ml-4">
              <p className="text-lg font-semibold text-primary">{position.matchCount}</p>
              <p className="text-xs text-muted-foreground">matches</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
