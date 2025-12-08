"use client";

import { useEffect, useMemo, useState } from "react";
import { SimpleGraph } from "@/components/graph/SimpleGraph";

type Suggestion = { value: string; type: "person" | "activity" | "tag" };

export default function GraphPage() {
  const [entityType, setEntityType] = useState<"person" | "activity" | "tag">("person");
  const [entityId, setEntityId] = useState("");
  const [focusLabel, setFocusLabel] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;
    async function search() {
      setLoadingSuggestions(true);
      try {
        const res = await fetch(`/api/entities/search?q=${encodeURIComponent(query.trim())}&smart=1`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        const next: Suggestion[] = [];
        for (const p of data.people || []) {
          next.push({ value: p, type: "person" });
        }
        for (const a of data.activities || []) {
          next.push({ value: a, type: "activity" });
        }
        for (const t of data.tags || []) {
          next.push({ value: t, type: "tag" });
        }
        if (!cancelled) setSuggestions(next.slice(0, 15));
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    }
    search();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const legend = useMemo(
    () => [
      { label: "Person", color: "var(--primary)" },
      { label: "Event", color: "var(--secondary)" },
      { label: "Activity", color: "#FF9F1C" },
      { label: "Tag", color: "#2EC4B6" },
      { label: "Life dump", color: "#6C63FF" },
      { label: "Reflection", color: "#8D99AE" },
      { label: "Goal", color: "#5D9C59" },
      { label: "Metric", color: "#5C7AEA" }
    ],
    []
  );

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1>Graph</h1>
        <p className="text-muted">Explore linked captures, people, tags, activities, goals, and reflections.</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
        <div>
          <label className="label" htmlFor="entity-type">Entity type</label>
          <select
            id="entity-type"
            className="input"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as "person" | "activity" | "tag")}
          >
            <option value="person">Person</option>
            <option value="activity">Activity</option>
            <option value="tag">Tag</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="entity-id">Entity id</label>
          <input
            id="entity-id"
            className="input"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="e.g., Alex"
          />
          <input
            className="input"
            style={{ marginTop: "0.35rem" }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people/activities/tags"
          />
          {loadingSuggestions && <div className="text-small text-muted" style={{ marginTop: "0.2rem" }}>Searching…</div>}
          {!loadingSuggestions && suggestions.length > 0 && (
            <div style={{ marginTop: "0.35rem", display: "grid", gap: "0.25rem" }}>
              {suggestions.map((s, idx) => (
                <button
                  key={`${s.type}-${s.value}-${idx}`}
                  className="btn btn-ghost btn-sm"
                  type="button"
                onClick={() => {
                  setEntityType(s.type);
                  setEntityId(s.value);
                  setFocusLabel(`${s.type}: ${s.value}`);
                }}
                style={{ justifyContent: "flex-start" }}
              >
                {s.value} <span className="text-muted" style={{ marginLeft: "0.35rem" }}>({s.type})</span>
              </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        {legend.map((item) => (
          <span key={item.label} className="text-small" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.35rem 0.5rem", border: "1px solid var(--border)", borderRadius: "999px" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, display: "inline-block" }} />
            {item.label}
          </span>
        ))}
      </div>

      <SimpleGraph entityType={entityType} entityId={entityId} title={focusLabel || "Graph"} limit={200} />
    </div>
  );
}
