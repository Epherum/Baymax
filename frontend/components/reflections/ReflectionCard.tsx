"use client";

import dynamic from "next/dynamic";
import { CalendarRange } from "lucide-react";
import { Reflection, ReflectionEvent, ReflectionInsight } from "@/types";
import { formatFriendlyDate } from "@/lib/date";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const LineChart = dynamic(() => import("recharts").then((m) => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then((m) => m.Line), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });

type Props = {
    reflection: Reflection;
    evidence: ReflectionEvent[];
    onOpenInsight: (reflection: Reflection, insight: ReflectionInsight) => void;
    onOpenReflection: (reflection: Reflection) => void;
};

export function ReflectionCard({ reflection, evidence, onOpenInsight, onOpenReflection }: Props) {
    return (
        <div style={{ padding: "1.1rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--card)", display: "flex", flexDirection: "column", gap: "0.65rem", minHeight: "420px", maxHeight: "420px", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <CalendarRange size={16} />
                    <div>
                        <strong style={{ display: "block" }}>{reflection.period}</strong>
                        <span className="text-small text-muted">{formatFriendlyDate(reflection.range_start)} → {formatFriendlyDate(reflection.range_end)}</span>
                    </div>
                </div>
                <div>
                    <span className="text-small text-muted">{formatFriendlyDate(reflection.created_at)}</span>
                </div>
            </div>

            {(Number.isFinite(reflection.mood_curve?.average) || Number.isFinite(reflection.energy_curve?.average)) && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {Number.isFinite(reflection.mood_curve?.average) && (
                        <span className="tag-filter" style={{ border: "1px solid var(--border)" }}>
                            Mood avg: {reflection.mood_curve?.average}
                        </span>
                    )}
                    {Number.isFinite(reflection.energy_curve?.average) && (
                        <span className="tag-filter" style={{ border: "1px solid var(--border)" }}>
                            Energy avg: {reflection.energy_curve?.average}
                        </span>
                    )}
                </div>
            )}

            {reflection.summary && <p style={{ lineHeight: "1.5", fontWeight: 500 }}>{reflection.summary}</p>}

            <button
                className="btn"
                type="button"
                onClick={() => onOpenReflection(reflection)}
                style={{
                    width: "100%",
                    justifyContent: "center",
                    background: "#0f172a",
                    color: "#fff",
                    padding: "0.75rem",
                    borderRadius: "var(--radius)",
                    fontWeight: 600,
                    letterSpacing: "0.01em"
                }}
            >
                Open reflection
            </button>
        </div>
    );
}
