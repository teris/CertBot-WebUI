"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("admin@localhost");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Anmeldung fehlgeschlagen");
      return;
    }
    router.push(params.get("callbackUrl") || "/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-cyan-50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-slate-900">CertBot WebUI</h1>
        <p className="mt-1 text-sm ui-muted">Zentrale SSL-Verwaltung</p>
        <label className="mt-6 block text-sm font-medium text-slate-700">
          E-Mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Passwort
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </label>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Anmelden…" : "Anmelden"}
        </button>
      </form>
    </div>
  );
}
