"use client";

import { useEffect, useMemo, useState } from "react";

type Pillar = { id: number; title: string; values_text?: string | null; created_at: string };

export default function PillarsPage() {
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [title, setTitle] = useState("");
  const [values, setValues] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatQ, setChatQ] = useState("How am I aligning with this pillar recently?");
  const [chatA, setChatA] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  const selected = useMemo(() => pillars.find((p) => p.id === selectedId) || pillars[0], [pillars, selectedId]);

  async function refresh() {
    try {
      const res = await fetch("/api/pillars");
      const data = await res.json();
      setPillars(Array.isArray(data.pillars) ? data.pillars : []);
      if (!selectedId && data.pillars?.length) setSelectedId(data.pillars[0].id);
    } catch {
      setError("Failed to load pillars");
    }
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pillars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, values_text: values || null })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to create pillar");
      }
      const data = await res.json();
      setPillars((prev) => [data.pillar, ...prev]);
      setSelectedId(data.pillar.id);
      setTitle("");
      setValues("");
    } catch (err: any) {
      setError(err?.message || "Failed to create pillar");
    } finally {
      setLoading(false);
    }
  }

  async function handleChat() {
    if (!selected) return;
    setChatLoading(true);
    setChatA("");
    setError(null);
    try {
      const res = await fetch(`/api/pillars/${selected.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: chatQ })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to chat");
      }
      const data = await res.json();
      setChatA(data.answer || "");
    } catch (err: any) {
      setError(err?.message || "Failed to chat");
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1>Pillars</h1>
        <p className="text-muted">Capture your core values and chat about how you align or drift over time.</p>
      </header>

      <section style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem", background: "var(--card)", marginBottom: "1rem" }}>
        <h3 style={{ marginBottom: "0.5rem" }}>Add a pillar</h3>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <div>
            <label className="label" htmlFor="pillar-title">Title</label>
            <input
              id="pillar-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Integrity"
            />
          </div>
          <div>
            <label className="label" htmlFor="pillar-values">Values / notes</label>
            <textarea
              id="pillar-values"
              className="textarea"
              rows={3}
              value={values}
              onChange={(e) => setValues(e.target.value)}
              placeholder="Bullet your commitments, definitions, examples…"
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !title.trim()}>
              {loading ? "Saving..." : "Save pillar"}
            </button>
            {error && <span className="text-small" style={{ color: "var(--destructive)" }}>{error}</span>}
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "1rem" }}>
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.85rem", background: "var(--card)", minHeight: "260px" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Your pillars</h3>
          {pillars.length === 0 ? (
            <p className="text-muted text-small">Add a pillar to begin.</p>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {pillars.map((p) => (
                <li key={p.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.6rem" }}>
                  <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="pillar"
                      checked={selected?.id === p.id}
                      onChange={() => setSelectedId(p.id)}
                      style={{ marginTop: "0.3rem" }}
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.title}</div>
                      {p.values_text && <div className="text-small text-muted" style={{ whiteSpace: "pre-wrap" }}>{p.values_text}</div>}
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.85rem", background: "var(--card)" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Chat</h3>
          {selected ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div className="text-small text-muted">
                Pillar: <strong>{selected.title}</strong>
              </div>
              <textarea
                className="textarea"
                rows={3}
                value={chatQ}
                onChange={(e) => setChatQ(e.target.value)}
                placeholder="Ask how you're aligning with this pillar..."
              />
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <button className="btn btn-primary btn-sm" type="button" onClick={handleChat} disabled={chatLoading || !chatQ.trim()}>
                  {chatLoading ? "Thinking..." : "Ask"}
                </button>
                {error && <span className="text-small" style={{ color: "var(--destructive)" }}>{error}</span>}
              </div>
              {chatA && (
                <div className="text-small" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.75rem", background: "var(--muted)" }}>
                  {chatA}
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted text-small">Select or add a pillar to chat.</p>
          )}
        </div>
      </section>
    </div>
  );
}
