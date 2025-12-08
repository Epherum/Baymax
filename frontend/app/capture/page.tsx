"use client";

import { useState } from "react";
import { CaptureForm } from "@/components/capture/CaptureForm";
import { RecentEntries } from "@/components/capture/RecentEntries";

export default function CapturePage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", paddingBottom: "4rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1>Capture</h1>
        <p className="text-muted">Log your thoughts, feelings, and events.</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 350px", gap: "2rem", alignItems: "start" }}>
        {/* Left Column: Input & Text */}
        <CaptureForm onEntrySaved={() => setRefreshTrigger((prev) => prev + 1)} />

        {/* Right Column: Recent Entries & Search */}
        <RecentEntries refreshTrigger={refreshTrigger} />
      </div>
    </div>
  );
}
