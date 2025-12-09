"use client";

import { useEffect, useState } from "react";
import { Reflection, ReflectionEvent, ReflectionInsight, ReflectionInsightMessage, ReflectionChatMessage } from "@/types";
import { ReflectionCard } from "@/components/reflections/ReflectionCard";
import { ReflectionForm } from "@/components/reflections/ReflectionForm";
import { InsightModal } from "@/components/reflections/InsightModal";
import { ReflectionModal } from "@/components/reflections/ReflectionModal";
import { ReflectionTimeline } from "@/components/reflections/ReflectionTimeline";
import { AnimatePresence, motion } from "framer-motion";
import { Modal } from "@/components/ui/Modal";

export default function ReflectionsPage() {
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [evidenceEvents, setEvidenceEvents] = useState<Record<number, ReflectionEvent[]>>({});
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<{ reflection: Reflection; insight: ReflectionInsight } | null>(null);
  const [chatMessages, setChatMessages] = useState<ReflectionInsightMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [activeReflection, setActiveReflection] = useState<Reflection | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "timeline">("cards");
  const [reflectionMessages, setReflectionMessages] = useState<ReflectionChatMessage[]>([]);
  const [loadingReflectionChat, setLoadingReflectionChat] = useState(false);
  const [sendingReflectionChat, setSendingReflectionChat] = useState(false);
  const [reflectionChatError, setReflectionChatError] = useState<string | null>(null);
  const [dueStatuses, setDueStatuses] = useState<Array<{ period: "daily" | "weekly" | "monthly"; due: boolean; next_due_at?: string | null; current_token?: string; last_run_token?: string | null }>>([]);
  const [dueLoading, setDueLoading] = useState(false);
  const [dueError, setDueError] = useState<string | null>(null);
  const [snoozeInputs, setSnoozeInputs] = useState<Record<string, string>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);

  useEffect(() => {
    refreshReflections();
    refreshDueStatuses();
  }, []);

  async function refreshReflections() {
    const res = await fetch("/api/reflections");
    if (res.ok) {
      const data = await res.json();
      setReflections(data.reflections ?? []);
      const grouped: Record<number, ReflectionEvent[]> = {};
      (data.events ?? []).forEach((ev: ReflectionEvent) => {
        if (!grouped[ev.reflection_id]) grouped[ev.reflection_id] = [];
        grouped[ev.reflection_id].push(ev);
      });
      setEvidenceEvents(grouped);
    }
  }

  async function refreshDueStatuses() {
    setDueLoading(true);
    setDueError(null);
    try {
      const res = await fetch("/api/reflections/due");
      if (!res.ok) throw new Error("Failed to load reflection reminders");
      const data = await res.json();
      const periods = Array.isArray(data.periods) ? data.periods : [];
      const normalized = periods
        .map((p: any) => ({
          period: p?.period,
          due: !!p?.due,
          next_due_at: p?.next_due_at ?? null,
          current_token: p?.current_token,
          last_run_token: p?.last_run_token ?? null,
        }))
        .filter((p: any) => p.period === "daily" || p.period === "weekly" || p.period === "monthly");
      setDueStatuses(normalized as any);
      setSnoozeInputs((prev) => {
        const next = { ...prev };
        normalized.forEach((p) => {
          const key = p?.period;
          if (key && !next[key]) {
            next[key] = p?.next_due_at ? String(p.next_due_at).slice(0, 10) : "";
          }
        });
        return next;
      });
    } catch (err: any) {
      setDueError(err?.message || "Failed to load reflection reminders");
    } finally {
      setDueLoading(false);
    }
  }

  async function handleSnooze(period: "daily" | "weekly" | "monthly", overrideDate?: string) {
    const date = overrideDate ?? snoozeInputs[period];
    if (!date) return;
    setDueLoading(true);
    setDueError(null);
    try {
      const res = await fetch("/api/reflections/due", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, next_due_at: date }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to update reminder");
      }
      await refreshDueStatuses();
    } catch (err: any) {
      setDueError(err?.message || "Failed to update reminder");
    } finally {
      setDueLoading(false);
    }
  }

  async function fetchChatHistory(reflectionId: number, insightId: string) {
    setChatError(null);
    setLoadingChat(true);
    try {
      const res = await fetch(`/api/reflections/${reflectionId}/insights/${insightId}/chat`);
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data.messages ?? []);
        return true;
      }
      const err = await res.text();
      setChatError(err || "Failed to load chat history.");
    } catch (err: any) {
      setChatError(err?.message || "Failed to load chat history.");
    } finally {
      setLoadingChat(false);
    }
    return false;
  }

  async function handleCreate(data: Partial<Reflection>) {
    setSaving(true);
    try {
      await fetch("/api/reflections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      refreshReflections();
      setShowCreateModal(false);
      refreshDueStatuses();
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate(data: any) {
    setGenerating(true);
    try {
      const res = await fetch("/api/reflections/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        refreshReflections();
        if (result.events && result.reflection?.id) {
          setEvidenceEvents((prev) => ({ ...prev, [result.reflection.id]: result.events }));
        }
        refreshDueStatuses();
        return result;
      }
    } finally {
      setGenerating(false);
    }
  }

  function getEvidenceForInsight(reflectionId: number, insight: ReflectionInsight) {
    const events = evidenceEvents[reflectionId] || [];
    if (Array.isArray(insight.evidence_event_ids) && insight.evidence_event_ids.length > 0) {
      return events.filter((ev) => insight.evidence_event_ids?.includes(ev.event_id));
    }
    return events;
  }

  async function handleOpenInsight(reflection: Reflection, insight: ReflectionInsight) {
    setSelected({ reflection, insight });
    setChatMessages([]);
    await fetchChatHistory(reflection.id, insight.id);
  }

  async function handleOpenReflection(reflection: Reflection) {
    setActiveReflection(reflection);
    await fetchReflectionChat(reflection.id);
  }

  async function handleSendMessage(message: string) {
    if (!selected) return;
    setSendingChat(true);
    setChatError(null);
    try {
      const res = await fetch(`/api/reflections/${selected.reflection.id}/insights/${selected.insight.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data.messages ?? []);
      } else {
        const text = await res.text();
        setChatError(text || "Gemini did not respond.");
        await fetchChatHistory(selected.reflection.id, selected.insight.id);
      }
    } catch (err: any) {
      setChatError(err?.message || "Gemini chat failed.");
      await fetchChatHistory(selected.reflection.id, selected.insight.id);
    } finally {
      setSendingChat(false);
    }
  }

  async function handleDeleteInsight() {
    if (!selected) return;
    const { reflection, insight } = selected;
    try {
      const res = await fetch(`/api/reflections/${reflection.id}/insights/${insight.id}`, { method: "DELETE" });
      if (res.ok) {
        setReflections((prev) =>
          prev.map((r) =>
            r.id === reflection.id
              ? { ...r, patterns: (r.patterns || []).filter((p) => p.id !== insight.id) }
              : r
          )
        );
        setSelected(null);
      } else {
        const text = await res.text();
        setChatError(text || "Failed to delete insight.");
      }
    } catch (err: any) {
      setChatError(err?.message || "Failed to delete insight.");
    }
  }

  async function fetchReflectionChat(reflectionId: number) {
    setReflectionChatError(null);
    setLoadingReflectionChat(true);
    try {
      const res = await fetch(`/api/reflections/${reflectionId}/chat`);
      if (res.ok) {
        const isJson = res.headers.get("content-type")?.includes("application/json");
        const data = isJson ? await res.json() : {};
        setReflectionMessages(data.messages ?? []);
      } else {
        let serverMsg = "Failed to load reflection chat.";
        try {
          const parsed = await res.json();
          if (parsed?.message) serverMsg = parsed.message;
        } catch {
          const text = await res.text();
          console.error("Reflection chat load error:", text);
        }
        setReflectionChatError(serverMsg);
      }
    } catch (err: any) {
      setReflectionChatError(err?.message || "Failed to load reflection chat.");
    } finally {
      setLoadingReflectionChat(false);
    }
  }

  async function handleSendReflectionMessage(message: string) {
    if (!activeReflection) return;
    setSendingReflectionChat(true);
    setReflectionChatError(null);
    try {
      const res = await fetch(`/api/reflections/${activeReflection.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (res.ok) {
        const isJson = res.headers.get("content-type")?.includes("application/json");
        const data = isJson ? await res.json() : {};
        setReflectionMessages(data.messages ?? []);
      } else {
        let serverMsg = "Gemini did not respond.";
        try {
          const parsed = await res.json();
          if (parsed?.message) serverMsg = parsed.message;
        } catch {
          const text = await res.text();
          console.error("Reflection chat send error:", text);
        }
        await fetchReflectionChat(activeReflection.id);
        setReflectionChatError(serverMsg);
      }
    } catch (err: any) {
      setReflectionChatError(err?.message || "Gemini chat failed.");
      await fetchReflectionChat(activeReflection?.id || 0);
    } finally {
      setSendingReflectionChat(false);
    }
  }

  async function handleDeleteReflection() {
    if (!activeReflection) return;
    const id = activeReflection.id;
    try {
      const res = await fetch(`/api/reflections/${id}`, { method: "DELETE" });
      if (res.ok) {
        setReflections((prev) => prev.filter((r) => r.id !== id));
        setEvidenceEvents((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
        setActiveReflection(null);
      } else {
        const text = await res.text();
        setReflectionChatError(text || "Failed to delete reflection.");
      }
    } catch (err: any) {
      setReflectionChatError(err?.message || "Failed to delete reflection.");
    }
  }

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      <header style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h1>Reflections</h1>
            <p className="text-muted" style={{ marginTop: "0.25rem" }}>Analyze your emotional and behavioral patterns (Gemini 2.5 Flash will power the analyses).</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={() => setShowReminderModal(true)}>
              Reminders
            </button>
            <button className="btn btn-primary" type="button" onClick={() => setShowCreateModal(true)}>
              Add reflection
            </button>
          </div>
        </div>
        <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => setViewMode("cards")}
            style={viewMode === "cards" ? { border: "1px solid var(--ring)" } : {}}
          >
            Card view
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => setViewMode("timeline")}
            style={viewMode === "timeline" ? { border: "1px solid var(--ring)" } : {}}
          >
            Timeline view
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {viewMode === "cards" ? (
          <motion.section
            key="cards"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18 }}
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem" }}
          >
            {reflections.map((ref) => (
              <motion.div key={ref.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}>
                <ReflectionCard
                  reflection={ref}
                  evidence={evidenceEvents[ref.id] || []}
                  onOpenInsight={handleOpenInsight}
                  onOpenReflection={handleOpenReflection}
                />
              </motion.div>
            ))}
            {reflections.length === 0 && <p className="text-muted">No reflections yet.</p>}
          </motion.section>
        ) : (
          <motion.div
            key="timeline"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18 }}
          >
            <ReflectionTimeline reflections={reflections} onSelect={handleOpenReflection} />
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="New reflection"
        width="min(900px, 95vw)"
      >
        <ReflectionForm
          onCreate={handleCreate}
          onGenerate={handleGenerate}
          generating={generating}
          saving={saving}
        />
      </Modal>

      <Modal
        open={showReminderModal}
        onClose={() => setShowReminderModal(false)}
        title="Reflection reminders"
        width="min(900px, 95vw)"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          <p className="text-small text-muted" style={{ margin: 0 }}>
            Automatic daily/weekly/monthly reflections are disabled. Use reminders and start them manually.
          </p>
          <button className="btn btn-ghost btn-sm" type="button" onClick={refreshDueStatuses} disabled={dueLoading}>
            {dueLoading ? "Checking..." : "Refresh"}
          </button>
        </div>
        {dueError && <div className="text-small" style={{ color: "var(--destructive)", marginBottom: "0.5rem" }}>{dueError}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
          {dueStatuses.map((status) => {
            const niceLabel = status.period.charAt(0).toUpperCase() + status.period.slice(1);
            const nextDisplay = status.next_due_at ? new Date(status.next_due_at).toISOString().slice(0, 10) : "Not set";
            return (
              <div key={status.period} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.75rem", background: status.due ? "var(--muted)" : "transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                  <strong>{niceLabel} reflection</strong>
                  <span className="text-small" style={{ color: status.due ? "var(--destructive)" : "var(--muted-foreground)" }}>
                    {status.due ? "Due" : "Not due"}
                  </span>
                </div>
                <div className="text-small text-muted" style={{ marginTop: "0.35rem" }}>
                  Next reminder: {nextDisplay}
                </div>
                <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginTop: "0.5rem" }}>
                  <input
                    className="input"
                    type="date"
                    value={snoozeInputs[status.period] ?? ""}
                    onChange={(e) => setSnoozeInputs((prev) => ({ ...prev, [status.period]: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => handleSnooze(status.period)} disabled={dueLoading || !(snoozeInputs[status.period]?.trim())}>
                    Set reminder
                  </button>
                </div>
                <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginTop: "0.35rem" }}>
                  <button className="btn btn-primary btn-sm" type="button" onClick={() => setShowCreateModal(true)}>
                    Start reflection
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() => {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      const iso = tomorrow.toISOString().slice(0, 10);
                      setSnoozeInputs((prev) => ({ ...prev, [status.period]: iso }));
                      handleSnooze(status.period, iso);
                    }}
                    disabled={dueLoading}
                  >
                    Remind tomorrow
                  </button>
                </div>
              </div>
            );
          })}
          {dueStatuses.length === 0 && (
            <div className="text-small text-muted">No reminder data yet. Click refresh to load.</div>
          )}
        </div>
      </Modal>

      <ReflectionModal
        open={!!activeReflection}
        reflection={activeReflection}
        evidence={activeReflection ? (evidenceEvents[activeReflection.id] || []) : []}
        onClose={() => {
          setActiveReflection(null);
          setReflectionMessages([]);
          setReflectionChatError(null);
        }}
        onSelectInsight={(insight) => {
          if (!activeReflection) return;
          handleOpenInsight(activeReflection, insight);
        }}
        messages={reflectionMessages}
        loadingHistory={loadingReflectionChat}
        sending={sendingReflectionChat}
        error={reflectionChatError}
        onSend={handleSendReflectionMessage}
        onDelete={handleDeleteReflection}
      />

      <InsightModal
        open={!!selected}
        reflection={selected?.reflection || null}
        insight={selected?.insight || null}
        evidence={selected ? getEvidenceForInsight(selected.reflection.id, selected.insight) : []}
        messages={chatMessages}
        loadingHistory={loadingChat}
        sending={sendingChat}
        error={chatError}
        onClose={() => setSelected(null)}
        onSend={handleSendMessage}
        onDelete={handleDeleteInsight}
      />
    </div>
  );
}
