"use client";

import { useEffect, useState } from "react";
import { CaptureForm } from "@/components/capture/CaptureForm";
import { RecentEntries } from "@/components/capture/RecentEntries";
import { Modal } from "@/components/ui/Modal";

export default function CapturePage() {
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [showCaptureModal, setShowCaptureModal] = useState(false);
    const [stats, setStats] = useState<{ total: number; last_30_days: number; unique_metrics: number } | null>(null);
    const [statsError, setStatsError] = useState<string | null>(null);

    async function loadStats() {
        setStatsError(null);
        try {
            const res = await fetch("/api/events/stats");
            if (!res.ok) throw new Error("Failed to load stats");
            const data = await res.json();
            setStats(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load stats";
            setStatsError(message);
        }
    }

    useEffect(() => {
        loadStats();
    }, []);

    return (
        <div style={{ maxWidth: "1100px", margin: "0 auto", paddingBottom: "4rem" }}>
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
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                            <span className="tag-filter" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>Journal</span>
                            <span className="text-small text-muted">Daily captures for reflection and metrics</span>
                        </div>
                        <div>
                            <h1 style={{ margin: 0 }}>Capture</h1>
                            <p className="text-muted" style={{ marginTop: "0.25rem" }}>Log your thoughts, feelings, and events.</p>
                        </div>
                        {statsError && <div className="text-small" style={{ color: "var(--destructive)" }}>{statsError}</div>}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: "0.75rem", minWidth: "280px" }}>
                        <div style={{ padding: "0.85rem", borderRadius: "0.9rem", background: "var(--muted)", border: "1px solid var(--border)" }}>
                            <div className="text-small text-muted">Logged</div>
                            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats?.total ?? "…"}</div>
                        </div>
                        <div style={{ padding: "0.85rem", borderRadius: "0.9rem", background: "var(--muted)", border: "1px solid var(--border)" }}>
                            <div className="text-small text-muted">Last 30 days</div>
                            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats?.last_30_days ?? "…"}</div>
                        </div>
                        <div style={{ padding: "0.85rem", borderRadius: "0.9rem", background: "var(--muted)", border: "1px solid var(--border)" }}>
                            <div className="text-small text-muted">Unique metrics</div>
                            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stats?.unique_metrics ?? "…"}</div>
                        </div>
                    </div>
                    <button className="btn btn-primary" type="button" onClick={() => setShowCaptureModal(true)}>
                        Add capture
                    </button>
                </div>
            </section>

            <section style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem", background: "var(--card)" }}>
                <RecentEntries refreshTrigger={refreshTrigger} />
            </section>

            <Modal
                open={showCaptureModal}
                onClose={() => setShowCaptureModal(false)}
                title="New capture"
                width="min(1200px, 98vw)"
            >
                <CaptureForm
                    onEntrySaved={() => {
                        setRefreshTrigger((prev) => prev + 1);
                        loadStats();
                        setShowCaptureModal(false);
                    }}
                />
            </Modal>
        </div>
    );
}
