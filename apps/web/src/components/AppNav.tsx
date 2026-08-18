"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const links = [
  { href: "/", label: "Übersicht" },
  { href: "/certificates", label: "Zertifikate" },
  { href: "/nodes", label: "Nodes" },
  { href: "/jobs", label: "Jobs" },
  { href: "/notifications", label: "Protokoll" },
  { href: "/users", label: "Benutzer", admin: true },
  { href: "/settings", label: "Einstellungen", admin: true },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = usePathname();
  const { data } = useSession();
  const role = data?.user?.role;
  // Admin-Links nur für viewer ausblenden (während Laden: anzeigen, damit nichts „fehlt“)
  const visibleLinks = links.filter((l) => !l.admin || role !== "viewer");

  return (
    <header className="sticky top-0 z-40 border-b-2 border-slate-300 bg-white text-slate-900 shadow-sm">
      <div className="mx-auto max-w-6xl px-4">
        {/* Zeile 1: Marke + Benutzer */}
        <div className="flex items-center justify-between gap-4 py-3">
          <Link
            href="/"
            className="shrink-0 text-base font-bold tracking-tight text-slate-900 sm:text-lg"
          >
            CertBot WebUI
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-sm font-semibold text-slate-800 sm:inline">
              {data?.user?.email}
            </span>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="shrink-0 rounded-md border-2 border-slate-700 bg-white px-3 py-1.5 text-sm font-bold text-slate-900 hover:bg-slate-100"
            >
              Abmelden
            </button>
          </div>
        </div>

        {/* Zeile 2: Navigation — volle Breite, nichts wird abgeschnitten */}
        <nav
          className="-mx-4 flex gap-1 overflow-x-auto border-t border-slate-200 px-4 py-2"
          aria-label="Hauptnavigation"
        >
          {visibleLinks.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-md px-3 py-2 text-sm font-bold whitespace-nowrap ${
                  active
                    ? "bg-slate-900 !text-white"
                    : "text-slate-800 hover:bg-slate-200"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
