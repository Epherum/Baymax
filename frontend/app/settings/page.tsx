"use client";

import { useRef, useState } from "react";

export default function SettingsPage() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handleBackup() {
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            const res = await fetch("/api/settings/backup");
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.message || "Backup failed");
            }
            const blob = await res.blob();
            const disposition = res.headers.get("content-disposition");
            const filenameMatch = disposition?.match(/filename=\"?([^\";]+)\"?/i);
            const filename = filenameMatch?.[1] || "baymax-backup.sqlite";
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            setMessage(`Backup downloaded (${filename}).`);
        } catch (err: any) {
            setError(err?.message || "Backup failed.");
        } finally {
            setBusy(false);
        }
    }

    async function handleRestore(file: File) {
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            const buffer = await file.arrayBuffer();
            const res = await fetch("/api/settings/restore", {
                method: "POST",
                headers: {
                    "Content-Type": "application/octet-stream",
                },
                body: buffer,
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.message || "Restore failed");
            }
            const data = await res.json();
            const rollbackName = data?.backupCreated ? ` Backup saved as ${data.backupCreated}.` : "";
            setMessage(`Restore successful.${rollbackName}`);
        } catch (err: any) {
            setError(err?.message || "Restore failed.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div>
            <header style={{ marginBottom: "2rem" }}>
                <h1>Settings</h1>
                <p className="text-muted">Manage your data and preferences.</p>
            </header>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <section style={{ padding: "1.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                    <h3 style={{ marginBottom: "0.75rem" }}>Data Management</h3>
                    <p className="text-small text-muted" style={{ marginBottom: "1rem" }}>
                        Backup and restore the SQLite database (includes embeddings, events, pillars, goals, reflections).
                    </p>
                    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                        <button className="btn btn-primary" onClick={handleBackup} disabled={busy}>
                            {busy ? "Working..." : "Backup database"}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".sqlite,.db,application/octet-stream"
                            style={{ display: "none" }}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleRestore(file);
                            }}
                        />
                        <button
                            className="btn btn-ghost"
                            style={{ border: "1px solid var(--border)" }}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={busy}
                        >
                            Restore from file
                        </button>
                        <span className="text-small text-muted">
                            Tip: stop active writes during restore to avoid conflicts.
                        </span>
                    </div>
                    {message && <div className="text-small" style={{ marginTop: "0.75rem", color: "var(--primary)" }}>{message}</div>}
                    {error && <div className="text-small" style={{ marginTop: "0.75rem", color: "var(--destructive)" }}>{error}</div>}
                </section>

                <section style={{ padding: "1.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", opacity: 0.6 }}>
                    <h3 style={{ marginBottom: "1rem" }}>Sync</h3>
                    <p className="text-muted text-small" style={{ marginBottom: "1rem" }}>
                        Sync is disabled for now. Mobile/Supabase sync will arrive later.
                    </p>
                    <button className="btn btn-ghost" style={{ border: "1px solid var(--border)" }} disabled>
                        Force Sync (coming soon)
                    </button>
                </section>
            </div>
        </div>
    );
}
