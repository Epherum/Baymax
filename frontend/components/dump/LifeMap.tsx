"use client";

import dynamic from "next/dynamic";
import { CheckCircle } from "lucide-react";
import { LifeMapPoint } from "@/types";

const ResponsiveContainer = dynamic(() => import("recharts").then((m) => m.ResponsiveContainer), { ssr: false });
const ScatterChart = dynamic(() => import("recharts").then((m) => m.ScatterChart), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((m) => m.CartesianGrid), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((m) => m.Tooltip), { ssr: false });
const Scatter = dynamic(() => import("recharts").then((m) => m.Scatter), { ssr: false });

type Props = {
    data: LifeMapPoint[];
};

export function LifeMap({ data }: Props) {
    return (
        <section style={{ padding: "1rem", border: "1px dashed var(--border)", borderRadius: "var(--radius)", background: "var(--secondary)" }}>
            <h4 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <CheckCircle size={16} /> Life Map
            </h4>
            <p className="text-muted text-small" style={{ marginTop: "0.25rem" }}>
                Shows entries by position vs. relative length. Hover to view summary context.
            </p>
            <div style={{ height: "260px", marginTop: "0.5rem" }}>
                {data.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" dataKey="x" name="Order" tickFormatter={(v) => `#${v}`} />
                            <YAxis type="number" dataKey="y" name="Length" unit="%" />
                            <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<LifeMapTooltip />} />
                            <Scatter
                                name="Approved chunks"
                                data={data}
                                shape={(props) => renderLifePoint(props)}
                                legendType="circle"
                                onMouseEnter={() => { }}
                            />
                        </ScatterChart>
                    </ResponsiveContainer>
                ) : (
                    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)" }}>
                        Add entries to render the life map.
                    </div>
                )}
            </div>
        </section>
    );
}

function renderLifePoint({ cx, cy, payload }: any) {
    const color = payload.hasEmbedding ? "var(--primary)" : "var(--secondary-foreground)";
    return <circle cx={cx} cy={cy} r={6} fill={color} stroke="var(--border)" />;
}

function LifeMapTooltip({ active, payload }: any) {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload as LifeMapPoint;
    return (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", padding: "0.5rem", borderRadius: "var(--radius)", maxWidth: 260 }}>
            <div className="text-small text-muted">Chunk #{data.x}</div>
            <div className="text-small">Length: {data.y}% of longest</div>
            <div className="text-small">Embedding: {data.hasEmbedding ? "Yes" : "Pending"}</div>
            <p className="text-small" style={{ marginTop: "0.35rem" }}>{data.label}</p>
        </div>
    );
}
