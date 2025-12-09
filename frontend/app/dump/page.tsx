"use client";

import { useState, useEffect, useMemo, FormEvent, useRef } from "react";
import { Mic, MicOff, Sparkles } from "lucide-react";
import { useDictation } from "@/components/useDictation";
import { LifeDumpImport, LifeDumpChunk, LifeMapPoint } from "@/types";
import { ImportList } from "@/components/dump/ImportList";
import { ChunkCard } from "@/components/dump/ChunkCard";
import { LifeMap } from "@/components/dump/LifeMap";

export default function LifeDumpPage() {
    const [imports, setImports] = useState<LifeDumpImport[]>([]);
    const [selectedImportId, setSelectedImportId] = useState<number | null>(null);
    const [chunks, setChunks] = useState<LifeDumpChunk[]>([]);
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [metricCheckLoading, setMetricCheckLoading] = useState(false);
    const [metricCheckResult, setMetricCheckResult] = useState<{ new_keys: any[]; near_duplicates: any[] } | null>(null);
    const [metricCheckError, setMetricCheckError] = useState<string | null>(null);
    const [stats, setStats] = useState<{ total: number } | null>(null);
    const [statsError, setStatsError] = useState<string | null>(null);

    // Chunk State
    const [chunkText, setChunkText] = useState("");
    const [chunkSummary, setChunkSummary] = useState("");
    const [chunkStartDate, setChunkStartDate] = useState("");
    const [chunkEndDate, setChunkEndDate] = useState("");
    const [summarizing, setSummarizing] = useState(false);
    const chunkTextRef = useRef<HTMLTextAreaElement>(null);

    const {
        supported: chunkDictationSupported,
        listening: chunkDictationListening,
        interimTranscript: chunkDictationInterim,
        error: chunkDictationError,
        toggle: toggleChunkDictation,
    } = useDictation({ targetRef: chunkTextRef, setValue: setChunkText });

    useEffect(() => {
        refreshImports();
        loadStats();
    }, []);

    useEffect(() => {
        if (selectedImportId) {
            refreshChunks(selectedImportId);
        } else {
            setChunks([]);
        }
        setMetricCheckResult(null);
        setMetricCheckError(null);
    }, [selectedImportId]);

    const selectedImport = useMemo(
        () => imports.find((imp) => imp.id === selectedImportId),
        [imports, selectedImportId]
    );

    const nextPosition = useMemo(() => {
        if (chunks.length === 0) return 1;
        return Math.max(...chunks.map(c => c.position)) + 1;
    }, [chunks]);

    const lifeMapData = useMemo<LifeMapPoint[]>(() => {
        if (!selectedImport) return [];
        if (!chunks.length) return [];
        const maxLen = Math.max(...chunks.map((c) => c.raw_text.length));
        return chunks.map((c) => ({
            x: c.position,
            y: Math.round((c.raw_text.length / maxLen) * 100),
            label: c.summary || c.raw_text.slice(0, 80),
            hasEmbedding: c.has_embedding === 1
        }));
    }, [chunks, selectedImport]);

    async function refreshImports() {
        const res = await fetch("/api/imports");
        if (res.ok) {
            const data = await res.json();
            setImports(data.imports ?? []);
            if (!selectedImportId && data.imports?.length) {
                setSelectedImportId(data.imports[0].id);
            }
        }
    }

    async function loadStats() {
        setStatsError(null);
        try {
            const res = await fetch("/api/imports/stats");
            if (!res.ok) throw new Error("Failed to load stats");
            const data = await res.json();
            setStats(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load stats";
            setStatsError(message);
        }
    }

    async function refreshChunks(id: number) {
        const res = await fetch(`/api/imports/${id}`);
        if (res.ok) {
            const data = await res.json();
            setChunks(data.chunks ?? []);
            const importRow = data.import as LifeDumpImport | undefined;
            if (importRow) {
                setImports((prev) => prev.map((imp) => (imp.id === importRow.id ? importRow : imp)));
            }
        }
    }

    async function handleCreateImport(title: string) {
        setLoading(true);
        try {
            const res = await fetch("/api/imports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: title || null }),
            });
            if (res.ok) {
                const data = await res.json();
                setImports([data.import, ...imports]);
                setSelectedImportId(data.import.id);
                loadStats();
            }
        } finally {
            setLoading(false);
        }
    }

    async function handleAddChunk(e: FormEvent) {
        e.preventDefault();
        if (!selectedImportId) return;
        if (!chunkText.trim()) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/imports/${selectedImportId}/chunks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    position: nextPosition,
                    raw_text: chunkText,
                    summary: chunkSummary || null,
                    start_date: chunkStartDate || null,
                    end_date: chunkEndDate || null,
                }),
            });
            if (res.ok) {
                refreshChunks(selectedImportId);
                setChunkText("");
                setChunkSummary("");
                setChunkStartDate("");
                setChunkEndDate("");
            }
        } finally {
            setLoading(false);
        }
    }

    async function handleUpdateChunk(
        chunkId: number,
        values: { summary?: string; start_date?: string | null; end_date?: string | null }
    ) {
        if (!selectedImportId) return;
        const res = await fetch(`/api/imports/${selectedImportId}/chunks/${chunkId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
        });
        if (res.ok) {
            refreshChunks(selectedImportId);
        }
    }

    async function handleDeleteChunk(chunkId: number) {
        if (!selectedImportId) return;
        const res = await fetch(`/api/imports/${selectedImportId}/chunks/${chunkId}`, { method: "DELETE" });
        if (res.ok) {
            refreshChunks(selectedImportId);
        }
    }

    async function handleCompleteImport() {
        if (!selectedImportId) return;
        const res = await fetch(`/api/imports/${selectedImportId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "completed" }),
        });
        if (res.ok) {
            refreshImports();
            refreshChunks(selectedImportId);
            setStatusMessage("Import finalized — entries are materialized into events for metrics/people charts.");
        }
    }

    async function handleCheckMetrics() {
        if (!selectedImportId) return;
        setMetricCheckLoading(true);
        setMetricCheckError(null);
        try {
            const res = await fetch(`/api/imports/${selectedImportId}/metric-check`);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.message || "Metric check failed");
            }
            const data = await res.json();
            setMetricCheckResult(data.metrics ?? { new_keys: [], near_duplicates: [] });
        } catch (err: any) {
            setMetricCheckError(err?.message || "Metric check failed");
            setMetricCheckResult(null);
        } finally {
            setMetricCheckLoading(false);
        }
    }

    async function handleSummarize(text: string) {
        setSummarizing(true);
        try {
            const res = await fetch("/api/ai/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });
            if (res.ok) {
                const data = await res.json();
                setChunkSummary(data.summary ?? "");
                return data.summary ?? "";
            }
            return "";
        } finally {
            setSummarizing(false);
        }
    }

    return (
        <div style={{ display: "flex", height: "calc(100vh - 4rem)", gap: "2rem" }}>
            <ImportList
                imports={imports}
                selectedImportId={selectedImportId}
                onSelect={setSelectedImportId}
                onCreate={handleCreateImport}
                loading={loading}
            />

            {/* Main Content: Chunks */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2rem", overflowY: "auto", paddingRight: "1rem" }}>
                <section
                    style={{
                        border: "1px solid var(--border)",
                        borderRadius: "1.1rem",
                        padding: "1rem",
                        background: "var(--card)",
                        boxShadow: "0 12px 26px rgba(15,23,42,0.06)"
                    }}
                >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                                <span className="tag-filter" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>Life dump</span>
                                <span className="text-small text-muted">Long-form imports and chunks</span>
                            </div>
                            <div>
                                <h2 style={{ margin: 0 }}>Life Dump</h2>
                                <p className="text-muted text-small" style={{ marginTop: "0.2rem" }}>
                                    Import transcripts or long notes, then split and summarize.
                                </p>
                            </div>
                            {statsError && <div className="text-small" style={{ color: "var(--destructive)" }}>{statsError}</div>}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(1, minmax(140px, 1fr))", gap: "0.75rem", minWidth: "160px" }}>
                            <div style={{ padding: "0.85rem", borderRadius: "0.9rem", background: "var(--muted)", border: "1px solid var(--border)" }}>
                                <div className="text-small text-muted">Logged</div>
                                <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats?.total ?? "…"}</div>
                            </div>
                        </div>
                    </div>
                </section>

                {selectedImport ? (
                    <>
                        <header>
                            <h1>{selectedImport.title || "Untitled Import"}</h1>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                                <p className="text-muted">Status: {selectedImport.status}</p>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleCheckMetrics}
                                    disabled={metricCheckLoading}
                                    type="button"
                                >
                                    {metricCheckLoading ? "Checking metrics..." : "Check metrics for duplicates"}
                                </button>
                                {selectedImport.status !== "completed" && (
                                    <button className="btn btn-primary btn-sm" onClick={handleCompleteImport}>
                                        Finalize Import
                                    </button>
                                )}
                            </div>
                            <p className="text-muted text-small" style={{ marginTop: "0.5rem" }}>
                                On finalize, each entry is turned into a life-dump event with AI metadata (people/metrics) and embeddings.
                            </p>
                            <p className="text-muted text-small" style={{ marginTop: "0.25rem" }}>
                                Set start/end to anchor the time span; finalizing pushes everything into metrics/person charts.
                            </p>
                            {metricCheckError && (
                                <div className="text-small" style={{ color: "var(--destructive)", marginTop: "0.35rem" }}>
                                    {metricCheckError}
                                </div>
                            )}
                            {metricCheckResult && (
                                <div className="text-small" style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                    <strong>Metric check</strong>
                                    {metricCheckResult.near_duplicates.length > 0 && (
                                        <div>
                                            <div>Near-duplicates (consider merging):</div>
                                            <ul style={{ margin: "0.25rem 0 0 1rem", padding: 0 }}>
                                                {metricCheckResult.near_duplicates.map((m) => (
                                                    <li key={`${m.chunk_id}:${m.normalized}`} style={{ listStyle: "disc" }}>
                                                        Chunk #{m.position}: "{m.key}" → closest "{m.closest}" (distance {m.distance})
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {metricCheckResult.new_keys.length > 0 && (
                                        <div>
                                            <div>New metrics (no close match):</div>
                                            <ul style={{ margin: "0.25rem 0 0 1rem", padding: 0 }}>
                                                {metricCheckResult.new_keys.map((m) => (
                                                    <li key={`${m.chunk_id}:${m.normalized}`} style={{ listStyle: "disc" }}>
                                                        Chunk #{m.position}: "{m.key}" (will save as "{m.normalized}")
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {metricCheckResult.near_duplicates.length === 0 && metricCheckResult.new_keys.length === 0 && (
                                        <div>No new metrics detected.</div>
                                    )}
                                </div>
                            )}
                            {statusMessage && <div className="text-small" style={{ color: "var(--foreground)", marginTop: "0.5rem" }}>{statusMessage}</div>}
                        </header>

                        {/* Add Chunk Form */}
                        <section style={{ padding: "1.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--card)" }}>
                            <h3 style={{ marginBottom: "1rem" }}>Add Chunk #{nextPosition}</h3>
                            <form onSubmit={handleAddChunk} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                                <div>
                                    <label className="label">Raw Text</label>
                                    <textarea
                                        className="textarea"
                                        rows={6}
                                        placeholder="Paste text here..."
                                        value={chunkText}
                                        onChange={(e) => setChunkText(e.target.value)}
                                        required
                                        disabled={selectedImport?.status === "completed"}
                                        ref={chunkTextRef}
                                    />
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-icon"
                                            onClick={toggleChunkDictation}
                                            disabled={!chunkDictationSupported || selectedImport?.status === "completed"}
                                            title={chunkDictationSupported ? (chunkDictationListening ? "Stop dictation" : "Start dictation") : "Dictation not supported"}
                                        >
                                            {chunkDictationListening ? <MicOff size={16} /> : <Mic size={16} />}
                                        </button>
                                        <span className="text-small text-muted">
                                            {chunkDictationSupported ? (chunkDictationListening ? "Listening... speak to insert at cursor" : "Click mic to dictate") : "Dictation not available in this browser"}
                                        </span>
                                        {chunkDictationInterim && (
                                            <span className="text-small" style={{ background: "var(--muted)", padding: "0.25rem 0.5rem", borderRadius: "var(--radius)" }}>
                                                {chunkDictationInterim}
                                            </span>
                                        )}
                                    </div>
                                    {chunkDictationError && (
                                        <div className="text-small" style={{ color: "var(--destructive)", marginTop: "0.25rem" }}>
                                            {chunkDictationError}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="label">Summary (Optional)</label>
                                    <textarea
                                        className="textarea"
                                        rows={2}
                                        placeholder="Brief summary..."
                                        value={chunkSummary}
                                        onChange={(e) => setChunkSummary(e.target.value)}
                                        disabled={selectedImport?.status === "completed"}
                                    />
                                </div>
                                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                                    <div style={{ flex: "1 1 200px" }}>
                                        <label className="label">Start date (optional)</label>
                                        <input
                                            type="date"
                                            className="input"
                                            value={chunkStartDate}
                                            onChange={(e) => setChunkStartDate(e.target.value)}
                                            disabled={selectedImport?.status === "completed"}
                                        />
                                    </div>
                                    <div style={{ flex: "1 1 200px" }}>
                                        <label className="label">End date (optional)</label>
                                        <input
                                            type="date"
                                            className="input"
                                            value={chunkEndDate}
                                            onChange={(e) => setChunkEndDate(e.target.value)}
                                            disabled={selectedImport?.status === "completed"}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                                    <button type="submit" className="btn btn-primary" disabled={loading || !chunkText || selectedImport?.status === "completed"}>
                                        Add Chunk
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-ghost text-small"
                                        disabled={!chunkText.trim() || summarizing || selectedImport?.status === "completed"}
                                        onClick={() => handleSummarize(chunkText)}
                                    >
                                        <Sparkles size={14} style={{ marginRight: "0.35rem" }} />
                                        {summarizing ? "Summarizing..." : "AI Summarize (Gemini)"}
                                    </button>
                                </div>
                            </form>
                        </section>

                        {/* Chunk List */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            {chunks.map((chunk) => (
                                <ChunkCard
                                    key={chunk.id}
                                    chunk={chunk}
                                    onSave={(values) => handleUpdateChunk(chunk.id, values)}
                                    onDelete={() => handleDeleteChunk(chunk.id)}
                                    onSummarize={(text) => handleSummarize(text)}
                                />
                            ))}
                        </div>

                        <LifeMap data={lifeMapData} />
                    </>
                ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted-foreground)" }}>
                        Select an import to view chunks
                    </div>
                )}
            </div>
        </div>
    );
}
