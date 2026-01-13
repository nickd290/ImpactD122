import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground border-border",

        // Semantic status variants - soft backgrounds with colored text
        success:
          "border-status-success-border bg-status-success-bg text-status-success",
        warning:
          "border-status-warning-border bg-status-warning-bg text-status-warning",
        danger:
          "border-status-danger-border bg-status-danger-bg text-status-danger",
        info:
          "border-status-info-border bg-status-info-bg text-status-info",
        neutral:
          "border-status-neutral-border bg-status-neutral-bg text-status-neutral",

        // Pathway variants for P1/P2/P3 routing
        p1:
          "border-transparent bg-pathway-p1-bg text-pathway-p1 font-semibold",
        p2:
          "border-transparent bg-pathway-p2-bg text-pathway-p2 font-semibold",
        p3:
          "border-transparent bg-pathway-p3-bg text-pathway-p3 font-semibold",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
