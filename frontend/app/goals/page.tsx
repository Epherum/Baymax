"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, CheckCircle2, Circle } from "lucide-react";
import { Goal } from "@/types";
import { GoalCard } from "@/components/goals/GoalCard";
import { ImplicitGoalCard } from "@/components/goals/ImplicitGoalCard";
import { GoalForm } from "@/components/goals/GoalForm";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    refreshGoals();
  }, []);

  async function refreshGoals() {
    const res = await fetch("/api/goals");
    if (res.ok) {
      const data = await res.json();
      setGoals(data.goals ?? []);
    }
  }

  async function handleCreate(title: string, description: string, isExplicit: boolean) {
    setLoading(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          is_explicit: isExplicit ? 1 : 0,
          status: isExplicit ? "active" : "suggested",
        }),
      });
      if (res.ok) {
        setFormOpen(false);
        refreshGoals();
      }
    } finally {
      setLoading(false);
    }
  }

  async function updateGoal(id: number, data: Partial<Goal>) {
    await fetch(`/api/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    refreshGoals();
  }

  const explicitGoals = useMemo(() => goals.filter((g) => g.is_explicit === 1), [goals]);
  const implicitSuggestions = useMemo(() => goals.filter((g) => g.is_explicit === 0 || g.status === "suggested"), [goals]);

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>Goals</h1>
          <p className="text-muted">Track explicit commitments and implicit patterns.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen((v) => !v)}>
          <Plus size={16} style={{ marginRight: "0.5rem" }} />
          {formOpen ? "Close" : "New Goal"}
        </button>
      </header>

      {formOpen && (
        <GoalForm onCreate={handleCreate} loading={loading} />
      )}

      <section style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <CheckCircle2 size={18} />
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Explicit Goals</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
          {explicitGoals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onUpdate={updateGoal} />
          ))}
          {explicitGoals.length === 0 && <p className="text-muted">No explicit goals yet.</p>}
        </div>
      </section>

      <section>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <Circle size={18} />
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Implicit Suggestions</h2>
        </div>
        <p className="text-muted text-small" style={{ marginBottom: "0.75rem" }}>
          Suggested by the pattern engine (to be powered by Gemini 2.5 Flash). Approve to track, dismiss to archive.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {implicitSuggestions.map((goal) => (
            <ImplicitGoalCard key={goal.id} goal={goal} onUpdate={updateGoal} />
          ))}
          {implicitSuggestions.length === 0 && <p className="text-muted">No implicit suggestions right now.</p>}
        </div>
      </section>
    </div>
  );
}
