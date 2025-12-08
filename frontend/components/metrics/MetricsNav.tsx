"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { listMetricDomains } from "@/lib/metricDomains";

export function MetricsNav() {
  const pathname = usePathname();
  const domainTabs = listMetricDomains().map((d) => ({ href: `/metrics/${d.key}`, label: d.title }));
  const tabs = [
    { href: "/metrics/quick", label: "Quick" },
    ...domainTabs,
    { href: "/metrics/relationships", label: "Relationships" }
  ];

  return (
    <nav style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`btn ${isActive ? "btn-primary" : "btn-ghost"} btn-sm`}
            style={{ borderRadius: "999px" }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
