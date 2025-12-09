"use client";

import { useState } from "react";
import { CaptureForm } from "@/components/capture/CaptureForm";
import { RecentEntries } from "@/components/capture/RecentEntries";
import { Modal } from "@/components/ui/Modal";

export default function CapturePage() {
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [showCaptureModal, setShowCaptureModal] = useState(false);

    return (
        <div style={{ maxWidth: "1100px", margin: "0 auto", paddingBottom: "4rem" }}>
            <header style={{ marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                        <h1>Capture</h1>
                        <p className="text-muted" style={{ marginTop: "0.25rem" }}>Log your thoughts, feelings, and events.</p>
                    </div>
                    <button className="btn btn-primary" type="button" onClick={() => setShowCaptureModal(true)}>
                        Add capture
                    </button>
                </div>
            </header>

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
                        setShowCaptureModal(false);
                    }}
                />
            </Modal>
        </div>
    );
}
