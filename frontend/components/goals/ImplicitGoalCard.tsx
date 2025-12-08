"use client";

import { Check, X } from "lucide-react";
import { Goal } from "@/types";

type Props = {
    goal: Goal;
    onUpdate: (id: number, data: Partial<Goal>) => void;
};

export function ImplicitGoalCard({ goal, onUpdate }: Props) {
    return (
        <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--card)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
                <h4 style={{ marginBottom: "0.25rem" }}>{goal.title}</h4>
                {goal.description && <p className="text-muted text-small">{goal.description}</p>}
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => onUpdate(goal.id, { status: "archived", rejected_at: new Date().toISOString() })}>
                    <X size={14} /> Dismiss
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => onUpdate(goal.id, { status: "active", approved_at: new Date().toISOString(), is_explicit: 0 })}>
                    <Check size={14} /> Accept
                </button>
            </div>
        </div>
    );
}
