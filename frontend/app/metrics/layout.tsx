import type { ReactNode } from "react";
import { MetricsNav } from "@/components/metrics/MetricsNav";

export default function MetricsLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header style={{ marginBottom: "1.25rem" }}>
        <h1>Metrics</h1>
        <p className="text-muted" style={{ marginBottom: "0.75rem" }}>
          Analyse trends across domains, compare people/behaviours, and explore connected data.
        </p>
        <MetricsNav />
      </header>
      <div>{children}</div>
    </div>
  );
}
