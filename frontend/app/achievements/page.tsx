"use client";

import { useEffect, useMemo, useState } from "react";

type Achievement = {
  id: number;
  title: string;
  description?: string | null;
  tags?: string[] | null;
  occurred_at?: string | null;
  created_at: string;
  updated_at?: string;
};

function parseTagInput(input: string) {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12)
    )
  );
}

function formatDate(value?: string | null) {
  if (!value) return "No date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "No date";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AchievementsPage() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [question, setQuestion] = useState("What were my biggest wins this month?");
  const [answer, setAnswer] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/achievements");
      if (!res.ok) {
        throw new Error("Failed to load achievements");
      }
      const data = await res.json();
      setAchievements(Array.isArray(data.achievements) ? data.achievements : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load achievements";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!title.trim()) {
      setFormError("Add a title before saving.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() ? description.trim() : null,
          occurred_at: occurredAt || null,
          tags: parseTagInput(tagsInput),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to save achievement");
      }
      const data = await res.json();
      setAchievements((prev) => [data.achievement, ...prev]);
      setTitle("");
      setDescription("");
      setOccurredAt("");
      setTagsInput("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save achievement";
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const confirmed = window.confirm("Delete this achievement?");
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/achievements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setAchievements((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete achievement";
      setError(message);
    }
  }

  async function handleChat() {
    if (!question.trim()) return;
    setChatLoading(true);
    setAnswer("");
    setChatError(null);
    try {
      const res = await fetch("/api/achievements/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to chat");
      }
      const data = await res.json();
      setAnswer(data.answer || "");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to chat";
      setChatError(message);
    } finally {
      setChatLoading(false);
    }
  }

  const allTags = useMemo(() => {
    const tags = achievements.flatMap((a) => a.tags || []);
    const counts = tags.reduce<Record<string, number>>((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [achievements]);

  const filteredAchievements = useMemo(() => {
    const term = search.trim().toLowerCase();
    return achievements.filter((a) => {
      const matchesSearch =
        !term ||
        a.title.toLowerCase().includes(term) ||
        (a.description ?? "").toLowerCase().includes(term) ||
        (a.tags || []).some((t) => t.toLowerCase().includes(term));
      const matchesTags = !selectedTags.length || selectedTags.every((t) => (a.tags || []).includes(t));
      return matchesSearch && matchesTags;
    });
  }, [achievements, search, selectedTags]);

  const total = achievements.length;
  const lastMonthCount = useMemo(() => {
    const now = Date.now();
    const thirtyDays = 1000 * 60 * 60 * 24 * 30;
    return achievements.filter((a) => {
      const refDate = new Date(a.occurred_at || a.created_at).getTime();
      return !Number.isNaN(refDate) && now - refDate <= thirtyDays;
    }).length;
  }, [achievements]);

  const uniqueTagCount = allTags.length;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "2rem" }}>
      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: "1.1rem",
          padding: "1.25rem",
          marginBottom: "1.25rem",
          background: "var(--card)",
          boxShadow: "0 12px 26px rgba(15,23,42,0.08)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <span className="tag-filter" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>Private</span>
              <span className="text-small text-muted">Your vault of big and small wins</span>
            </div>
            <div>
              <h1 style={{ margin: 0 }}>Achievements</h1>
              <p className="text-muted" style={{ maxWidth: "720px", marginTop: "0.35rem" }}>
                Capture every win, tiny or massive, and keep a single place to revisit them. Tag, filter, and chat to
                jog your memory or confirm the details.
              </p>
            </div>
            {error && <div className="text-small" style={{ color: "var(--destructive)", marginTop: "0.1rem" }}>{error}</div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: "0.75rem", minWidth: "280px" }}>
            <div style={{ padding: "0.85rem", borderRadius: "0.9rem", background: "var(--muted)", border: "1px solid var(--border)" }}>
              <div className="text-small text-muted">Logged</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{total}</div>
            </div>
            <div style={{ padding: "0.85rem", borderRadius: "0.9rem", background: "var(--muted)", border: "1px solid var(--border)" }}>
              <div className="text-small text-muted">Last 30 days</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{lastMonthCount}</div>
            </div>
            <div style={{ padding: "0.85rem", borderRadius: "0.9rem", background: "var(--muted)", border: "1px solid var(--border)" }}>
              <div className="text-small text-muted">Tags</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{uniqueTagCount}</div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1.4fr 1fr", alignItems: "start" }}>
        <section style={{ border: "1px solid var(--border)", borderRadius: "1rem", padding: "1rem", background: "var(--card)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
            <div>
              <h3 style={{ margin: 0 }}>Wins log</h3>
              <p className="text-small text-muted" style={{ marginTop: "0.2rem" }}>
                Timeline of every achievement. Search or tap tags to narrow down.
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <input
                className="input"
                placeholder="Search titles, notes, or tags"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ minWidth: "220px" }}
              />
              {(search || selectedTags.length) && (
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setSearch(""); setSelectedTags([]); }}>
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {allTags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
              {allTags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
                    }}
                    className="tag-filter"
                    style={{
                      cursor: "pointer",
                      background: active ? "rgba(14, 165, 233, 0.16)" : "var(--muted)",
                      borderColor: active ? "var(--primary)" : "var(--border)",
                      color: "var(--foreground)"
                    }}
                  >
                    {active ? "✓ " : ""}
                    {tag}
                  </button>
                );
              })}
            </div>
          )}

          {loading ? (
            <div className="text-small text-muted">Loading achievements…</div>
          ) : filteredAchievements.length === 0 ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: "0.9rem", padding: "1rem", background: "var(--muted)" }}>
              <strong>No achievements yet</strong>
              <p className="text-small text-muted" style={{ marginTop: "0.3rem" }}>
                Log a win on the right and it will appear here. Think small: shipping a pull request, going for a run, a tough conversation.
              </p>
            </div>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {filteredAchievements.map((a) => {
                const dateLabel = formatDate(a.occurred_at || a.created_at);
                return (
                  <li
                    key={a.id}
                    style={{
                      listStyle: "none",
                      border: "1px solid var(--border)",
                      borderRadius: "0.95rem",
                      padding: "0.85rem",
                      background: "linear-gradient(180deg, var(--card), var(--muted))",
                      boxShadow: "0 10px 24px rgba(15,23,42,0.08)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span className="text-small" style={{ background: "var(--muted)", padding: "0.25rem 0.6rem", borderRadius: "999px", border: "1px solid var(--border)" }}>
                          {dateLabel}
                        </span>
                        <strong style={{ fontSize: "1.05rem" }}>{a.title}</strong>
                      </div>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => handleDelete(a.id)}>
                        Delete
                      </button>
                    </div>
                    {a.description && (
                      <p className="text-small" style={{ marginTop: "0.35rem", color: "var(--muted-foreground)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                        {a.description}
                      </p>
                    )}
                    {a.tags && a.tags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.35rem" }}>
                        {a.tags.map((tag) => (
                          <span key={tag} className="tag-filter" style={{ borderColor: "var(--border)" }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside style={{ display: "flex", flexDirection: "column", gap: "0.85rem", position: "sticky", top: "1rem" }}>
          <section style={{ border: "1px solid var(--border)", borderRadius: "1rem", padding: "1rem", background: "var(--card)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              <div>
                <h3 style={{ margin: 0 }}>Log a win</h3>
                <p className="text-small text-muted" style={{ marginTop: "0.2rem" }}>Quick add to the vault.</p>
              </div>
              <span className="text-small text-muted">{total} stored</span>
            </div>
            <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.75rem" }}>
              <div>
                <label className="label" htmlFor="ach-title">Title</label>
                <input
                  id="ach-title"
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Shipped v1, hit a PR milestone, nailed a talk…"
                />
              </div>
              <div>
                <label className="label" htmlFor="ach-date">Date</label>
                <input
                  id="ach-date"
                  className="input"
                  type="date"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="ach-tags">Tags</label>
                <input
                  id="ach-tags"
                  className="input"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="career, fitness, learning"
                />
                <p className="text-small text-muted" style={{ marginTop: "0.25rem" }}>Comma separated. Used for filters and chat context.</p>
              </div>
              <div>
                <label className="label" htmlFor="ach-notes">Notes</label>
                <textarea
                  id="ach-notes"
                  className="textarea"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What happened? Why does it matter?"
                />
              </div>
              {formError && <span className="text-small" style={{ color: "var(--destructive)" }}>{formError}</span>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button className="btn btn-primary" type="button" onClick={handleCreate} disabled={saving}>
                  {saving ? "Saving..." : "Save achievement"}
                </button>
              </div>
            </div>
          </section>

          <section style={{ border: "1px solid var(--border)", borderRadius: "1rem", padding: "1rem", background: "var(--card)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.35rem" }}>Chat with your wins</h3>
            <p className="text-small text-muted" style={{ marginBottom: "0.5rem" }}>
              Ask to recall details, dates, themes, or a quick recap across your achievements.
            </p>
            <textarea
              className="textarea"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., Which projects did I finish this quarter?"
            />
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.35rem" }}>
              <button className="btn btn-primary btn-sm" type="button" onClick={handleChat} disabled={chatLoading || !question.trim()}>
                {chatLoading ? "Thinking..." : "Ask"}
              </button>
              {chatError && <span className="text-small" style={{ color: "var(--destructive)" }}>{chatError}</span>}
            </div>
            {answer && (
              <div className="text-small" style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "0.75rem", background: "var(--muted)", marginTop: "0.65rem" }}>
                {answer}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
