"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { RefreshCw, Maximize2 } from "lucide-react";
import { EventCard, EventItem } from "./EventCard";

type Props = {
    refreshTrigger: number;
};

export function RecentEntries({ refreshTrigger }: Props) {
    const [events, setEvents] = useState<EventItem[]>([]);
    const [query, setQuery] = useState("");
    const [sourceFilter, setSourceFilter] = useState<string>("");
    const [offset, setOffset] = useState(0);
    const limit = 2;

    useEffect(() => {
        refreshEvents();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [offset, sourceFilter, query, refreshTrigger]);

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
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <section style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>Recent Entries</h2>
                    <Link className="btn btn-ghost btn-sm" href="/capture/recent" style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
                        <Maximize2 size={14} /> View all
                    </Link>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                        className="input"
                        placeholder="Search..."
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setOffset(0);
                        }}
                        style={{ flex: 1 }}
                    />
                    <button className="btn btn-ghost btn-icon" onClick={refreshEvents} title="Refresh">
                        <RefreshCw size={16} />
                    </button>
                </div>
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
            </section>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", overflowY: "auto", maxHeight: "calc(100vh - 200px)", paddingRight: "0.5rem" }}>
                {events.map((evt) => (
                    <EventCard key={evt.id} event={evt} onUpdated={refreshEvents} />
                ))}
                {events.length === 0 && (
                    <p className="text-muted" style={{ textAlign: "center", padding: "2rem" }}>No entries found.</p>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem" }}>
                    <button className="btn btn-ghost text-small" onClick={() => setOffset((o) => Math.max(0, o - limit))} disabled={!canPrev}>
                        Previous
                    </button>
                    <button className="btn btn-ghost text-small" onClick={() => setOffset((o) => o + limit)}>
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
