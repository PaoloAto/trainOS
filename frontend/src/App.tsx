import { Activity } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell, type ApiStatus } from "@/components/app/AppShell";
import { api, type User } from "@/lib/api";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

const HomePage = lazy(() => import("@/pages/HomePage").then((module) => ({ default: module.HomePage })));
const RunPage = lazy(() => import("@/pages/RunPage").then((module) => ({ default: module.RunPage })));
const GymPage = lazy(() => import("@/pages/GymPage").then((module) => ({ default: module.GymPage })));
const ClimbPage = lazy(() => import("@/pages/ClimbPage").then((module) => ({ default: module.ClimbPage })));
const ReviewPage = lazy(() => import("@/pages/ReviewPage").then((module) => ({ default: module.ReviewPage })));
const LoginPage = lazy(() => import("@/pages/LoginPage").then((module) => ({ default: module.LoginPage })));

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-card border border-border bg-bg-card p-6 text-center">
      <p role="status" aria-live="polite" className="text-sm font-medium text-text-secondary">
        Loading your training view…
      </p>
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        await api.health();
        if (active) setApiStatus("online");
      } catch {
        if (active) setApiStatus("offline");
      }

      try {
        const response = await api.me();
        if (active) setUser(response.user);
      } catch {
        if (active) setUser(null);
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }

  return (
    <AppShell user={user} apiStatus={apiStatus} onLogout={handleLogout}>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<HomePage user={user} />} />
          <Route path="/run" element={<RunPage />} />
          <Route path="/gym" element={<GymPage />} />
          <Route path="/climb" element={<ClimbPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/login" element={<LoginPage onLogin={setUser} />} />
          <Route
            path="*"
            element={
              <PlaceholderPage
                eyebrow="Not Found"
                title="Route Missing"
                description="This route is outside the TrainOS shell."
                icon={Activity}
                accent="red"
              />
            }
          />
          <Route path="/home" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
