"use client";

import { useState, useRef, FormEvent, useEffect } from "react";
import { Send, Sparkles, Mic, MicOff, Wand2, User, Hash, Activity, BarChart2, MapPin, AlertCircle, Smile, Zap, RefreshCw } from "lucide-react";
import { useDictation } from "@/components/useDictation";

type Props = {
    onEntrySaved: () => void;
};

export function CaptureForm({ onEntrySaved }: Props) {
    const [text, setText] = useState("");
    const [summary, setSummary] = useState("");
    const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
    const [mood, setMood] = useState<number | undefined>();
    const [energy, setEnergy] = useState<number | undefined>();
    const [importance, setImportance] = useState<number | undefined>();
    const [location, setLocation] = useState("");
    const [tags, setTags] = useState("");
    const [people, setPeople] = useState("");
    const [activities, setActivities] = useState("");
    const [emotions, setEmotions] = useState("");
    const [source, setSource] = useState<"manual" | "sync" | "life_dump">("manual");
    const [metricsInput, setMetricsInput] = useState("");
    const [metricKeys, setMetricKeys] = useState<string[]>([]);
    const [aiMetrics, setAiMetrics] = useState<Record<string, number> | null>(null);
    const [metricSuggestions, setMetricSuggestions] = useState<MetricSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [summarizing, setSummarizing] = useState(false);
    const [fillingMetadata, setFillingMetadata] = useState(false);
    const captureTextRef = useRef<HTMLTextAreaElement>(null);

    const {
        supported: dictationSupported,
        listening: dictationListening,
        interimTranscript: dictationInterim,
        error: dictationError,
        toggle: toggleDictation,
    } = useDictation({ targetRef: captureTextRef, setValue: setText });

    useEffect(() => {
        fetch("/api/metrics/keys")
            .then((res) => res.json())
            .then((data) => setMetricKeys(Array.isArray(data.keys) ? data.keys : []))
            .catch(() => { });
    }, []);

    useEffect(() => {
        if (aiMetrics) {
            const merged = buildMergedMetrics(aiMetrics, metricSuggestions, metricKeys);
            setMetricsInput(objectToMetricString(merged));
        }
    }, [aiMetrics, metricSuggestions, metricKeys]);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!text.trim() || loading) return;

        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    raw_text: text,
                    occurred_at: new Date(occurredAt).toISOString(),
                    source,
                    metadata: {
                        summary: summary || null,
                        mood_score: mood ?? null,
                        energy_level: energy ?? null,
                        importance: importance ?? null,
                        location: location || null,
                        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : null,
                        people: people ? people.split(",").map((p) => p.trim()).filter(Boolean) : null,
                        activities: activities ? activities.split(",").map((a) => a.trim()).filter(Boolean) : null,
                        emotions: emotions ? emotions.split(",").map((e) => e.trim()).filter(Boolean) : null,
                        metrics: aiMetrics ? buildMergedMetrics(aiMetrics, metricSuggestions, metricKeys) : parseMetrics(metricsInput),
                    },
                }),
            });
            if (res.ok) {
                setText("");
                setSummary("");
                setMood(undefined);
                setEnergy(undefined);
                setImportance(undefined);
                setLocation("");
                setTags("");
                setPeople("");
                setActivities("");
                setEmotions("");
                setMetricsInput("");
                setAiMetrics(null);
                setMetricSuggestions([]);
                setOccurredAt(new Date().toISOString().slice(0, 16));
                if (aiMetrics) {
                    const merged = buildMergedMetrics(aiMetrics, metricSuggestions, metricKeys);
                    const newKeys = Object.keys(merged).filter((k) => !metricKeys.includes(k));
                    if (newKeys.length) {
                        setMetricKeys([...metricKeys, ...newKeys]);
                    }
                }
                onEntrySaved();
            } else {
                const data = await res.json();
                setError(data?.message ?? "Failed to save entry");
            }
        } finally {
            setLoading(false);
        }
    }

    async function handleSummarize(textToSummarize: string) {
        setSummarizing(true);
        try {
            const res = await fetch("/api/ai/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: textToSummarize }),
            });
            if (res.ok) {
                const data = await res.json();
                setSummary(data.summary ?? "");
            }
        } finally {
            setSummarizing(false);
        }
    }

    async function handleAutofillMetadata(textToSummarize: string) {
        setFillingMetadata(true);
        setError(null);
        try {
            const res = await fetch("/api/ai/capture-metadata", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: textToSummarize }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.message || "Failed to fill metadata");
            }
            const data = await res.json();
            setSummary(data.summary ?? "");
            setMood(typeof data.mood_score === "number" ? data.mood_score : undefined);
            setEnergy(typeof data.energy_level === "number" ? data.energy_level : undefined);
            setImportance(typeof data.importance === "number" ? data.importance : undefined);
            setLocation(data.location ?? "");
            setTags(Array.isArray(data.tags) ? data.tags.join(", ") : "");
            setPeople(Array.isArray(data.people) ? data.people.join(", ") : "");
            setActivities(Array.isArray(data.activities) ? data.activities.join(", ") : "");
            setEmotions(Array.isArray(data.emotions) ? data.emotions.join(", ") : "");
            if (data.metrics && typeof data.metrics === "object" && !Array.isArray(data.metrics)) {
                const metricsObj: Record<string, number> = {};
                for (const [k, v] of Object.entries(data.metrics)) {
                    const num = Number(v);
                    if (!Number.isNaN(num)) metricsObj[k] = num;
                }
                setAiMetrics(metricsObj);
                setMetricSuggestions(buildMetricSuggestions(metricsObj, metricKeys));
            } else {
                setAiMetrics(null);
                setMetricSuggestions([]);
                setMetricsInput("");
            }
        } catch (err: any) {
            setError(err?.message || "Failed to fill metadata");
        } finally {
            setFillingMetadata(false);
        }
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ position: "relative" }}>
                    <textarea
                        className="textarea"
                        rows={12}
                        placeholder="What's on your mind?"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        style={{ padding: "1rem", fontSize: "1.1rem", resize: "vertical", width: "100%" }}
                        ref={captureTextRef}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                handleSubmit(e);
                            }
                        }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                        <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            onClick={toggleDictation}
                            disabled={!dictationSupported || loading}
                            title={dictationSupported ? (dictationListening ? "Stop dictation" : "Start dictation") : "Dictation not supported"}
                        >
                            {dictationListening ? <MicOff size={16} /> : <Mic size={16} />}
                        </button>
                        <span className="text-small text-muted">
                            {dictationSupported ? (dictationListening ? "Listening... speak to insert at cursor" : "Click mic to dictate") : "Dictation not available"}
                        </span>
                        {dictationInterim && (
                            <span className="text-small" style={{ background: "var(--muted)", padding: "0.25rem 0.5rem", borderRadius: "var(--radius)" }}>
                                {dictationInterim}
                            </span>
                        )}
                        <div style={{ flex: 1 }} />
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => handleAutofillMetadata(text)}
                            disabled={!text.trim() || fillingMetadata}
                            title="Fill summary + metadata"
                            style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
                        >
                            <Wand2 size={16} />
                            {fillingMetadata ? "Analyzing..." : "Auto-Analyze"}
                        </button>
                    </div>
                    {dictationError && (
                        <div className="text-small" style={{ color: "var(--destructive)", marginTop: "0.25rem" }}>
                            {dictationError}
                        </div>
                    )}
                </div>

                {/* Metadata Section - Compact Grid */}
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "1rem",
                    padding: "1.5rem",
                    background: "var(--card)",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)"
                }}>
                    <div style={{ gridColumn: "1/-1" }}>
                        <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Sparkles size={14} /> Summary
                        </label>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <textarea
                                className="textarea"
                                rows={3}
                                style={{ flex: 1, fontSize: "0.95rem" }}
                                value={summary}
                                onChange={(e) => setSummary(e.target.value)}
                                placeholder="Short gist of the entry..."
                            />
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon"
                                onClick={() => handleSummarize(text)}
                                disabled={!text.trim() || summarizing}
                                title="Regenerate summary only"
                                style={{ alignSelf: "flex-start" }}
                            >
                                <RefreshCw size={14} />
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Smile size={14} /> Mood (-5 to 5)
                        </label>
                        <input
                            className="input"
                            type="number"
                            min={-5}
                            max={5}
                            step={0.5}
                            value={mood ?? ""}
                            onChange={(e) => setMood(e.target.value ? Number(e.target.value) : undefined)}
                        />
                    </div>

                    <div>
                        <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Zap size={14} /> Energy (0-10)
                        </label>
                        <input
                            className="input"
                            type="number"
                            min={0}
                            max={10}
                            step={0.5}
                            value={energy ?? ""}
                            onChange={(e) => setEnergy(e.target.value ? Number(e.target.value) : undefined)}
                        />
                    </div>

                    <div>
                        <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <AlertCircle size={14} /> Importance (1-5)
                        </label>
                        <input
                            className="input"
                            type="number"
                            min={1}
                            max={5}
                            value={importance ?? ""}
                            onChange={(e) => setImportance(e.target.value ? Number(e.target.value) : undefined)}
                        />
                    </div>

                    <div>
                        <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <MapPin size={14} /> Location
                        </label>
                        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Home, Gym..." />
                    </div>

                    <div>
                        <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Hash size={14} /> Tags
                        </label>
                        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="sleep, stress..." />
                    </div>

                    <div>
                        <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <User size={14} /> People
                        </label>
                        <input className="input" value={people} onChange={(e) => setPeople(e.target.value)} placeholder="Alex, Mom..." />
                    </div>

                    <div>
                        <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Activity size={14} /> Activities
                        </label>
                        <input className="input" value={activities} onChange={(e) => setActivities(e.target.value)} placeholder="running, coding..." />
                    </div>

                    <div>
                        <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <Smile size={14} /> Emotions
                        </label>
                        <input className="input" value={emotions} onChange={(e) => setEmotions(e.target.value)} placeholder="happy, anxious..." />
                    </div>

                    <div style={{ gridColumn: "1/-1" }}>
                        <label className="label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <BarChart2 size={14} /> Metrics (key=value)
                        </label>
                        <input
                            className="input"
                            value={metricsInput}
                            onChange={(e) => { setMetricsInput(e.target.value); setAiMetrics(null); setMetricSuggestions([]); }}
                            placeholder="water_liters=2, hours_worked=5"
                        />
                        {metricSuggestions.length > 0 && (
                            <div className="text-small" style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                                <strong>New metric suggestions</strong>
                                {metricSuggestions.map((s) => (
                                    <div key={s.original} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                                        <span>{s.original} = {s.value}</span>
                                        {s.closest && <span className="text-muted">Closest: {s.closest}</span>}
                                        <select
                                            className="input"
                                            style={{ maxWidth: "240px" }}
                                            value={s.chosenKey}
                                            onChange={(e) => setMetricSuggestions((prev) => prev.map((m) => m.original === s.original ? { ...m, chosenKey: e.target.value } : m))}
                                        >
                                            <option value={normalizeMetricKey(s.original)}>Keep as new ({normalizeMetricKey(s.original)})</option>
                                            {metricKeys.map((k) => (
                                                <option key={k} value={k}>Merge into {k}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ gridColumn: "1/-1", display: "flex", gap: "1rem" }}>
                        <div style={{ flex: 1 }}>
                            <label className="label">Occurred at</label>
                            <input
                                className="input"
                                type="datetime-local"
                                value={occurredAt}
                                onChange={(e) => setOccurredAt(e.target.value)}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label className="label">Source</label>
                            <select className="input" value={source} onChange={(e) => setSource(e.target.value as any)}>
                                <option value="manual">Manual</option>
                                <option value="sync">Sync</option>
                                <option value="life_dump">Life dump</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="text-muted text-small">
                        {fillingMetadata ? "Analyzing..." : "Cmd+Enter to save"}
                    </span>
                    <button type="submit" className="btn btn-primary" disabled={loading || !text.trim()} style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}>
                        <Send size={18} style={{ marginRight: "0.5rem" }} />
                        {loading ? "Saving..." : "Log Entry"}
                    </button>
                </div>
                {error && <div className="text-small" style={{ color: "var(--destructive)", marginTop: "0.5rem" }}>{error}</div>}
            </form>
        </div>
    );
}

function parseMetrics(input: string) {
    if (!input.trim()) return null;
    const parts = input.split(",").map((p) => p.trim()).filter(Boolean);
    const out: Record<string, number> = {};
    for (const part of parts) {
        const [k, v] = part.split("=");
        if (!k || v === undefined) continue;
        const num = Number(v);
        if (!Number.isNaN(num)) {
            out[k.trim()] = num;
        }
    }
    return Object.keys(out).length ? out : null;
}

type MetricSuggestion = { original: string; value: number; closest: string | null; chosenKey: string };

function normalizeMetricKey(key: string) {
    return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || key.trim();
}

function levenshtein(a: string, b: string) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
}

function findClosestKey(key: string, existing: string[]) {
    if (!existing.length) return null;
    let best: { k: string; d: number } | null = null;
    for (const ex of existing) {
        const d = levenshtein(normalizeMetricKey(key), normalizeMetricKey(ex));
        if (!best || d < best.d) {
            best = { k: ex, d };
        }
    }
    return best ? best.k : null;
}

function buildMetricSuggestions(metrics: Record<string, number>, existing: string[]): MetricSuggestion[] {
    const suggestions: MetricSuggestion[] = [];
    for (const [key, value] of Object.entries(metrics)) {
        const normalized = normalizeMetricKey(key);
        const match = existing.find((k) => normalizeMetricKey(k) === normalized);
        if (match) continue;
        const closest = findClosestKey(key, existing);
        suggestions.push({
            original: key,
            value,
            closest,
            chosenKey: closest ?? normalized
        });
    }
    return suggestions;
}

function buildMergedMetrics(aiMetrics: Record<string, number>, suggestions: MetricSuggestion[], existing: string[]) {
    const suggestionMap = new Map(suggestions.map((s) => [s.original, s.chosenKey]));
    const merged: Record<string, number> = {};
    for (const [key, value] of Object.entries(aiMetrics)) {
        const normalized = normalizeMetricKey(key);
        const existingMatch = existing.find((k) => normalizeMetricKey(k) === normalized);
        const chosen = suggestionMap.get(key) || existingMatch || normalized || key;
        merged[chosen] = value;
    }
    return merged;
}

function objectToMetricString(obj: Record<string, number>) {
    return Object.entries(obj)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
}
