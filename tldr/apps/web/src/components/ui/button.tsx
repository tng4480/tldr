import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] border text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-55 shadow-[0_8px_18px_rgba(0,0,0,0.06)] active:translate-y-[1px] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_6px_14px_rgba(0,0,0,0.08)]",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary/12 text-primary hover:bg-primary/20 hover:shadow-[0_0_0_3px_color-mix(in_srgb,hsl(var(--primary))_26%,transparent),0_12px_26px_rgba(0,0,0,0.1)]",
        destructive:
          "border-destructive bg-destructive/10 text-destructive hover:bg-destructive/18 hover:shadow-[0_0_0_3px_color-mix(in_srgb,hsl(var(--destructive))_26%,transparent),0_12px_26px_rgba(0,0,0,0.1)]",
        outline:
          "border-input bg-card text-card-foreground hover:bg-accent hover:shadow-[0_0_0_3px_color-mix(in_srgb,hsl(var(--primary))_22%,transparent),0_12px_26px_rgba(0,0,0,0.1)]",
        secondary:
          "border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground hover:shadow-[0_0_0_3px_color-mix(in_srgb,hsl(var(--secondary))_22%,transparent),0_12px_26px_rgba(0,0,0,0.1)]",
        ghost:
          "border-transparent bg-transparent text-foreground shadow-none hover:border-border hover:bg-accent/60 hover:shadow-[0_8px_18px_rgba(0,0,0,0.06)] active:shadow-none",
        link: "border-transparent bg-transparent text-primary shadow-none underline-offset-4 hover:underline hover:shadow-none active:translate-y-0 active:shadow-none",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
