"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MessageCircle, Sparkles, Trash2, X } from "lucide-react";
import { Reflection, ReflectionEvent, ReflectionInsight, ReflectionInsightMessage } from "@/types";
import { formatFriendlyDate } from "@/lib/date";

type Props = {
    open: boolean;
    reflection: Reflection | null;
    insight: ReflectionInsight | null;
    evidence: ReflectionEvent[];
    messages: ReflectionInsightMessage[];
    loadingHistory?: boolean;
    sending?: boolean;
    error?: string | null;
    onClose: () => void;
    onSend: (message: string) => Promise<void> | void;
    onDelete: () => Promise<void> | void;
};

export function InsightModal({
    open,
    reflection,
    insight,
    evidence,
    messages,
    loadingHistory,
    sending,
    error,
    onClose,
    onSend,
    onDelete,
}: Props) {
    const [draft, setDraft] = useState("");

    useEffect(() => {
        if (open) {
            setDraft("");
        }
    }, [open, insight?.id]);

    const evidenceList = useMemo(() => evidence || [], [evidence]);

    if (!open || !reflection || !insight) return null;

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
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
                zIndex: 30,
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
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "1rem",
                    width: "min(1100px, 100%)",
                    maxHeight: "90vh",
                    overflow: "hidden",
                    boxShadow: "0 20px 40px rgba(15, 23, 42, 0.25)",
                    display: "grid",
                    gridTemplateColumns: "1.2fr 0.8fr",
                    gap: "0",
                }}
                onClick={(e) => e.stopPropagation()}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 10, opacity: 0 }}
                transition={{ duration: 0.2 }}
            >
                <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", borderRight: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                        <div>
                            <div className="text-small text-muted">Reflection · {reflection.period}</div>
                            <h2 style={{ marginTop: "0.25rem" }}>{insight.statement || "Insight"}</h2>
                            <div className="text-small text-muted" style={{ marginTop: "0.25rem" }}>
                                {new Date(reflection.range_start).toLocaleDateString()} → {new Date(reflection.range_end).toLocaleDateString()}
                            </div>
                        </div>
                        <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close insight">
                            <X size={16} />
                        </button>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {insight.type && <Badge label={insight.type} />}
                        {insight.confidence !== null && insight.confidence !== undefined && <Badge label={`Confidence ${insight.confidence}`} />}
                        <Badge label={reflection.depth} />
                    </div>

                    {insight.insight && (
                        <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--muted)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.35rem" }}>
                                <Sparkles size={14} /> <strong>Context</strong>
                            </div>
                            <p className="text-small" style={{ lineHeight: 1.6 }}>{insight.insight}</p>
                        </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong>Evidence</strong>
                            <span className="text-small text-muted">{evidenceList.length} event(s)</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "220px", overflowY: "auto", paddingRight: "0.35rem" }}>
                            {evidenceList.length === 0 && <p className="text-small text-muted">No evidence was linked to this insight.</p>}
                            {evidenceList.map((ev) => (
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
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <MessageCircle size={16} />
                            <strong>Chat about this insight</strong>
                        </div>
                        <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={async () => {
                                await onDelete();
                            }}
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", color: "var(--destructive)" }}
                        >
                            <Trash2 size={14} /> Delete insight
                        </button>
                    </div>

                    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.75rem", background: "var(--muted)", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem", paddingRight: "0.25rem" }}>
                            {loadingHistory ? (
                                <p className="text-small text-muted">Loading conversation…</p>
                            ) : messages.length === 0 ? (
                                <p className="text-small text-muted">No messages yet. Ask Gemini to unpack this pattern.</p>
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
                        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                            <input
                                className="input"
                                placeholder="Ask Gemini to interrogate this insight..."
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                disabled={sending}
                            />
                            <button className="btn btn-primary" type="submit" disabled={sending || !draft.trim()}>
                                {sending ? "Sending…" : "Send"}
                            </button>
                        </form>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

function Badge({ label }: { label: string }) {
    return (
        <span style={{ border: "1px solid var(--border)", borderRadius: "999px", padding: "0.15rem 0.65rem", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
            {label}
        </span>
    );
}
