"use client";

import { useState, FormEvent } from "react";
import { Plus } from "lucide-react";
import { LifeDumpImport } from "@/types";

type Props = {
    imports: LifeDumpImport[];
    selectedImportId: number | null;
    onSelect: (id: number) => void;
    onCreate: (title: string) => Promise<void>;
    loading?: boolean;
};

export function ImportList({ imports, selectedImportId, onSelect, onCreate, loading }: Props) {
    const [isCreating, setIsCreating] = useState(false);
    const [newTitle, setNewTitle] = useState("");

    async function handleCreate(e: FormEvent) {
        e.preventDefault();
        await onCreate(newTitle);
        setNewTitle("");
        setIsCreating(false);
    }

    return (
        <div style={{ width: "250px", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontSize: "1.1rem" }}>Imports</h2>
                <button className="btn btn-ghost btn-icon" onClick={() => setIsCreating(!isCreating)}>
                    <Plus size={18} />
                </button>
            </div>

            {isCreating && (
                <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <input
                        className="input"
                        placeholder="Title..."
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        autoFocus
                    />
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>Create</button>
                        <button type="button" className="btn btn-ghost" onClick={() => setIsCreating(false)}>Cancel</button>
                    </div>
                </form>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", overflowY: "auto" }}>
                {imports.map((imp) => (
                    <button
                        key={imp.id}
                        onClick={() => onSelect(imp.id)}
                        className={`btn ${selectedImportId === imp.id ? "btn-primary" : "btn-ghost"}`}
                        style={{ justifyContent: "flex-start", textAlign: "left" }}
                    >
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {imp.title || "Untitled Import"}
                            <div style={{ fontSize: "0.7rem", opacity: 0.7 }}>{new Date(imp.created_at).toLocaleDateString()}</div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
