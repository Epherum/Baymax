"use client";

import { Archive } from "lucide-react";
import { Goal } from "@/types";

type Props = {
    goal: Goal;
    onUpdate: (id: number, data: Partial<Goal>) => void;
};

export function GoalCard({ goal, onUpdate }: Props) {
    const statusColor = {
        active: "var(--primary)",
        completed: "var(--success, #22c55e)",
        archived: "var(--muted-foreground)",
        suggested: "var(--secondary-foreground)",
    }[goal.status];

    return (
        <div style={{ padding: "1.25rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--card)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>{goal.title}</h3>
                <span className="badge" style={{ background: statusColor }}>{goal.status}</span>
            </div>
            {goal.description && <p className="text-muted text-small" style={{ lineHeight: "1.5" }}>{goal.description}</p>}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {goal.status !== "completed" && (
                    <button className="btn btn-primary btn-sm" onClick={() => onUpdate(goal.id, { status: "completed" })}>
                        Mark Completed
                    </button>
                )}
                {goal.status !== "archived" && (
                    <button className="btn btn-ghost btn-sm" onClick={() => onUpdate(goal.id, { status: "archived" })}>
                        <Archive size={14} /> Archive
                    </button>
                )}
            </div>
            <div className="text-muted text-small">Updated {new Date(goal.updated_at).toLocaleString()}</div>
        </div>
    );
}
