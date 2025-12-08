"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { BarChart2, UserSearch } from "lucide-react";
import { formatFriendlyDate } from "@/lib/date";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });

type Point = { bucket: string; value: number; label?: string; rawBucket?: string };
type Mode = "metric" | "person";
type Query = { mode: Mode; key: string; agg: string; bucket: string; person: string };

export default function AnalysePage() {
  const [mode, setMode] = useState<Mode>("metric");
  const [key, setKey] = useState("water_liters");
  const [agg, setAgg] = useState("sum");
  const [bucket, setBucket] = useState("day");
  const [person, setPerson] = useState("");
  const [points, setPoints] = useState<Point[]>([]);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareKey, setCompareKey] = useState("");
  const [comparePerson, setComparePerson] = useState("");
  const [comparePoints, setComparePoints] = useState<Point[]>([]);
  const [smooth, setSmooth] = useState(false);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [overlayMode, setOverlayMode] = useState<Mode>("person");
  const [overlayKey, setOverlayKey] = useState("");
  const [overlayPerson, setOverlayPerson] = useState("");
  const [overlayAgg, setOverlayAgg] = useState("sum");
  const [overlayPoints, setOverlayPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [metricKeys, setMetricKeys] = useState<string[]>([]);
  const [peopleOptions, setPeopleOptions] = useState<string[]>([]);
  const [recentQueries, setRecentQueries] = useState<Query[]>([]);
  const [previews, setPreviews] = useState<Record<string, number[]>>({});
  const previewFetched = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadLastQuery();
    loadRecentQueries();
    fetch("/api/metrics/keys")
      .then((res) => res.json())
      .then((data) => setMetricKeys(Array.isArray(data.keys) ? data.keys : []))
      .catch(() => {});
    fetch("/api/metrics/people")
      .then((res) => res.json())
      .then((data) => setPeopleOptions(Array.isArray(data.people) ? data.people : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // lightweight previews for first few metrics
    const subset = metricKeys.slice(0, 5);
    subset.forEach((k) => {
      if (previewFetched.current.has(k)) return;
      previewFetched.current.add(k);
      fetch(`/api/metrics?type=metric&key=${encodeURIComponent(k)}&bucket=week&agg=sum`)
        .then((res) => res.json())
        .then((data) => {
          const vals = Array.isArray(data.points) ? data.points.map((p: any) => Number(p.value) || 0) : [];
          setPreviews((prev) => ({ ...prev, [k]: vals }));
        })
        .catch(() => {});
    });
  }, [metricKeys]);

  const closestMetric = useMemo(() => findClosest(key, metricKeys), [key, metricKeys]);
  const closestPerson = useMemo(() => findClosest(person, peopleOptions), [person, peopleOptions]);
  const gapNotice = useMemo(() => describeGaps(points, bucket), [points, bucket]);
  const compareLabel = mode === "metric" ? (compareKey || "Comparison") : (comparePerson || "Comparison");

  function loadLastQuery() {
    const stored = localStorage.getItem("analysis:lastQuery");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.mode) setMode(parsed.mode);
        if (parsed.key) setKey(parsed.key);
        if (parsed.agg) setAgg(parsed.agg);
        if (parsed.bucket) setBucket(parsed.bucket);
        if (parsed.person) setPerson(parsed.person);
      } catch {
        // ignore corrupted local storage
      }
    }
  }

  function loadRecentQueries() {
    const stored = localStorage.getItem("analysis:recentQueries");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setRecentQueries(parsed);
      } catch {
        // ignore
      }
    }
  }

  function saveRecent(query: Query) {
    const next = [query, ...recentQueries.filter((q) => !isSameQuery(q, query))].slice(0, 5);
    setRecentQueries(next);
    localStorage.setItem("analysis:recentQueries", JSON.stringify(next));
  }

  function setFromRecent(q: Query) {
    setMode(q.mode);
    setKey(q.key);
    setAgg(q.agg);
    setBucket(q.bucket);
    setPerson(q.person);
  }

  function isSameQuery(a: Query, b: Query) {
    return a.mode === b.mode && a.key === b.key && a.agg === b.agg && a.bucket === b.bucket && a.person === b.person;
  }

  async function fetchSeries(args: { mode: Mode; key: string; person: string; bucket: string; agg: string }) {
    const params = new URLSearchParams();
    params.set("type", args.mode);
    params.set("bucket", args.bucket);
    if (args.mode === "metric") {
      params.set("key", args.key);
      params.set("agg", args.agg);
    } else {
      params.set("person", args.person);
      params.set("agg", "count");
    }
    const res = await fetch(`/api/metrics?${params.toString()}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.message ?? "Query failed");
    }
    const data = await res.json();
    return (data.points ?? []).map((p: Point) => ({
      ...p,
      rawBucket: p.bucket,
      label: formatBucketLabel(p.bucket)
    }));
  }

  async function runQuery() {
    setLoading(true);
    setError(null);
    try {
      const main = await fetchSeries({ mode, key, person, bucket, agg });
      setPoints(smooth ? movingAverage(main) : main);
      if (compareEnabled) {
        if (mode === "metric" && compareKey) {
          const comp = await fetchSeries({ mode, key: compareKey, person: "", bucket, agg });
          setComparePoints(smooth ? movingAverage(comp) : comp);
        } else if (mode === "person" && comparePerson) {
          const comp = await fetchSeries({ mode, key: "", person: comparePerson, bucket, agg: "count" });
          setComparePoints(smooth ? movingAverage(comp) : comp);
        } else {
          setComparePoints([]);
        }
      } else {
        setComparePoints([]);
      }
      if (overlayEnabled) {
        if (overlayMode === "metric" && overlayKey) {
          const overlay = await fetchSeries({ mode: "metric", key: overlayKey, person: "", bucket, agg: overlayAgg });
          setOverlayPoints(smooth ? movingAverage(overlay) : overlay);
        } else if (overlayMode === "person" && overlayPerson) {
          const overlay = await fetchSeries({ mode: "person", key: "", person: overlayPerson, bucket, agg: "count" });
          setOverlayPoints(smooth ? movingAverage(overlay) : overlay);
        } else {
          setOverlayPoints([]);
        }
      } else {
        setOverlayPoints([]);
      }
      setLastQuery(
        mode === "metric"
          ? `${key} (${agg}) by ${describeBucket(bucket)}`
          : `${person || "person"} mentions by ${describeBucket(bucket)}`
      );
      localStorage.setItem(
        "analysis:lastQuery",
        JSON.stringify({ mode, key, agg, bucket, person })
      );
      saveRecent({ mode, key, agg, bucket, person });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
        <div>
          <label className="label">Mode</label>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="metric">Metric</option>
            <option value="person">Person mentions</option>
          </select>
        </div>
        {mode === "metric" ? (
          <>
            <div>
              <label className="label">Metric key</label>
              <select
                className="input"
                value={metricKeys.includes(key) ? key : "__custom"}
                onChange={(e) => {
                  if (e.target.value === "__custom") return;
                  setKey(e.target.value);
                }}
              >
                {metricKeys.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
                <option value="__custom">Custom…</option>
              </select>
              {!metricKeys.includes(key) && (
                <input
                  className="input"
                  style={{ marginTop: "0.35rem" }}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Type a custom metric key"
                />
              )}
              {closestMetric && !metricKeys.includes(key) && (
                <div className="text-small text-muted" style={{ marginTop: "0.25rem", display: "flex", gap: "0.35rem", alignItems: "center" }}>
                  Closest existing: <button type="button" className="btn btn-ghost btn-sm" onClick={() => setKey(closestMetric)}>Use {closestMetric}</button>
                </div>
              )}
            </div>
            <div>
              <label className="label">Aggregation</label>
              <select className="input" value={agg} onChange={(e) => setAgg(e.target.value)}>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="count">Count</option>
              </select>
            </div>
          </>
        ) : (
          <div>
            <label className="label">Person</label>
            <select
              className="input"
              value={peopleOptions.includes(person) ? person : "__custom_person"}
              onChange={(e) => {
                if (e.target.value === "__custom_person") return;
                setPerson(e.target.value);
              }}
            >
              {peopleOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value="__custom_person">Custom…</option>
            </select>
            {!peopleOptions.includes(person) && (
              <input
                className="input"
                style={{ marginTop: "0.35rem" }}
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                placeholder="Type a person name"
              />
            )}
            {closestPerson && person && !peopleOptions.includes(person) && (
              <div className="text-small text-muted" style={{ marginTop: "0.25rem", display: "flex", gap: "0.35rem", alignItems: "center" }}>
                Closest person: <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPerson(closestPerson)}>Use {closestPerson}</button>
              </div>
            )}
          </div>
        )}
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
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginBottom: "1rem", alignItems: "center" }}>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input id="smooth" type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} />
          <span className="text-small">Apply moving average</span>
        </label>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input id="compare" type="checkbox" checked={compareEnabled} onChange={(e) => setCompareEnabled(e.target.checked)} />
          <span className="text-small">Add comparison</span>
        </label>
        {compareEnabled && mode === "metric" && (
          <div>
            <label className="label">Compare metric</label>
            <select
              className="input"
              value={metricKeys.includes(compareKey) ? compareKey : "__custom_compare"}
              onChange={(e) => {
                if (e.target.value === "__custom_compare") return;
                setCompareKey(e.target.value);
              }}
            >
              {metricKeys.filter((k) => k !== key).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
              <option value="__custom_compare">Custom…</option>
            </select>
            {!metricKeys.includes(compareKey) && (
              <input
                className="input"
                style={{ marginTop: "0.35rem" }}
                value={compareKey}
                onChange={(e) => setCompareKey(e.target.value)}
                placeholder="Type a comparison metric"
              />
            )}
          </div>
        )}
        {compareEnabled && mode === "person" && (
          <div>
            <label className="label">Compare person</label>
            <select
              className="input"
              value={peopleOptions.includes(comparePerson) ? comparePerson : "__custom_compare_person"}
              onChange={(e) => {
                if (e.target.value === "__custom_compare_person") return;
                setComparePerson(e.target.value);
              }}
            >
              {peopleOptions.filter((p) => p !== person).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value="__custom_compare_person">Custom…</option>
            </select>
            {!peopleOptions.includes(comparePerson) && (
              <input
                className="input"
                style={{ marginTop: "0.35rem" }}
                value={comparePerson}
                onChange={(e) => setComparePerson(e.target.value)}
                placeholder="Type a comparison person"
              />
            )}
          </div>
        )}
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input id="overlay" type="checkbox" checked={overlayEnabled} onChange={(e) => setOverlayEnabled(e.target.checked)} />
          <span className="text-small">Cross-domain overlay</span>
        </label>
        {overlayEnabled && (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <div>
              <label className="label">Overlay mode</label>
              <select className="input" value={overlayMode} onChange={(e) => setOverlayMode(e.target.value as Mode)}>
                <option value="metric">Metric</option>
                <option value="person">Person mentions</option>
              </select>
            </div>
            {overlayMode === "metric" ? (
              <div>
                <label className="label">Overlay metric</label>
                <select
                  className="input"
                  value={metricKeys.includes(overlayKey) ? overlayKey : "__custom_overlay"}
                  onChange={(e) => {
                    if (e.target.value === "__custom_overlay") return;
                    setOverlayKey(e.target.value);
                  }}
                >
                  {metricKeys.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                  <option value="__custom_overlay">Custom…</option>
                </select>
                {!metricKeys.includes(overlayKey) && (
                  <input
                    className="input"
                    style={{ marginTop: "0.35rem" }}
                    value={overlayKey}
                    onChange={(e) => setOverlayKey(e.target.value)}
                    placeholder="Type a metric key"
                  />
                )}
                <select className="input" style={{ marginTop: "0.35rem" }} value={overlayAgg} onChange={(e) => setOverlayAgg(e.target.value)}>
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="count">Count</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="label">Overlay person</label>
                <select
                  className="input"
                  value={peopleOptions.includes(overlayPerson) ? overlayPerson : "__custom_overlay_person"}
                  onChange={(e) => {
                    if (e.target.value === "__custom_overlay_person") return;
                    setOverlayPerson(e.target.value);
                  }}
                >
                  {peopleOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                  <option value="__custom_overlay_person">Custom…</option>
                </select>
                {!peopleOptions.includes(overlayPerson) && (
                  <input
                    className="input"
                    style={{ marginTop: "0.35rem" }}
                    value={overlayPerson}
                    onChange={(e) => setOverlayPerson(e.target.value)}
                    placeholder="Type a person name"
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={runQuery} disabled={loading}>
          <BarChart2 size={16} style={{ marginRight: "0.35rem" }} />
          {loading ? "Running..." : "Run query"}
        </button>
        {mode === "person" && (
          <div className="text-muted text-small" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <UserSearch size={14} /> Counts events where person appears in metadata.people
          </div>
        )}
        {metricKeys.length > 0 && (
          <div className="text-small text-muted" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <span>Known metrics:</span>
            {metricKeys.slice(0, 6).map((k) => (
              <button key={k} className="btn btn-ghost btn-sm" type="button" onClick={() => setKey(k)}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <Sparkline values={previews[k]} /> {k}
                </span>
              </button>
            ))}
            {metricKeys.length > 6 && <span>+{metricKeys.length - 6} more</span>}
          </div>
        )}
        {recentQueries.length > 0 && (
          <div className="text-small text-muted" style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
            <span>Recent:</span>
            {recentQueries.map((q, idx) => (
              <button
                key={`${q.mode}-${q.key}-${q.person}-${idx}`}
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => setFromRecent(q)}
              >
                {q.mode === "metric" ? `${q.key} (${q.agg})` : `${q.person} mentions`} · {describeBucket(q.bucket)}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <div className="text-small" style={{ color: "var(--destructive)" }}>{error}</div>}
      {lastQuery && !error && (
        <div className="text-small text-muted" style={{ marginBottom: "0.5rem" }}>
          Showing: {lastQuery} ({points.length} buckets)
        </div>
      )}
      {gapNotice && (
        <div className="text-small text-muted" style={{ marginBottom: "0.5rem" }}>
          {gapNotice}
        </div>
      )}

      <div style={{ height: "320px", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.75rem", background: "var(--card)" }}>
        {points.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="value" stroke="var(--primary)" dot name={`${mode === "metric" ? key : person}`} />
              {compareEnabled && comparePoints.length > 0 && (
                <Line type="monotone" dataKey="value" stroke="var(--secondary-foreground)" dot name={compareLabel} data={comparePoints} />
              )}
              {overlayEnabled && overlayPoints.length > 0 && (
                <Line type="monotone" dataKey="value" stroke="#5C7AEA" dot name="Overlay" data={overlayPoints} />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)" }}>
            Run a query to see results.
          </div>
        )}
      </div>
    </div>
  );
}

function findClosest(input: string, options: string[]) {
  if (!input || !options.length) return null;
  const normalized = normalize(input);
  let best: { key: string; dist: number } | null = null;
  for (const opt of options) {
    const d = levenshtein(normalize(opt), normalized);
    if (!best || d < best.dist) {
      best = { key: opt, dist: d };
    }
  }
  return best?.key || null;
}

function normalize(val: string) {
  return val.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function levenshtein(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function weekStartIso(year: number, week: number) {
  if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
  const simple = new Date(Date.UTC(year, 0, 1 + week * 7));
  const dow = simple.getUTCDay();
  const isoWeekStart = simple;
  isoWeekStart.setUTCDate(simple.getUTCDate() - (dow === 0 ? 6 : dow - 1)); // shift to Monday
  return isoWeekStart.toISOString();
}

function formatBucketLabel(raw: string) {
  if (!raw) return raw;
  if (raw === "All time") return "All time";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? raw : formatFriendlyDate(d.toISOString());
  }
  const weekMatch = raw.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const year = Number(weekMatch[1]);
    const week = Number(weekMatch[2]);
    const start = weekStartIso(year, week);
    return start ? `Week of ${formatFriendlyDate(start)}` : raw;
  }
  const monthMatch = raw.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const d = new Date(`${monthMatch[1]}-${monthMatch[2]}-01T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? raw : formatFriendlyDate(d.toISOString());
  }
  const spanMatch = raw.match(/^(\d{4})-(\d{2}) \(\+(\d)m\)$/);
  if (spanMatch) {
    const d = new Date(`${spanMatch[1]}-${spanMatch[2]}-01T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return raw;
    const end = new Date(d);
    end.setMonth(d.getMonth() + Number(spanMatch[3]));
    return `${formatFriendlyDate(d.toISOString())} → ${formatFriendlyDate(end.toISOString())}`;
  }
  return raw;
}

function describeBucket(bucket: string) {
  switch (bucket) {
    case "day":
      return "day";
    case "week":
      return "week";
    case "month":
      return "month";
    case "month_2":
      return "2-month span";
    case "month_3":
      return "3-month span";
    case "all":
      return "all time";
    default:
      return bucket;
  }
}

function movingAverage(series: Point[], window = 2) {
  if (series.length <= 2) return series;
  const vals = series.map((p) => p.value);
  const smooth = vals.map((_, idx) => {
    const start = Math.max(0, idx - window);
    const end = Math.min(vals.length, idx + window + 1);
    const slice = vals.slice(start, end);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    return avg;
  });
  return series.map((p, idx) => ({ ...p, value: Number(smooth[idx].toFixed(2)) }));
}

function parseBucket(raw?: string) {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { type: "day", date: new Date(raw) };
  }
  const weekMatch = raw.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const start = weekStartIso(Number(weekMatch[1]), Number(weekMatch[2]));
    return start ? { type: "week", date: new Date(start) } : null;
  }
  const monthMatch = raw.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    return { type: "month", date: new Date(`${monthMatch[1]}-${monthMatch[2]}-01T00:00:00Z`) };
  }
  return null;
}

function describeGaps(points: Point[], bucket: string) {
  if (!points.length) return null;
  if (bucket === "all" || bucket === "month_2" || bucket === "month_3") return null;
  const parsed = points
    .map((p) => ({ raw: p.rawBucket || p.bucket, parsed: parseBucket(p.rawBucket || p.bucket) }))
    .filter((p) => p.parsed);
  if (parsed.length < 2) return null;
  parsed.sort((a, b) => a.parsed!.date.getTime() - b.parsed!.date.getTime());
  let gaps = 0;
  for (let i = 1; i < parsed.length; i++) {
    const prev = parsed[i - 1].parsed!;
    const curr = parsed[i].parsed!;
    const diffDays = (curr.date.getTime() - prev.date.getTime()) / (1000 * 60 * 60 * 24);
    if (parsed[i].parsed?.type === "day" && diffDays > 1.5) gaps += 1;
    if (parsed[i].parsed?.type === "week" && diffDays > 8) gaps += 1;
    if (parsed[i].parsed?.type === "month" && diffDays > 32) gaps += 1;
  }
  return gaps ? `Data has ${gaps} gap${gaps > 1 ? "s" : ""} in this range.` : null;
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload as Point;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", padding: "0.5rem", borderRadius: "var(--radius)", minWidth: 180 }}>
      <div className="text-small text-muted">{point.label || point.bucket}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="text-small" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{p.name || "Series"}</span>
          <span>{Number(p.value).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function Sparkline({ values }: { values?: number[] }) {
  if (!values || !values.length) return <span style={{ width: 32 }} />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * 32;
      const y = 16 - ((v - min) / range) * 16;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={34} height={18} viewBox="0 0 34 18" aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        points={pts}
        opacity={0.7}
      />
    </svg>
  );
}
