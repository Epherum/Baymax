"use client";

import { useState, FormEvent } from "react";

type Props = {
    onCreate: (title: string, description: string, isExplicit: boolean) => Promise<void>;
    loading?: boolean;
};

export function GoalForm({ onCreate, loading }: Props) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [isExplicit, setIsExplicit] = useState(true);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!title.trim()) return;
        await onCreate(title, description, isExplicit);
        setTitle("");
        setDescription("");
        setIsExplicit(true);
    }

    return (
        <form onSubmit={handleSubmit} style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: "2rem", display: "grid", gap: "0.75rem" }}>
            <div>
                <label className="label">Title</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Maintain 7h sleep" required />
            </div>
            <div>
                <label className="label">Description</label>
                <textarea className="textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why this matters / acceptance criteria" />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input type="checkbox" checked={isExplicit} onChange={(e) => setIsExplicit(e.target.checked)} />
                Explicit goal (uncheck to save as an implicit suggestion)
            </label>
            <button type="submit" className="btn btn-primary" disabled={loading}>
                Create
            </button>
        </form>
    );
}
