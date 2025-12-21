import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface Step {
  id: number
  name: string
  description: string
}

interface ServiceFormStepsProps {
  steps: Step[]
  currentStep: number
}

export function ServiceFormSteps({ steps, currentStep }: ServiceFormStepsProps) {
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center">
        {steps.map((step, index) => (
          <li key={step.id} className={cn("relative", index !== steps.length - 1 && "flex-1")}>
            <div className="flex items-center">
              <div
                className={cn(
                  "relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
                  step.id < currentStep
                    ? "border-primary bg-primary text-primary-foreground"
                    : step.id === currentStep
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary text-muted-foreground",
                )}
              >
                {step.id < currentStep ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <span className="text-sm font-medium">{step.id}</span>
                )}
              </div>

              {index !== steps.length - 1 && (
                <div className={cn("ml-4 h-0.5 flex-1", step.id < currentStep ? "bg-primary" : "bg-border")} />
              )}
            </div>

            <div className="mt-2">
              <p
                className={cn(
                  "text-sm font-medium",
                  step.id === currentStep ? "text-primary" : "text-muted-foreground",
                )}
              >
                {step.name}
              </p>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  )
}
