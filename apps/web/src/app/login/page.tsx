import { Suspense } from "react";
import LoginPage from "./page-client";

export default function Page() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Laden…</div>}>
      <LoginPage />
    </Suspense>
  );
}
