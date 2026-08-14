import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Card } from "@/components/common/Card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type User } from "@/lib/api";

type LoginPageProps = {
  onLogin: (user: User) => void;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await api.login({ username, password });
      onLogin(response.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to log in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-4xl items-center gap-8 py-8 lg:grid-cols-[1fr_minmax(22rem,0.8fr)]">
      <div className="hidden border-l-2 border-green pl-6 lg:block">
        <p className="telemetry-label">TrainOS</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-text-primary">Your training,<br />one system.</h1>
        <p className="mt-4 max-w-sm text-base leading-7 text-text-secondary">Running, strength, climbing, and recovery in one private workspace.</p>
      </div>
      <Card>
        <div className="mb-8">
          <p className="telemetry-label">TrainOS</p>
          <h1 className="mt-2 text-3xl font-bold text-text-primary">Welcome back</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Sign in to continue your training.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error ? (
            <div className="rounded-2xl border border-red bg-red-muted p-3 text-sm text-red">
              {error}
            </div>
          ) : null}
          <Button className="w-full" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>

      <Button asChild variant="ghost" className="mt-4">
        <Link to="/">Back to TrainOS</Link>
      </Button>
    </div>
  );
}
