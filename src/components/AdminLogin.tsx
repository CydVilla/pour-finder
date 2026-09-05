"use client";

import { useState } from "react";

export function AdminLogin() {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        setError("That token isn't right.");
        return;
      }
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="wordmark text-2xl">Moderation</h1>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label htmlFor="admin-token" className="block text-xs font-bold uppercase tracking-wide text-ink-faint">
          Admin token
        </label>
        <input
          id="admin-token"
          type="password"
          className="pf-input"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-outdated">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="pf-button pf-button-primary w-full px-4 py-3">
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
