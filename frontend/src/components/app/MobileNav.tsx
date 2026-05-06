import { Dumbbell, Home, LineChart, Mountain, Timer } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/run", label: "Run", icon: Timer },
  { to: "/gym", label: "Gym", icon: Dumbbell },
  { to: "/climb", label: "Climb", icon: Mountain },
  { to: "/review", label: "Review", icon: LineChart },
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
                "group flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.12em] transition active:scale-[0.98]",
                isActive
                  ? "bg-green-muted text-green"
                  : "text-text-muted hover:bg-bg-elevated hover:text-text-primary",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn("h-0.5 w-6 rounded-full transition", isActive ? "bg-green" : "bg-transparent")} />
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
    <aside className="sticky top-8 hidden h-[calc(100vh-4rem)] rounded-card border border-border bg-bg-card/80 p-4 shadow-card backdrop-blur-xl lg:block">
      <div className="mb-7 rounded-2xl border border-green bg-green-muted p-4 text-green shadow-glow">
        <p className="text-[0.65rem] uppercase tracking-[0.22em] text-green">TrainOS</p>
        <p className="mt-2 text-sm font-semibold text-text-primary">Personal command center</p>
      </div>
      <nav className="space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition hover:bg-bg-elevated hover:text-text-primary",
                isActive ? "border border-green bg-green-muted text-green" : "border border-transparent text-text-secondary",
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