export type DomainMetric = {
  key: string;
  label: string;
  description?: string;
  agg: string;
};

export const healthDomainMetrics: DomainMetric[] = [
  { key: "water_liters", label: "Hydration", description: "Liters logged per period", agg: "sum" },
  { key: "sleep_hours", label: "Sleep", description: "Hours of sleep", agg: "avg" },
  { key: "mood_score", label: "Mood score", description: "Average mood from captures", agg: "avg" },
  { key: "energy_level", label: "Energy level", description: "Average energy per bucket", agg: "avg" },
];

export type MetricDomainConfig = {
  key: string;
  title: string;
  description?: string;
  metrics: DomainMetric[];
  annotationsFrom?: string[];
};

const domainRegistry: MetricDomainConfig[] = [
  {
    key: "health",
    title: "Health",
    description: "Hydration, sleep, mood, and energy trends.",
    metrics: healthDomainMetrics,
    annotationsFrom: ["reflection", "goal"]
  },
  {
    key: "productivity",
    title: "Productivity",
    description: "Lightweight productivity signals (custom metrics).",
    metrics: [
      { key: "focus_minutes", label: "Focused minutes", description: "Logged focus or deep work time", agg: "sum" },
      { key: "tasks_completed", label: "Tasks completed", description: "Completed items per bucket", agg: "sum" },
      { key: "code_minutes", label: "Coding minutes", description: "Time spent coding", agg: "sum" },
      { key: "context_switches", label: "Context switches", description: "Number of switches noted", agg: "sum" }
    ],
    annotationsFrom: ["reflection", "goal"]
  }
];

export function getDomainConfig(key: string): MetricDomainConfig {
  return domainRegistry.find((d) => d.key === key) ?? domainRegistry[0];
}

export function listMetricDomains() {
  return domainRegistry;
}
