import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40",
  {
    variants: {
      variant: {
        default: "border-border bg-muted/70 text-muted-foreground",
        secondary: "border-border bg-card text-foreground",
        outline: "border-border bg-transparent text-foreground",
        success: "border-secondary/40 bg-secondary/10 text-secondary",
        warning: "border-primary/40 bg-primary/12 text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
