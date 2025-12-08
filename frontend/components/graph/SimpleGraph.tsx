"use client";

import { useEffect, useMemo, useState } from "react";
import { formatFriendlyDate } from "@/lib/date";

type GraphNode = {
  id: string;
  type: string;
  label: string;
  degree: number;
};

type GraphEdge = {
  id: number;
  source: { type: string; id: string };
  target: { type: string; id: string };
  edge_type: string;
  occurred_at?: string;
  metadata?: Record<string, any> | null;
};

type GraphResponse = {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  has_more?: boolean;
};

type Props = {
  entityType?: string;
  entityId?: string;
  limit?: number;
  title?: string;
  allowDrillIn?: boolean;
};

export function SimpleGraph({ entityType, entityId, limit = 150, title, allowDrillIn = true }: Props) {
  const [data, setData] = useState<GraphResponse>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [edgeFilter, setEdgeFilter] = useState("");
  const [limitState, setLimitState] = useState(limit);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [focusEntityType, setFocusEntityType] = useState<string | undefined>(entityType);
  const [focusEntityId, setFocusEntityId] = useState<string | undefined>(entityId);

  useEffect(() => {
    setLimitState(limit);
    setOffset(0);
  }, [limit]);

  useEffect(() => {
    setFocusEntityType(entityType);
    setFocusEntityId(entityId);
    setOffset(0);
  }, [entityType, entityId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (focusEntityType && focusEntityId) {
          params.set("entity_type", focusEntityType);
          params.set("entity_id", focusEntityId);
        }
        if (edgeFilter) params.set("edge_type", edgeFilter);
        if (since) params.set("since", since);
        if (until) params.set("until", until);
        params.set("limit", String(limitState));
        params.set("offset", String(offset));
        const res = await fetch(`/api/graph?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load graph");
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setHasMore(Boolean(json.has_more));
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load graph");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [focusEntityType, focusEntityId, edgeFilter, since, until, limitState, offset]);

  const { nodes = [], edges = [] } = data;
  const dedupEdgeTypes = useMemo(() => {
    const set = new Set<string>();
    edges.forEach((e) => set.add(e.edge_type));
    return Array.from(set);
  }, [edges]);

  const layout = useMemo(() => {
    if (!nodes.length) return { positions: new Map<string, { x: number; y: number }>(), size: 360 };
    const size = Math.max(360, Math.min(900, nodes.length * 18));
    const centerNodeKey = focusEntityType && focusEntityId ? `${focusEntityType}:${focusEntityId}` : entityType && entityId ? `${entityType}:${entityId}` : null;
    const positions = new Map<string, { x: number; y: number }>();

    // Initialize positions in a circle
    const center = { x: size / 2, y: size / 2 };
    nodes.forEach((node, idx) => {
      const angle = (idx / Math.max(nodes.length, 1)) * Math.PI * 2;
      const radius = size / 3;
      positions.set(`${node.type}:${node.id}`, {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle)
      });
    });
    if (centerNodeKey && positions.has(centerNodeKey)) {
      positions.set(centerNodeKey, { x: center.x, y: center.y });
    }

    // Simple force layout (repulsion + spring edges)
    const iterations = 120;
    const repulsion = 12000;
    const spring = 0.08;
    const damping = 0.85;

    for (let iter = 0; iter < iterations; iter++) {
      const forces = new Map<string, { x: number; y: number }>();
      nodes.forEach((a) => {
        const aKey = `${a.type}:${a.id}`;
        const aPos = positions.get(aKey)!;
        let fx = 0;
        let fy = 0;
        nodes.forEach((b) => {
          if (a === b) return;
          const bKey = `${b.type}:${b.id}`;
          const bPos = positions.get(bKey)!;
          const dx = aPos.x - bPos.x;
          const dy = aPos.y - bPos.y;
          const distSq = Math.max(dx * dx + dy * dy, 0.01);
          const force = repulsion / distSq;
          fx += (dx / Math.sqrt(distSq)) * force;
          fy += (dy / Math.sqrt(distSq)) * force;
        });
        forces.set(aKey, { x: fx, y: fy });
      });

      edges.forEach((e) => {
        const sKey = `${e.source.type}:${e.source.id}`;
        const tKey = `${e.target.type}:${e.target.id}`;
        const sPos = positions.get(sKey);
        const tPos = positions.get(tKey);
        if (!sPos || !tPos) return;
        const dx = tPos.x - sPos.x;
        const dy = tPos.y - sPos.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
        const force = spring * (dist - 120);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const sForce = forces.get(sKey)!;
        const tForce = forces.get(tKey)!;
        sForce.x += fx;
        sForce.y += fy;
        tForce.x -= fx;
        tForce.y -= fy;
      });

      positions.forEach((pos, key) => {
        const f = forces.get(key)!;
        const nx = pos.x + f.x * damping;
        const ny = pos.y + f.y * damping;
        positions.set(key, {
          x: Math.max(30, Math.min(size - 30, nx)),
          y: Math.max(30, Math.min(size - 30, ny))
        });
      });
    }

    return { positions, size };
  }, [nodes, edges, focusEntityType, focusEntityId, entityType, entityId]);

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.75rem", background: "var(--card)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
        <strong>{title || "Graph"}</strong>
        <div className="text-small text-muted">{nodes.length} nodes · {edges.length} edges</div>
        {hasMore && <div className="text-small text-muted">More edges available</div>}
        <div style={{ flexGrow: 1 }} />
        {focusEntityType && focusEntityId && (
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => {
              setFocusEntityType(entityType);
              setFocusEntityId(entityId);
              setOffset(0);
            }}
          >
            Reset focus
          </button>
        )}
        {dedupEdgeTypes.length > 0 && (
          <select className="input" value={edgeFilter} onChange={(e) => setEdgeFilter(e.target.value)} style={{ maxWidth: "180px" }}>
            <option value="">All edges</option>
            {dedupEdgeTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <input
          className="input"
          type="date"
          value={since}
          onChange={(e) => setSince(e.target.value)}
          style={{ maxWidth: "140px" }}
          aria-label="Since"
        />
        <input
          className="input"
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          style={{ maxWidth: "140px" }}
          aria-label="Until"
        />
        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
          <span className="text-small text-muted">Limit</span>
          <input
            className="input"
            type="number"
            value={limitState}
            min={50}
            max={800}
            onChange={(e) => setLimitState(Math.max(50, Math.min(800, Number(e.target.value) || 50)))}
            style={{ width: "90px" }}
          />
          {hasMore && (
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setLimitState((prev) => Math.min(prev + 150, 800))} disabled={loading}>
              Load more
            </button>
          )}
          {offset > 0 && (
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOffset((prev) => Math.max(prev - limitState, 0))} disabled={loading}>
              Prev page
            </button>
          )}
          {hasMore && (
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setOffset((prev) => prev + limitState)} disabled={loading}>
              Next page
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="text-small text-muted">Loading graph…</div>
      ) : error ? (
        <div className="text-small" style={{ color: "var(--destructive)" }}>{error}</div>
      ) : nodes.length === 0 ? (
        <div className="text-small text-muted">No relationships yet.</div>
      ) : (
        <>
          <SvgGraph nodes={nodes} edges={edges} layout={layout} focusKey={entityType && entityId ? `${entityType}:${entityId}` : null} />
          <EdgeList edges={edges} />
        </>
      )}
    </div>
  );
}

function SvgGraph({ nodes, edges, layout, focusKey }: { nodes: GraphNode[]; edges: GraphEdge[]; layout: { positions: Map<string, { x: number; y: number }>; size: number }; focusKey: string | null }) {
  const { positions, size } = layout;
  const colorForType = (type: string) => {
    switch (type) {
      case "person":
        return "var(--primary)";
      case "event":
        return "var(--secondary)";
      case "activity":
        return "#FF9F1C";
      case "tag":
        return "#2EC4B6";
      case "life_dump_import":
        return "#6C63FF";
      case "life_dump_chunk":
        return "#F25F5C";
      case "goal":
        return "#5D9C59";
      case "reflection":
        return "#8D99AE";
      case "metric":
        return "#5C7AEA";
      default:
        return "var(--foreground)";
    }
  };

  return (
    <svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--muted)", marginBottom: "0.75rem" }}>
      {edges.map((edge) => {
        const sourceKey = `${edge.source.type}:${edge.source.id}`;
        const targetKey = `${edge.target.type}:${edge.target.id}`;
        const s = positions.get(sourceKey);
        const t = positions.get(targetKey);
        if (!s || !t) return null;
        const connected = focusKey && (sourceKey === focusKey || targetKey === focusKey);
        return (
          <line
            key={edge.id}
            x1={s.x}
            y1={s.y}
            x2={t.x}
            y2={t.y}
            stroke={connected ? "var(--secondary)" : "var(--border)"}
            strokeWidth={connected ? 1.8 : 1}
            opacity={connected ? 0.95 : 0.5}
          />
        );
      })}
      {nodes.map((node) => {
        const key = `${node.type}:${node.id}`;
        const pos = positions.get(key);
        if (!pos) return null;
        const isFocus = focusKey === key;
        const color = colorForType(node.type);
        return (
          <g
            key={key}
            transform={`translate(${pos.x}, ${pos.y})`}
            onClick={() => {
              if (!allowDrillIn) return;
              setFocusEntityType(node.type);
              setFocusEntityId(node.id);
              setOffset(0);
            }}
            style={{ cursor: allowDrillIn ? "pointer" : "default" }}
          >
            <circle r={isFocus ? 18 : 14} fill={isFocus ? color : "var(--background)"} stroke={color} strokeWidth={1.4} />
            <text x={0} y={4} textAnchor="middle" fontSize="10" fill={isFocus ? "var(--background)" : color}>{node.label.slice(0, 10)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function EdgeList({ edges }: { edges: GraphEdge[] }) {
  if (!edges.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      {edges.slice(0, 12).map((edge) => (
        <div key={edge.id} className="text-small" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.4rem" }}>
          <strong>{edge.edge_type}</strong>{" "}
          <span className="text-muted">
            {edge.source.type}:{edge.source.id} → {edge.target.type}:{edge.target.id}
            {edge.occurred_at ? ` · ${formatFriendlyDate(edge.occurred_at)}` : ""}
          </span>
          {edge.metadata && Object.keys(edge.metadata).length > 0 && (
            <div className="text-muted" style={{ marginTop: "0.15rem" }}>
              {Object.entries(edge.metadata)
                .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                .join(" · ")}
            </div>
          )}
        </div>
      ))}
      {edges.length > 12 && (
        <div className="text-small text-muted">+{edges.length - 12} more edges</div>
      )}
    </div>
  );
}
