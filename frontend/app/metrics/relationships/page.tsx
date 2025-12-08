"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { fetchMetricsSeries, movingAverage, describeBucket, type MetricPoint } from "@/lib/metrics";
import { formatFriendlyDate } from "@/lib/date";
import { SimpleGraph } from "@/components/graph/SimpleGraph";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });

type EventRow = {
  id: number;
  occurred_at?: string;
  raw_text?: string;
  summary?: string;
};

export default function RelationshipsMetricsPage() {
  const [people, setPeople] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [compare, setCompare] = useState("");
  const [bucket, setBucket] = useState("week");
  const [smooth, setSmooth] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [metricKeys, setMetricKeys] = useState<string[]>([]);
  const [metricOverlay, setMetricOverlay] = useState("");
  const [metricAgg, setMetricAgg] = useState("sum");

  useEffect(() => {
    fetch("/api/metrics/people")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data.people) ? data.people : [];
        setPeople(list);
        if (list.length && !selected) setSelected(list[0]);
      })
      .catch(() => {});
    fetch("/api/metrics/keys")
      .then((res) => res.json())
      .then((data) => setMetricKeys(Array.isArray(data.keys) ? data.keys : []))
      .catch(() => {});
  }, [selected]);

  useEffect(() => {
    if (!search.trim()) return;
    let cancelled = false;
    async function runSearch() {
      setSearching(true);
      try {
        const res = await fetch(`/api/entities/search?q=${encodeURIComponent(search.trim())}&smart=1`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        const list = Array.isArray(data.people) ? data.people : [];
        if (!cancelled) setPeople(list);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setSearching(false);
      }
    }
    runSearch();
    return () => {
      cancelled = true;
    };
  }, [search]);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
        <div>
          <label className="label">Person</label>
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {people.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
            {!people.length && <option value="">No people detected yet</option>}
          </select>
          <input
            className="input"
            style={{ marginTop: "0.35rem" }}
            placeholder="Search people"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {searching && <div className="text-small text-muted" style={{ marginTop: "0.2rem" }}>Searching…</div>}
        </div>
        <div>
          <label className="label">Compare</label>
          <select className="input" value={compare} onChange={(e) => setCompare(e.target.value)}>
            <option value="">None</option>
            {people.filter((p) => p !== selected).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Bucket</label>
          <select className="input" value={bucket} onChange={(e) => setBucket(e.target.value)}>
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

      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.85rem", background: "var(--card)", marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", gap: "0.5rem" }}>
          <div>
            <strong>Mentions over time</strong>
            <div className="text-small text-muted">{describeBucket(bucket)} buckets · counts where person appears in metadata.people</div>
          </div>
          {selected && (
            <Link className="btn btn-ghost btn-sm" href={`/people/${encodeURIComponent(selected)}`}>
              View person
            </Link>
          )}
        </div>
        <RelationshipChart
          person={selected}
          compare={compare}
          bucket={bucket}
          smooth={smooth}
          metricOverlay={metricOverlay}
          metricAgg={metricAgg}
        />
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <label className="text-small text-muted">Overlay metric</label>
          <select className="input" value={metricOverlay} onChange={(e) => setMetricOverlay(e.target.value)} style={{ maxWidth: "200px" }}>
            <option value="">None</option>
            {metricKeys.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          {metricOverlay && (
            <select className="input" value={metricAgg} onChange={(e) => setMetricAgg(e.target.value)} style={{ maxWidth: "160px" }}>
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="count">Count</option>
            </select>
          )}
        </div>
      </div>

      <PersonEvents person={selected} />

      <div style={{ marginTop: "1rem" }}>
        <SimpleGraph entityType="person" entityId={selected} title="Graph (relationships)" />
      </div>
    </div>
  );
}

function RelationshipChart({
  person,
  compare,
  bucket,
  smooth,
  metricOverlay,
  metricAgg
}: {
  person: string;
  compare: string;
  bucket: string;
  smooth: boolean;
  metricOverlay: string;
  metricAgg: string;
}) {
  const [points, setPoints] = useState<MetricPoint[]>([]);
  const [comparePoints, setComparePoints] = useState<MetricPoint[]>([]);
  const [metricPoints, setMetricPoints] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const main = await fetchMetricsSeries({ mode: "person", person, bucket, agg: "count" });
        const processedMain = smooth ? movingAverage(main) : main;
        const result: MetricPoint[] = processedMain;
        let compareSeries: MetricPoint[] = [];
        let metricSeries: MetricPoint[] = [];
        if (compare) {
          const comp = await fetchMetricsSeries({ mode: "person", person: compare, bucket, agg: "count" });
          compareSeries = smooth ? movingAverage(comp) : comp;
        }
        if (metricOverlay) {
          const metric = await fetchMetricsSeries({ mode: "metric", key: metricOverlay, bucket, agg: metricAgg });
          metricSeries = smooth ? movingAverage(metric) : metric;
        }
        if (!cancelled) {
          setPoints(result);
          setComparePoints(compareSeries);
          setMetricPoints(metricSeries);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person, compare, bucket, smooth]);

  if (!person) {
    return <div className="text-small text-muted">Pick a person to view mentions.</div>;
  }

  return (
    <div style={{ height: "260px" }}>
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
            <Line type="monotone" dataKey="value" stroke="var(--primary)" dot />
            {compare && comparePoints.length > 0 && (
              <Line type="monotone" dataKey="value" stroke="var(--secondary-foreground)" dot name={compare} data={comparePoints} />
            )}
            {metricOverlay && metricPoints.length > 0 && (
              <Line type="monotone" dataKey="value" stroke="#5C7AEA" dot name={metricOverlay} data={metricPoints} />
            )}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="text-small text-muted" style={{ display: "flex", alignItems: "center", height: "100%" }}>No data yet.</div>
      )}
    </div>
  );
}

function PersonEvents({ person }: { person: string }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/events?person=${encodeURIComponent(person)}&limit=10`);
        if (!res.ok) throw new Error("Failed to load events");
        const data = await res.json();
        if (!cancelled) setEvents(Array.isArray(data.events) ? data.events : []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load events");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person]);

  if (!person) return null;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.85rem", background: "var(--card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
        <strong>Recent captures mentioning {person}</strong>
        <Link className="btn btn-ghost btn-sm" href={`/people/${encodeURIComponent(person)}`}>
          Open person view
        </Link>
      </div>
      {loading ? (
        <div className="text-small text-muted">Loading…</div>
      ) : error ? (
        <div className="text-small" style={{ color: "var(--destructive)" }}>{error}</div>
      ) : events.length ? (
        <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.35rem" }}>
          {events.map((ev) => (
            <li key={ev.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.6rem" }}>
              <div className="text-small text-muted">{ev.occurred_at ? formatFriendlyDate(ev.occurred_at) : ""}</div>
              <div style={{ marginTop: "0.2rem" }}>{ev.summary || ev.raw_text || "No text available"}</div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-small text-muted">No captures yet.</div>
      )}
    </div>
  );
}
