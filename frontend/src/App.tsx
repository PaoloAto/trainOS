import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell, type ApiStatus } from "@/components/app/AppShell";
import { api, type User } from "@/lib/api";
import { ClimbPage } from "@/pages/ClimbPage";
import { GymPage } from "@/pages/GymPage";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { ReviewPage } from "@/pages/ReviewPage";
import { RunPage } from "@/pages/RunPage";

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
    </AppShell>
  );
}