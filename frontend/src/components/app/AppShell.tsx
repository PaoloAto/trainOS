import { AlertTriangle, LogOut } from "lucide-react";
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
          <div className="mb-6 flex items-center justify-end gap-3 md:mb-8">
            {apiStatus === "offline" ? (
              <div role="status" className="mr-auto flex items-center gap-2 rounded-xl border border-red/60 bg-red-muted px-3 py-2 text-sm text-red">
                <AlertTriangle className="h-4 w-4" />
                <span>TrainOS is offline. Check your connection and try again.</span>
              </div>
            ) : null}
            {user ? (
              <Button variant="ghost" size="sm" onClick={onLogout}>
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            ) : (
              <Button asChild variant="secondary" size="sm">
                <Link to="/login">Sign in</Link>
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
