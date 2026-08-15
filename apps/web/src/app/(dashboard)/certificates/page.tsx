import { Suspense } from "react";
import CertificatesPage from "./page-client";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm ui-muted">Laden…</p>}>
      <CertificatesPage />
    </Suspense>
  );
}
