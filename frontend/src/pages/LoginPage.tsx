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
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center">
      <Card className="shadow-glow">
        <div className="mb-8">
          <p className="text-[0.68rem] uppercase tracking-[0.22em] text-text-muted">TrainOS Session</p>
          <h1 className="mt-2 text-3xl font-bold text-text-primary">Log in</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Uses Django session authentication with CSRF. Signup is intentionally not part of Phase 1.
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
            {submitting ? "Logging in..." : "Login"}
          </Button>
        </form>
      </Card>

      <Button asChild variant="ghost" className="mt-4">
        <Link to="/">Back to shell</Link>
      </Button>
    </div>
  );
}
