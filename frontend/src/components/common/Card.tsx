import { motion, type HTMLMotionProps } from "framer-motion";

import { cn } from "@/lib/utils";

type CardProps = HTMLMotionProps<"div"> & {
  delay?: number;
};

export function Card({ className, delay = 0, children, ...props }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      className={cn(
        "rounded-card border border-border bg-bg-card p-5 shadow-card",
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
