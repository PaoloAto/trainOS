import { Dumbbell, Home, LineChart, Mountain, Timer } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Home", icon: Home, active: "bg-green-muted text-green", rail: "bg-green" },
  { to: "/run", label: "Run", icon: Timer, active: "bg-green-muted text-green", rail: "bg-green" },
  { to: "/gym", label: "Gym", icon: Dumbbell, active: "bg-amber-muted text-amber", rail: "bg-amber" },
  { to: "/climb", label: "Climb", icon: Mountain, active: "bg-indigo-muted text-indigo", rail: "bg-indigo" },
  { to: "/review", label: "Review", icon: LineChart, active: "bg-green-muted text-green", rail: "bg-green" },
];

export function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg-base/95 px-3 pb-5 pt-2 backdrop-blur-xl md:left-1/2 md:max-w-2xl md:-translate-x-1/2 md:rounded-t-3xl md:border-x lg:hidden">
      <div className="grid grid-cols-5 gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "group flex min-h-14 flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-medium transition active:scale-[0.98]",
                isActive
                  ? item.active
                  : "text-text-muted hover:bg-bg-elevated hover:text-text-primary",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn("h-0.5 w-6 rounded-full transition", isActive ? item.rail : "bg-transparent")} />
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function DesktopNav() {
  return (
    <aside className="sticky top-8 hidden h-[calc(100vh-4rem)] rounded-card border border-border bg-bg-card/80 p-5 shadow-card backdrop-blur-xl lg:block">
      <div className="mb-8 border-b border-border pb-5">
        <p className="font-mono text-xl font-bold leading-[0.8] tracking-[-0.12em] text-text-primary">TRAIN<br />OS</p>
        <p className="mt-5 telemetry-label">Today</p>
        <p className="mt-1 text-sm font-medium text-text-secondary">Train with intent.</p>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition hover:bg-bg-elevated hover:text-text-primary",
                isActive ? item.active : "text-text-secondary",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
