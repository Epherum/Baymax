"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function PeopleIndexPage() {
  const [people, setPeople] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetch("/api/metrics/people")
      .then((res) => res.json())
      .then((data) => setPeople(Array.isArray(data.people) ? data.people : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!search.trim()) return;
    let cancelled = false;
    async function runSearch() {
      setSearching(true);
      try {
        const res = await fetch(`/api/entities/search?q=${encodeURIComponent(search.trim())}&smart=1`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        if (!cancelled) setPeople(Array.isArray(data.people) ? data.people : []);
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
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1>People</h1>
        <p className="text-muted">Browse detected people from your captures and jump into their timelines.</p>
      </header>
      <div style={{ marginBottom: "0.75rem" }}>
        <input
          className="input"
          placeholder="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {searching && <div className="text-small text-muted" style={{ marginTop: "0.25rem" }}>Searching…</div>}
      </div>
      {people.length ? (
        <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
          {people.map((p) => (
            <li key={p} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.75rem", background: "var(--card)" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>{p}</div>
              <Link className="btn btn-ghost btn-sm" href={`/people/${encodeURIComponent(p)}`}>
                Open view
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-muted">No people detected yet.</div>
      )}
    </div>
  );
}
