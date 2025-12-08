"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, CalendarRange, Sparkles, X } from "lucide-react";
import { Reflection, ReflectionEvent, ReflectionInsight, ReflectionChatMessage } from "@/types";
import { formatFriendlyDate } from "@/lib/date";

type Props = {
    open: boolean;
    reflection: Reflection | null;
    evidence: ReflectionEvent[];
    onClose: () => void;
    onSelectInsight: (insight: ReflectionInsight) => void;
    messages: ReflectionChatMessage[];
    loadingHistory?: boolean;
    sending?: boolean;
    error?: string | null;
    onSend: (message: string) => Promise<void> | void;
    onDelete: () => Promise<void> | void;
};

export function ReflectionModal({
    open,
    reflection,
    evidence,
    onClose,
    onSelectInsight,
    messages,
    loadingHistory,
    sending,
    error,
    onSend,
    onDelete,
}: Props) {
    const insightList = useMemo(() => reflection?.patterns || [], [reflection]);
    const socialPattern = useMemo(
        () => insightList.find((p) => p.type === "social_graph"),
        [insightList]
    );
    const timeHeatmapPattern = useMemo(
        () => insightList.find((p) => p.type === "time_heatmap"),
        [insightList]
    );
    const [draft, setDraft] = useState("");

    if (!open || !reflection) return null;

    async function handleSubmit() {
        if (!draft.trim()) return;
        const text = draft.trim();
        setDraft("");
        await onSend(text);
    }

    return (
        <motion.div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.55)",
                backdropFilter: "blur(6px)",
                zIndex: 25,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "1rem",
            }}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <motion.div
                style={{
                    width: "min(1100px, 100%)",
                    maxHeight: "90vh",
                    overflow: "hidden",
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "1rem",
                    boxShadow: "0 20px 40px rgba(15, 23, 42, 0.25)",
                    display: "grid",
                    gridTemplateColumns: "1fr 0.9fr",
                }}
                onClick={(e) => e.stopPropagation()}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 10, opacity: 0 }}
                transition={{ duration: 0.2 }}
            >
                <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", borderRight: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <CalendarRange size={16} />
                                <div>
                                    <div className="text-small text-muted">{reflection.period}</div>
                                    <strong>{formatFriendlyDate(reflection.range_start)} → {formatFriendlyDate(reflection.range_end)}</strong>
                                </div>
                            </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                            <button
                                className="btn btn-ghost btn-sm"
                                type="button"
                                onClick={async () => {
                                    await onDelete();
                                }}
                                style={{ color: "var(--destructive)" }}
                            >
                                Delete
                            </button>
                            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close reflection modal">
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {reflection.summary && (
                        <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--muted)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.35rem" }}>
                                <Sparkles size={14} /> <strong>Summary</strong>
                            </div>
                            <p className="text-small" style={{ lineHeight: 1.6 }}>{reflection.summary}</p>
                        </div>
                    )}

                    {reflection.insights && (
                        <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.35rem" }}>
                                <Sparkles size={14} /> <strong>Overall insight</strong>
                            </div>
                            <p className="text-small" style={{ lineHeight: 1.6 }}>{reflection.insights}</p>
                        </div>
                    )}

                    {(reflection.mood_curve || reflection.energy_curve) && (
                        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                            {Number.isFinite(reflection.mood_curve?.average) && (
                                <div className="text-small" style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                                    <strong>Mood curve</strong>
                                    <div>Avg: {reflection.mood_curve?.average}</div>
                                    <div>Points: {reflection.mood_curve?.points?.length || 0}</div>
                                </div>
                            )}
                            {Number.isFinite(reflection.energy_curve?.average) && (
                                <div className="text-small" style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                                    <strong>Energy curve</strong>
                                    <div>Avg: {reflection.energy_curve?.average}</div>
                                    <div>Points: {reflection.energy_curve?.points?.length || 0}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {socialPattern && Array.isArray(socialPattern.data?.nodes) && socialPattern.data.nodes.length > 0 && (
                        <div style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                            <strong>Social graph</strong>
                            <div className="text-small text-muted" style={{ marginTop: "0.35rem" }}>
                                {socialPattern.statement}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.35rem" }}>
                                {socialPattern.data.nodes.slice(0, 5).map((n: any) => (
                                    <div key={n.person} className="text-small" style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span>{n.person}</span>
                                        <span className="text-muted">{n.mentions} mentions</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {timeHeatmapPattern && Array.isArray(timeHeatmapPattern.data?.buckets) && timeHeatmapPattern.data.buckets.length > 0 && (
                        <div style={{ padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                            <strong>Time heatmap</strong>
                            <div className="text-small text-muted" style={{ marginTop: "0.35rem" }}>
                                {timeHeatmapPattern.statement}
                            </div>
                            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.35rem" }}>
                                {timeHeatmapPattern.data.buckets.slice(0, 7).map((b: any) => (
                                    <span key={b.bucket} className="tag-filter" style={{ border: "1px solid var(--border)" }}>
                                        {b.bucket}: {b.count}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            <strong>Evidence in this window</strong>
                            <div style={{ maxHeight: "220px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem", paddingRight: "0.35rem" }}>
                                {evidence.length === 0 && <p className="text-small text-muted">No evidence events were linked.</p>}
                                {evidence.map((ev) => (
                                    <div key={ev.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.75rem" }}>
                                        <div className="text-small text-muted">{ev.occurred_at ? formatFriendlyDate(ev.occurred_at) : "Event"}</div>
                                        {ev.raw_text && <p className="text-small" style={{ marginTop: "0.35rem", lineHeight: 1.4 }}>{ev.raw_text}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                </div>

                <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <strong>Insights ({insightList.length})</strong>
                        <div className="text-small text-muted">Click to chat with Gemini</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", overflowY: "auto", maxHeight: "70vh", paddingRight: "0.35rem" }}>
                        {insightList.length === 0 && <p className="text-small text-muted">No insights found for this reflection.</p>}
                        {insightList.map((insight) => (
                            <button
                                key={insight.id}
                                type="button"
                                onClick={() => onSelectInsight(insight)}
                                style={{
                                    textAlign: "left",
                                    border: "1px solid var(--border)",
                                    borderRadius: "var(--radius)",
                                    padding: "0.85rem",
                                    background: "var(--muted)",
                                    cursor: "pointer",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                    gap: "0.75rem",
                                }}
                            >
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                                        <span style={{ fontWeight: 600 }}>{insight.statement || "Insight"}</span>
                                        {insight.type && <span className="text-small text-muted" style={{ border: "1px solid var(--border)", padding: "0.1rem 0.4rem", borderRadius: "999px" }}>{insight.type}</span>}
                                    </div>
                                    {insight.insight && <p className="text-small text-muted" style={{ lineHeight: 1.5 }}>{insight.insight}</p>}
                                    {insight.confidence !== null && insight.confidence !== undefined && (
                                        <span className="text-small text-muted">Confidence: {insight.confidence}</span>
                                    )}
                                </div>
                                <ArrowRight size={16} />
                            </button>
                        ))}
                    </div>
                    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.75rem", background: "var(--muted)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Sparkles size={14} /> <strong>Chat about this reflection</strong>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "260px", overflowY: "auto", paddingRight: "0.25rem" }}>
                            {loadingHistory ? (
                                <p className="text-small text-muted">Loading conversation…</p>
                            ) : messages.length === 0 ? (
                                <p className="text-small text-muted">No messages yet. Ask Gemini about this entire reflection.</p>
                            ) : (
                                messages.map((m) => (
                                    <div
                                        key={m.id}
                                        style={{
                                            alignSelf: m.role === "assistant" ? "flex-start" : "flex-end",
                                            maxWidth: "85%",
                                            background: m.role === "assistant" ? "white" : "var(--primary)",
                                            color: m.role === "assistant" ? "var(--foreground)" : "var(--primary-foreground)",
                                            borderRadius: "var(--radius)",
                                            padding: "0.6rem 0.75rem",
                                            boxShadow: "0 8px 16px rgba(15, 23, 42, 0.08)",
                                        }}
                                    >
                                        <div className="text-small text-muted" style={{ marginBottom: "0.2rem", opacity: 0.75 }}>
                                            {m.role === "assistant" ? "Gemini" : "You"} · {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </div>
                                        <div style={{ lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.message}</div>
                                    </div>
                                ))
                            )}
                        </div>
                        {error && <div className="text-small" style={{ color: "var(--destructive)" }}>{error}</div>}
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <input
                                className="input"
                                placeholder="Ask Gemini about this reflection..."
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                disabled={sending}
                            />
                            <button className="btn btn-primary" type="button" onClick={handleSubmit} disabled={sending || !draft.trim()}>
                                {sending ? "Sending…" : "Send"}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
