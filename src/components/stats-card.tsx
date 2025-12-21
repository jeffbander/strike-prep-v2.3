import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, TrendingDown, AlertTriangle, type LucideIcon } from "lucide-react"

interface StatsCardProps {
  title: string
  value: string
  change: string
  changeLabel: string
  trend: "up" | "down" | "warning"
  icon: LucideIcon
}

export function StatsCard({ title, value, change, changeLabel, trend, icon: Icon }: StatsCardProps) {
  const trendConfig = {
    up: { color: "text-green-400", bg: "bg-green-500/10", TrendIcon: TrendingUp },
    down: { color: "text-green-400", bg: "bg-green-500/10", TrendIcon: TrendingDown },
    warning: { color: "text-yellow-400", bg: "bg-yellow-500/10", TrendIcon: AlertTriangle },
  }

  const { color, bg, TrendIcon } = trendConfig[trend]

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", bg)}>
            <Icon className={cn("h-5 w-5", color)} />
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <div className={cn("flex items-center gap-1", color)}>
            <TrendIcon className="h-3.5 w-3.5" />
            <span className="font-medium">{change}</span>
          </div>
          <span className="text-muted-foreground">{changeLabel}</span>
        </div>
      </CardContent>
    </Card>
  )
}
