export default function SettingsPage() {
    return (
        <div>
            <header style={{ marginBottom: "2rem" }}>
                <h1>Settings</h1>
                <p className="text-muted">Manage your data and preferences.</p>
            </header>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <section style={{ padding: "1.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                    <h3 style={{ marginBottom: "1rem" }}>Data Management</h3>
                    <div style={{ display: "flex", gap: "1rem" }}>
                        <button className="btn btn-primary">Backup Database</button>
                        <button className="btn btn-ghost" style={{ border: "1px solid var(--border)" }}>Restore Backup</button>
                    </div>
                </section>

                <section style={{ padding: "1.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                    <h3 style={{ marginBottom: "1rem" }}>Sync</h3>
                    <p className="text-muted text-small" style={{ marginBottom: "1rem" }}>Sync with Supabase buffer (Mobile).</p>
                    <button className="btn btn-ghost" style={{ border: "1px solid var(--border)" }}>Force Sync Now</button>
                </section>
            </div>
        </div>
    );
}
