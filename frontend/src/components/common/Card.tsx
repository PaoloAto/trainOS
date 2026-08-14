import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type CardProps = HTMLAttributes<HTMLDivElement> & { delay?: number };

export function Card({ className, delay, children, ...props }: CardProps) {
  void delay;
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-bg-card p-5 shadow-card",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
