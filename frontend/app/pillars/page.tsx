"use client";

import { AnimatePresence, motion } from "framer-motion";
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    setChatA("");
    setChatError(null);
  }, [selectedId]);

  const selected = useMemo(() => pillars.find((p) => p.id === selectedId) || pillars[0], [pillars, selectedId]);

  async function refresh() {
    try {
      setLoadError(null);
      const res = await fetch("/api/pillars");
      const data = await res.json();
      setPillars(Array.isArray(data.pillars) ? data.pillars : []);
      if (!selectedId && data.pillars?.length) setSelectedId(data.pillars[0].id);
    } catch {
      setLoadError("Failed to load pillars");
    }
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setLoading(true);
    setCreateError(null);
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
      setShowModal(false);
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create pillar");
    } finally {
      setLoading(false);
    }
  }

  async function handleChat() {
    if (!selected) return;
    setChatLoading(true);
    setChatA("");
    setChatError(null);
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
      setChatError(err?.message || "Failed to chat");
    } finally {
      setChatLoading(false);
    }
  }

  const formattedSelectedDate = selected?.created_at ? new Date(selected.created_at).toLocaleDateString() : null;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "2rem" }}>
      <header style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: "0.35rem" }}>Pillars</h1>
          <p className="text-muted">Capture your core values and open each pillar to review and chat.</p>
          {loadError && <div className="text-small" style={{ color: "var(--destructive)", marginTop: "0.35rem" }}>{loadError}</div>}
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setShowModal(true)}>
          New pillar
        </button>
      </header>

      {pillars.length === 0 ? (
        <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius)", padding: "1.5rem", background: "var(--card)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <h3 style={{ marginBottom: "0.35rem" }}>You have no pillars yet</h3>
              <p className="text-muted text-small">Document your values and open them to chat with the AI for alignment.</p>
            </div>
            <button className="btn btn-primary" type="button" onClick={() => setShowModal(true)}>
              Add your first pillar
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1.25fr 0.9fr", alignItems: "start" }}>
          <section style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem", background: "var(--card)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
              <div>
                <h3 style={{ marginBottom: "0.2rem" }}>Your pillars</h3>
                <p className="text-small text-muted">Click a card to open the pillar and see everything inside.</p>
              </div>
              <span className="text-small text-muted">{pillars.length} total</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
              {pillars.map((p) => {
                const isSelected = selected?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    style={{
                      textAlign: "left",
                      border: `1px solid ${isSelected ? "var(--ring)" : "var(--border)"}`,
                      background: isSelected ? "linear-gradient(180deg, #f8fafc, #e2e8f0)" : "var(--card)",
                      borderRadius: "0.9rem",
                      padding: "1rem",
                      cursor: "pointer",
                      boxShadow: isSelected ? "0 10px 24px rgba(15, 23, 42, 0.12)" : "none",
                      transition: "border-color 0.2s, transform 0.2s, box-shadow 0.2s",
                      minHeight: "170px"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.35rem" }}>
                      <strong style={{ fontSize: "1.05rem" }}>{p.title}</strong>
                      {isSelected && <span className="tag-filter" style={{ borderColor: "var(--ring)" }}>Open</span>}
                    </div>
                    <div className="text-small text-muted" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: "6.75rem", overflow: "hidden" }}>
                      {p.values_text || "No notes added yet."}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem", background: "var(--card)", position: "sticky", top: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
              <div>
                <div className="text-small text-muted">Open pillar</div>
                <h3 style={{ margin: 0 }}>{selected ? selected.title : "Select a pillar"}</h3>
              </div>
              {formattedSelectedDate && <span className="text-small text-muted">Created {formattedSelectedDate}</span>}
            </div>

            {selected ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.85rem", background: "var(--muted)" }}>
                  <strong style={{ display: "block", marginBottom: "0.35rem" }}>Values & notes</strong>
                  <p className="text-small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, color: "var(--muted-foreground)" }}>
                    {selected.values_text || "Document how you define this pillar, examples, and reminders."}
                  </p>
                </div>

                <div>
                  <label className="label" htmlFor="pillar-chat">Chat about this pillar</label>
                  <textarea
                    id="pillar-chat"
                    className="textarea"
                    rows={3}
                    value={chatQ}
                    onChange={(e) => setChatQ(e.target.value)}
                    placeholder="Ask how you're aligning with this pillar..."
                  />
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.35rem" }}>
                    <button className="btn btn-primary btn-sm" type="button" onClick={handleChat} disabled={chatLoading || !chatQ.trim()}>
                      {chatLoading ? "Thinking..." : "Ask"}
                    </button>
                    {chatError && <span className="text-small" style={{ color: "var(--destructive)" }}>{chatError}</span>}
                  </div>
                </div>

                {chatA && (
                  <div className="text-small" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.75rem", background: "var(--muted)" }}>
                    {chatA}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted text-small" style={{ marginTop: "0.35rem" }}>Click a pillar card to open it, read the values, and chat with the AI.</p>
            )}
          </section>
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <motion.div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15, 23, 42, 0.5)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
              zIndex: 30
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowModal(false)}
          >
            <motion.div
              style={{
                width: "min(640px, 100%)",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "1rem",
                padding: "1.25rem",
                boxShadow: "0 20px 40px rgba(15, 23, 42, 0.25)"
              }}
              onClick={(e) => e.stopPropagation()}
              initial={{ y: 12, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 10, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18 }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                <div>
                  <h3 style={{ marginBottom: "0.2rem" }}>Create a pillar</h3>
                  <p className="text-small text-muted">Name your pillar and add the values or examples that define it.</p>
                </div>
                <button className="btn btn-ghost btn-icon" type="button" aria-label="Close" onClick={() => setShowModal(false)}>
                  X
                </button>
              </div>

              <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
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
                    rows={4}
                    value={values}
                    onChange={(e) => setValues(e.target.value)}
                    placeholder="Bullet your commitments, definitions, examples…"
                  />
                </div>
                {createError && <span className="text-small" style={{ color: "var(--destructive)" }}>{createError}</span>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <button className="btn btn-ghost" type="button" onClick={() => setShowModal(false)} disabled={loading}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !title.trim()}>
                    {loading ? "Saving..." : "Save pillar"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
