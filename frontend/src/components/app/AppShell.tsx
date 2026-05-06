import { LogOut, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { DesktopNav, MobileNav } from "@/components/app/MobileNav";
import { Button } from "@/components/ui/button";
import type { User } from "@/lib/api";

export type ApiStatus = "checking" | "online" | "offline";

type AppShellProps = {
  children: ReactNode;
  user: User | null;
  apiStatus: ApiStatus;
  onLogout: () => Promise<void>;
};

export function AppShell({ children, user, apiStatus, onLogout }: AppShellProps) {
  const location = useLocation();
  const isLogin = location.pathname === "/login";

  if (isLogin) {
    return <main className="min-h-screen bg-atmosphere px-5 py-6 md:px-8 lg:px-10">{children}</main>;
  }

  return (
    <div className="min-h-screen bg-atmosphere text-text-primary">
      <div className="mx-auto grid min-h-screen w-full max-w-md grid-cols-1 px-5 pb-28 pt-6 md:max-w-2xl md:px-8 md:py-8 lg:max-w-6xl lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8 lg:pb-10">
        <DesktopNav />
        <main className="min-w-0 lg:rounded-[2rem] lg:border lg:border-border lg:bg-bg-base/40 lg:p-6 lg:shadow-card lg:backdrop-blur-sm">
          <div className="mb-6 flex items-center justify-between gap-3 md:mb-8">
            <div className="flex items-center gap-2 rounded-full border border-border bg-bg-card px-3 py-2 text-xs text-text-secondary shadow-card">
              <ShieldCheck className="h-4 w-4 text-green" />
              <span>{apiStatus === "online" ? "API online" : apiStatus === "offline" ? "API offline" : "Checking API"}</span>
            </div>
            {user ? (
              <Button variant="ghost" size="sm" onClick={onLogout}>
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            ) : (
              <Button asChild variant="secondary" size="sm">
                <Link to="/login">Login</Link>
              </Button>
            )}
          </div>
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}