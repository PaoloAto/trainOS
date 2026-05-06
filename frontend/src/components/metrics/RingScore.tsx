import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

type RingScoreProps = {
  score: number;
  label: string;
  size?: number;
  accent?: "green" | "amber" | "indigo" | "red";
  className?: string;
};

const accentClasses: Record<NonNullable<RingScoreProps["accent"]>, string> = {
  green: "text-green",
  amber: "text-amber",
  indigo: "text-indigo",
  red: "text-red",
};

export function RingScore({
  score,
  label,
  size = 196,
  accent = "green",
  className,
}: RingScoreProps) {
  const safeScore = Math.min(Math.max(score, 0), 100);
  const radius = size * 0.36;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={cn("relative mx-auto w-fit", accentClasses[accent], className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <title>{`${label}: ${safeScore}`}</title>
        <circle
          cx={center}
          cy={center}
          r={radius}
          className="fill-none stroke-border"
          strokeWidth={14}
        />
        <circle
          cx={center}
          cy={center}
          r={radius + 8}
          className="fill-none stroke-current opacity-15"
          strokeWidth={1}
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          className="fill-none stroke-current drop-shadow-[0_0_18px_currentColor]"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - safeScore / 100) }}
          transition={{ duration: 1, ease: "easeOut" }}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="metric-number text-6xl font-bold leading-none text-current">
          {safeScore}
        </span>
        <span className="mt-2 text-[0.68rem] uppercase tracking-[0.22em] text-text-secondary">
          {label}
        </span>
      </div>
    </div>
  );
}
