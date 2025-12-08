"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Reflection } from "@/types";
import { formatFriendlyDate } from "@/lib/date";

type Props = {
    reflections: Reflection[];
    onSelect: (reflection: Reflection) => void;
};

export function ReflectionTimeline({ reflections, onSelect }: Props) {
    const { points, ticks } = useMemo(() => {
        if (!Array.isArray(reflections) || reflections.length === 0) return { points: [], ticks: [] };
        const sorted = [...reflections].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const dateKeys = Array.from(
            new Set(sorted.map((r) => new Date(r.created_at).toISOString().slice(0, 10)))
        );
        const len = dateKeys.length;
        const perDayBuckets: Record<string, number> = {};
        const points = sorted.map((ref) => {
            const dateKey = new Date(ref.created_at).toISOString().slice(0, 10);
            const xNorm = len === 1 ? 0.5 : dateKeys.indexOf(dateKey) / (len - 1);
            const stackIndex = perDayBuckets[dateKey] ?? 0;
            perDayBuckets[dateKey] = stackIndex + 1;
            const offset = stackIndex * 18;
            return {
                ref,
                left: `${Math.round(xNorm * 100)}%`,
                offset,
                dateKey
            };
        });

        const tickCount = Math.min(6, len);
        const step = len > 1 ? Math.max(1, Math.floor(len / tickCount)) : 1;
        const ticks = dateKeys
            .filter((_, idx) => idx % step === 0 || idx === len - 1)
            .map((dateKey, idx, arr) => {
                const xIndex = dateKeys.indexOf(dateKey);
                return {
                    label: dateKey,
                    left: len === 1 ? "50%" : `${Math.round((xIndex / (len - 1)) * 100)}%`,
                    highlight: idx === arr.length - 1
                };
            });

        return { points, ticks };
    }, [reflections]);

    if (!points.length) {
        return <p className="text-muted">No reflections yet.</p>;
    }

    return (
        <div style={{ position: "relative", padding: "1.5rem 1rem 1rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--card)" }}>
            <div style={{ position: "relative", height: "160px", paddingLeft: "2rem" }}>
                {/* Y axis */}
                <div style={{ position: "absolute", left: "2rem", top: 0, bottom: 24, width: "1px", background: "var(--border)" }} />
                <div style={{ position: "absolute", left: "0.25rem", top: 0, fontSize: "0.75rem", color: "var(--muted-foreground)" }}>Stack</div>

                {/* X axis */}
                <div style={{ position: "absolute", left: "2rem", right: 0, bottom: 24, height: "1px", background: "var(--border)" }} />

                {/* Timeline nodes */}
                <div style={{ position: "absolute", left: "2rem", right: 0, top: 24, bottom: 40 }}>
                    {points.map(({ ref, left, offset, dateKey }, idx) => (
                        <motion.button
                            key={`${ref.id}-${idx}`}
                            type="button"
                            onClick={() => onSelect(ref)}
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            whileHover={{ scale: 1.03 }}
                            transition={{ duration: 0.15 }}
                            style={{
                                position: "absolute",
                                left,
                                bottom: 16 + offset,
                                transform: "translateX(-50%)",
                                padding: "0.55rem 0.8rem",
                                borderRadius: "0.75rem",
                                border: "1px solid var(--border)",
                                background: "var(--muted)",
                                cursor: "pointer",
                                boxShadow: "0 8px 16px rgba(15,23,42,0.08)",
                                minWidth: "140px",
                                textAlign: "left",
                            }}
                            title={`${ref.period} reflection on ${new Date(ref.created_at).toLocaleString()}`}
                        >
                            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{ref.period}</div>
                            <div className="text-small text-muted">{formatFriendlyDate(ref.range_start)} → {formatFriendlyDate(ref.range_end)}</div>
                            <div className="text-small text-muted" style={{ marginTop: "0.2rem" }}>{formatFriendlyDate(dateKey)}</div>
                        </motion.button>
                    ))}
                </div>

                {/* X axis ticks */}
                <div style={{ position: "absolute", left: "2rem", right: 0, bottom: 12 }}>
                    {ticks.map((tick) => (
                        <div key={tick.label} style={{ position: "absolute", left: tick.left, transform: "translateX(-50%)", textAlign: "center" }}>
                            <div style={{ width: "1px", height: tick.highlight ? "12px" : "8px", background: "var(--border)", margin: "0 auto" }} />
                            <div className="text-small text-muted" style={{ marginTop: "0.25rem", whiteSpace: "nowrap", fontWeight: tick.highlight ? 600 : 400 }}>
                                {formatFriendlyDate(tick.label)}
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{ position: "absolute", right: 0, bottom: 0, fontSize: "0.75rem", color: "var(--muted-foreground)" }}>Date</div>
            </div>
        </div>
    );
}
