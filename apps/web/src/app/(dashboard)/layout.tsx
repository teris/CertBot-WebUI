import { AppNav } from "@/components/AppNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f1f5f9] text-slate-900">
      <AppNav />
      <main className="mx-auto max-w-6xl px-4 py-8 text-slate-900">{children}</main>
    </div>
  );
}
