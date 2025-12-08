"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { movingAverage, describeBucket, type MetricPoint } from "@/lib/metrics";
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

export default function PersonDetailPage() {
  const params = useParams<{ name: string }>();
  const person = useMemo(() => decodeURIComponent(params?.name ?? ""), [params?.name]);
  const [bucket, setBucket] = useState("week");
  const [smooth, setSmooth] = useState(false);
  const [points, setPoints] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  async function handleAsk() {
    if (!question.trim()) return;
    setChatLoading(true);
    setChatError(null);
    setAnswer("");
    try {
      const res = await fetch("/api/ai/entity-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: "person", entity_id: person, question, limit: 15 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to get answer");
      }
      const data = await res.json();
      setAnswer(data.answer || "");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to ask";
      setChatError(message);
    } finally {
      setChatLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
    try {
      const res = await fetch(`/api/entities/person/${encodeURIComponent(person)}?bucket=${encodeURIComponent(bucket)}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      const series = Array.isArray(data.series?.points) ? data.series.points : [];
      const processed = smooth ? movingAverage(series) : series;
      if (!cancelled) {
        setPoints(processed);
        setEvents(Array.isArray(data.events) ? data.events : []);
      }
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load person data";
        if (!cancelled) setError(message);
    } finally {
      if (!cancelled) setLoading(false);
    }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [person, bucket, smooth]);

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto" }}>
      <header style={{ marginBottom: "1rem" }}>
        <div className="text-small text-muted" style={{ marginBottom: "0.35rem" }}>
          <Link href="/metrics/relationships" className="text-muted">← Relationships</Link>
        </div>
        <h1>{person}</h1>
        <p className="text-muted">Mentions, captures, and insights related to this person.</p>
      </header>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
          <strong>Mentions over time</strong>
          <span className="text-small text-muted">{describeBucket(bucket)} buckets</span>
        </div>
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
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-small text-muted" style={{ display: "flex", alignItems: "center", height: "100%" }}>No data yet.</div>
          )}
        </div>
      </div>

      <section style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.85rem", background: "var(--card)", marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
          <strong>Captures mentioning {person}</strong>
          <span className="text-small text-muted">Newest first</span>
        </div>
        {loading ? (
          <div className="text-small text-muted">Loading…</div>
        ) : error ? (
          <div className="text-small" style={{ color: "var(--destructive)" }}>{error}</div>
        ) : events.length ? (
          <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {events.map((ev) => (
              <li key={ev.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.65rem" }}>
                <div className="text-small text-muted">{ev.occurred_at ? formatFriendlyDate(ev.occurred_at) : ""}</div>
                <div style={{ marginTop: "0.2rem" }}>{ev.summary || ev.raw_text || "No text available"}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-small text-muted">No captures yet.</div>
        )}
      </section>

      <section style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius)", padding: "0.85rem", background: "var(--muted)" }}>
        <strong>Chat about {person}</strong>
        <p className="text-small text-muted" style={{ marginTop: "0.25rem" }}>
          Ask questions scoped to captures mentioning this person.
        </p>
        <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <textarea
            className="input"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g., How has my tone changed around them recently?"
          />
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={handleAsk}
              disabled={chatLoading || !question.trim()}
            >
              {chatLoading ? "Asking..." : "Ask"}
            </button>
            {chatError && <span className="text-small" style={{ color: "var(--destructive)" }}>{chatError}</span>}
          </div>
          {answer && (
            <div className="text-small" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.65rem", background: "var(--card)" }}>
              {answer}
            </div>
          )}
        </div>
      </section>

      <div style={{ marginTop: "1rem" }}>
        <SimpleGraph entityType="person" entityId={person} title="Graph (person + linked items)" />
      </div>
    </div>
  );
}
