"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
};

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/users");
    if (res.status === 403) {
      router.push("/");
      return;
    }
    const data = await res.json();
    setUsers(data.users || []);
  }

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin") {
      router.push("/");
      return;
    }
    if (status === "authenticated") load();
  }, [status, session, router]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Fehler");
      return;
    }
    setEmail("");
    setName("");
    setPassword("");
    await load();
  }

  async function toggleActive(u: User) {
    await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    await load();
  }

  return (
    <div>
      <h1 className="ui-page-title">Benutzer</h1>
      <form onSubmit={onCreate} className="ui-card mt-6 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          E-Mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full px-3 py-2"
            required
          />
        </label>
        <label className="text-sm">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Passwort
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full px-3 py-2"
            minLength={8}
            required
          />
        </label>
        <label className="text-sm">
          Rolle
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "viewer")}
            className="mt-1 w-full px-3 py-2"
          >
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <button type="submit" className="ui-btn sm:col-span-2">
          Benutzer anlegen
        </button>
        {error && <p className="text-sm font-medium text-rose-700 sm:col-span-2">{error}</p>}
      </form>

      <div className="mt-6 ui-table-wrap">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">E-Mail</th>
              <th className="px-3 py-2">Rolle</th>
              <th className="px-3 py-2">Aktiv</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  {u.email}
                  {u.name && <div className="text-xs ui-muted">{u.name}</div>}
                </td>
                <td className="px-3 py-2">{u.role}</td>
                <td className="px-3 py-2">{u.active ? "ja" : "nein"}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(u)}
                    className="text-sky-700 hover:underline"
                  >
                    {u.active ? "Deaktivieren" : "Aktivieren"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
