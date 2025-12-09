"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { MetricsNav } from "@/components/metrics/MetricsNav";

export default function MetricsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header style={{ marginBottom: "1.25rem" }}>
        <h1>Metrics</h1>
        <p className="text-muted" style={{ marginBottom: "0.75rem" }}>
          Analyse trends across domains, compare people/behaviours, and explore connected data.
        </p>
        <MetricsNav />
      </header>
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: "easeInOut" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
