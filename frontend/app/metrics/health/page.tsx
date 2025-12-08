"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { type DomainMetric, getDomainConfig } from "@/lib/metricDomains";
import { describeBucket, fetchMetricWithAnnotations, type MetricAnnotation, type MetricPoint, movingAverage } from "@/lib/metrics";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });

export default function HealthMetricsPage() {
  const [bucket, setBucket] = useState("week");
  const [smooth, setSmooth] = useState(false);
  const domain = getDomainConfig("health");

  return (
    <div>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <label className="label" htmlFor="bucket">Bucket</label>
          <select className="input" id="bucket" value={bucket} onChange={(e) => setBucket(e.target.value)}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="month_2">2 months</option>
            <option value="month_3">3 months</option>
            <option value="all">All time</option>
          </select>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} />
          <span className="text-small">Apply moving average</span>
        </label>
      </div>
      {domain.description && (
        <p className="text-small text-muted" style={{ marginBottom: "0.75rem" }}>
          {domain.description}
        </p>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
        {domain.metrics.map((metric) => (
          <MetricChartCard key={metric.key} metric={metric} bucket={bucket} smooth={smooth} />
        ))}
      </section>
    </div>
  );
}

function MetricChartCard({ metric, bucket, smooth }: { metric: DomainMetric; bucket: string; smooth: boolean }) {
  const [points, setPoints] = useState<MetricPoint[]>([]);
  const [annotations, setAnnotations] = useState<MetricAnnotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchMetricWithAnnotations({ key: metric.key, bucket, agg: metric.agg });
        const processed = smooth ? movingAverage(result.points) : result.points;
        if (!cancelled) {
          setPoints(processed);
          setAnnotations(result.annotations ?? []);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [metric.key, metric.agg, bucket, smooth]);

  const alert = useMemo(() => computeAlert(points), [points]);
  const annotationSummary = useMemo(() => summarizeAnnotations(annotations), [annotations]);

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.85rem", background: "var(--card)", minHeight: "230px" }}>
      <div style={{ marginBottom: "0.35rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <strong>{metric.label}</strong>
          <span className="text-small text-muted">{metric.agg} per {describeBucket(bucket)}</span>
        </div>
        {metric.description && <p className="text-small text-muted" style={{ marginTop: "0.2rem" }}>{metric.description}</p>}
        {alert && <p className="text-small" style={{ marginTop: "0.2rem", color: "#d97706" }}>{alert}</p>}
      </div>
      <div style={{ height: "170px" }}>
        {loading ? (
          <div className="text-small text-muted" style={{ display: "flex", alignItems: "center", height: "100%" }}>Loading…</div>
        ) : error ? (
          <div className="text-small" style={{ color: "var(--destructive)" }}>{error}</div>
        ) : points.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="var(--primary)" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-small text-muted" style={{ display: "flex", alignItems: "center", height: "100%" }}>No data yet.</div>
        )}
      </div>
      {annotationSummary && (
        <div className="text-small text-muted" style={{ marginTop: "0.35rem" }}>
          {annotationSummary}
        </div>
      )}
    </div>
  );
}

function computeAlert(points: MetricPoint[]) {
  if (!points || points.length < 4) return null;
  const values = points.map((p) => p.value);
  const last = values[values.length - 1];
  const prev = values.slice(Math.max(0, values.length - 4), values.length - 1);
  if (!prev.length) return null;
  const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
  if (!Number.isFinite(prevAvg) || prevAvg === 0) return null;
  const delta = (last - prevAvg) / Math.abs(prevAvg);
  if (delta > 0.35) return `Rising (+${Math.round(delta * 100)}% vs prior buckets)`;
  if (delta < -0.35) return `Dropping (${Math.round(delta * 100)}% vs prior buckets)`;
  return null;
}

function summarizeAnnotations(annotations: MetricAnnotation[]) {
  if (!annotations || !annotations.length) return "";
  const recent = annotations.slice(-3);
  return recent
    .map((a) => `${a.label || a.bucket}: ${a.source_type} ×${a.count}`)
    .join(" • ");
}
