"use client";

import { useState } from "react";
import { Edit3, Save, Sparkles, Trash2, X } from "lucide-react";
import { LifeDumpChunk } from "@/types";

type Props = {
    chunk: LifeDumpChunk;
    onSave: (values: { summary?: string; start_date?: string | null; end_date?: string | null }) => void;
    onDelete: () => void;
    onSummarize: (text: string) => Promise<string | undefined>;
};

export function ChunkCard({ chunk, onSave, onDelete, onSummarize }: Props) {
    const [editing, setEditing] = useState(false);
    const [summary, setSummary] = useState(chunk.summary ?? "");
    const [startDate, setStartDate] = useState(chunk.start_date || "");
    const [endDate, setEndDate] = useState(chunk.end_date || "");
    const [saving, setSaving] = useState(false);
    const [summarizing, setSummarizing] = useState(false);

    async function handleSave() {
        setSaving(true);
        await onSave({ summary, start_date: startDate || null, end_date: endDate || null });
        setSaving(false);
        setEditing(false);
    }

    async function handleSummarize() {
        setSummarizing(true);
        const next = await onSummarize(chunk.raw_text);
        if (typeof next === "string") {
            setSummary(next);
        }
        setSummarizing(false);
        setEditing(true);
    }

    return (
        <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--card)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", alignItems: "center" }}>
                <span style={{ fontWeight: "bold" }}>#{chunk.position}</span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button className="btn btn-ghost btn-icon" onClick={() => setEditing((v) => !v)}>
                        {editing ? <X size={14} /> : <Edit3 size={14} />}
                    </button>
                    <button className="btn btn-ghost btn-icon" onClick={onDelete}>
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
                <span className="text-muted">
                    {chunk.start_date || chunk.end_date ? `${chunk.start_date || "?"} → ${chunk.end_date || "?"}` : "No date range"}
                </span>
                {chunk.summary && !editing && <span className="text-muted text-small">Summary present</span>}
            </div>
            <p style={{ whiteSpace: "pre-wrap", marginBottom: "0.5rem", fontSize: "0.95rem" }}>
                {chunk.raw_text.length > 300 ? chunk.raw_text.slice(0, 300) + "..." : chunk.raw_text}
            </p>
            {!editing && chunk.summary && (
                <div style={{ padding: "0.5rem", background: "var(--muted)", borderRadius: "var(--radius)", fontSize: "0.85rem" }}>
                    <strong>Summary:</strong> {chunk.summary}
                </div>
            )}
            {editing && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
                    <div>
                        <label className="label">Summary</label>
                        <textarea className="textarea" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 200px" }}>
                            <label className="label">Start date (optional)</label>
                            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                        </div>
                        <div style={{ flex: "1 1 200px" }}>
                            <label className="label">End date (optional)</label>
                            <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                            <Save size={14} style={{ marginRight: "0.35rem" }} />
                            {saving ? "Saving..." : "Save"}
                        </button>
                        <button className="btn btn-ghost text-small" onClick={handleSummarize} disabled={summarizing}>
                            <Sparkles size={14} style={{ marginRight: "0.35rem" }} />
                            {summarizing ? "Summarizing..." : "Gemini summarize"}
                        </button>
                        <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}
