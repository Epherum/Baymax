"use client";

import { useEffect, useState } from "react";
import { EventCard, EventItem } from "@/components/capture/EventCard";

export default function RecentCaptureListPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const limit = 15;

  useEffect(() => {
    refreshEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, sourceFilter, query]);

  async function refreshEvents() {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    if (sourceFilter) params.set("source", sourceFilter);
    if (query.trim()) params.set("q", query.trim());
    try {
      const res = await fetch(`/api/events?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {
      // ignore
    }
  }

  const canPrev = offset > 0;

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", paddingBottom: "2rem" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1>All Entries</h1>
        <p className="text-muted">Search and page through your captures.</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center" }}>
        <input
          className="input"
          placeholder="Search..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOffset(0);
          }}
        />
        <select
          className="input"
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All sources</option>
          <option value="manual">Manual</option>
          <option value="sync">Sync</option>
          <option value="life_dump">Life dump</option>
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {events.map((evt) => (
          <EventCard key={evt.id} event={evt} onUpdated={refreshEvents} />
        ))}
        {events.length === 0 && <p className="text-muted">No entries found.</p>}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
        <button className="btn btn-ghost text-small" onClick={() => setOffset((o) => Math.max(0, o - limit))} disabled={!canPrev}>
          Previous
        </button>
        <button className="btn btn-ghost text-small" onClick={() => setOffset((o) => o + limit)}>
          Next
        </button>
      </div>
    </div>
  );
}
