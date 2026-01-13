import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.98]",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",

        // Status action variants
        success:
          "bg-status-success text-white hover:bg-status-success/90 active:scale-[0.98]",
        warning:
          "bg-status-warning text-white hover:bg-status-warning/90 active:scale-[0.98]",
        danger:
          "bg-status-danger text-white hover:bg-status-danger/90 active:scale-[0.98]",
        info:
          "bg-status-info text-white hover:bg-status-info/90 active:scale-[0.98]",

        // Soft status variants (for secondary actions)
        "success-soft":
          "bg-status-success-bg text-status-success border border-status-success-border hover:bg-status-success hover:text-white",
        "warning-soft":
          "bg-status-warning-bg text-status-warning border border-status-warning-border hover:bg-status-warning hover:text-white",
        "danger-soft":
          "bg-status-danger-bg text-status-danger border border-status-danger-border hover:bg-status-danger hover:text-white",
        "info-soft":
          "bg-status-info-bg text-status-info border border-status-info-border hover:bg-status-info hover:text-white",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
