import * as React from "react";

import { formControlClassName, type FormControlAccent } from "@/components/ui/form-control";
import { cn } from "@/lib/utils";

type InputProps = React.ComponentProps<"input"> & { accent?: FormControlAccent };

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, accent, ...props }, ref) => {
    const legacyAccent = className?.includes("focus:border-amber")
      ? "amber"
      : className?.includes("focus:border-indigo")
        ? "indigo"
        : "green";
    const resolvedAccent = accent ?? legacyAccent;
    const resolvedClassName = className?.replace(/focus:(border|ring)-(green|amber|indigo)(?:\/20)?/g, "");

    return (
      <input
        type={type}
        className={cn(
          "flex h-11 " + formControlClassName(resolvedAccent),
          resolvedClassName,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
