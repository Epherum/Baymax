"use client";

import { useState, FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { Reflection } from "@/types";

type Props = {
    onCreate: (data: Partial<Reflection>) => Promise<void>;
    onGenerate: (data: any) => Promise<any>;
    generating?: boolean;
    saving?: boolean;
};

export function ReflectionForm({ onCreate, onGenerate, generating, saving }: Props) {
    const [period, setPeriod] = useState<Reflection["period"]>("weekly");
    const [rangeStart, setRangeStart] = useState("");
    const [rangeEnd, setRangeEnd] = useState("");
    const [summary, setSummary] = useState("");
    const [insights, setInsights] = useState("");
    const [depth, setDepth] = useState("standard");
    const [category, setCategory] = useState("general");
    const [error, setError] = useState<string | null>(null);

    function setPreset(days: number) {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - (days - 1));
        setRangeStart(start.toISOString().slice(0, 10));
        setRangeEnd(end.toISOString().slice(0, 10));
        setError(null);
    }

    async function handleCreate(e: FormEvent) {
        e.preventDefault();
        if (!rangeStart || !rangeEnd) {
            setError("Start and end dates are required");
            return;
        }
        if (rangeStart > rangeEnd) {
            setError("Start date must be before end date");
            return;
        }
        setError(null);
        await onCreate({
            period,
            range_start: rangeStart,
            range_end: rangeEnd,
            depth: "standard",
            summary: summary || null,
            insights: insights || null,
        });
        setSummary("");
        setInsights("");
    }

    async function handleGenerate() {
        if (!rangeStart || !rangeEnd) {
            setError("Start and end dates are required");
            return;
        }
        if (rangeStart > rangeEnd) {
            setError("Start date must be before end date");
            return;
        }
        setError(null);
        const data = await onGenerate({
            period,
            range_start: rangeStart,
            range_end: rangeEnd,
            depth,
            category,
        });
        if (data) {
            setSummary(data.reflection?.summary ?? "");
            setInsights(data.reflection?.insights ?? "");
        }
    }

    return (
        <section style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Create reflection</h2>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPreset(1)}>Today</button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPreset(7)}>Last 7 days</button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPreset(30)}>Last 30 days</button>
            </div>
            <form onSubmit={handleCreate} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
                <div>
                    <label className="label">Period</label>
                    <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as Reflection["period"])}>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="manual">Manual</option>
                    </select>
                </div>
                <div>
                    <label className="label">Depth</label>
                    <select className="input" value={depth} onChange={(e) => setDepth(e.target.value)}>
                        <option value="standard">Standard</option>
                        <option value="deep">Deep</option>
                    </select>
                </div>
                <div>
                    <label className="label">Category focus</label>
                    <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                        <option value="general">General</option>
                        <option value="relationships">Relationships</option>
                        <option value="work">Work</option>
                        <option value="health">Health</option>
                    </select>
                </div>
                <div>
                    <label className="label">Range start</label>
                    <input className="input" type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} required />
                </div>
                <div>
                    <label className="label">Range end</label>
                    <input className="input" type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} required />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                    <label className="label">Summary</label>
                    <textarea className="textarea" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="High-level summary (optional)" />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                    <label className="label">Insights (neutral wording)</label>
                    <textarea className="textarea" rows={2} value={insights} onChange={(e) => setInsights(e.target.value)} placeholder="Neutral reflections, evidence-backed" />
                </div>
                <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button className="btn btn-ghost" type="button" onClick={handleGenerate} disabled={generating || !rangeStart || !rangeEnd}>
                            <Sparkles size={14} style={{ marginRight: "0.35rem" }} />
                            {generating ? "Generating..." : "Auto-generate (Gemini)"}
                        </button>
                        <button className="btn btn-primary" type="submit" disabled={saving}>Save reflection</button>
                    </div>
                </div>
            </form>
            {error && <div className="text-small" style={{ color: "var(--destructive)", marginTop: "0.25rem" }}>{error}</div>}
        </section>
    );
}
