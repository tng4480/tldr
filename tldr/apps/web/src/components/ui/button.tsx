import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background shadow-sm shadow-black/5 hover:shadow-md hover:shadow-black/10 active:translate-y-[1px] active:shadow-inner",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 hover:ring-2 hover:ring-ring/20",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:ring-2 hover:ring-ring/20",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground hover:ring-2 hover:ring-ring/15",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/85 hover:ring-2 hover:ring-ring/15",
        ghost: "bg-transparent shadow-none hover:bg-accent hover:text-accent-foreground hover:ring-2 hover:ring-ring/10 active:shadow-none",
        link: "bg-transparent shadow-none hover:shadow-none active:translate-y-0 active:shadow-none text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-lg px-8",
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
