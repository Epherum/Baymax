export type LifeDumpImport = {
    id: number;
    title: string | null;
    status: string;
    created_at: string;
};

export type LifeDumpChunk = {
    id: number;
    position: number;
    raw_text: string;
    summary: string | null;
    start_date: string | null;
    end_date: string | null;
    has_embedding?: number;
    created_at: string;
};

export type LifeMapPoint = {
    x: number;
    y: number;
    label: string;
    hasEmbedding?: boolean;
};

export type Goal = {
    id: number;
    title: string;
    description: string | null;
    is_explicit: number;
    status: "suggested" | "active" | "completed" | "archived";
    approved_at: string | null;
    rejected_at: string | null;
    created_at: string;
    updated_at: string;
};

export type Reflection = {
    id: number;
    period: "daily" | "weekly" | "monthly" | "manual";
    range_start: string;
    range_end: string;
    depth: string;
    summary: string | null;
    mood_curve: { average?: number | null; points?: { date: string; value: number }[] } | null;
    energy_curve: { average?: number | null; points?: { date: string; value: number }[] } | null;
    patterns: ReflectionInsight[] | null;
    insights: string | null;
    created_at: string;
};

export type ReflectionEvent = {
    id: number;
    reflection_id: number;
    event_id: number;
    role: string | null;
    raw_text?: string;
    occurred_at?: string;
    source?: string;
};

export type ReflectionInsight = {
    id: string;
    statement: string;
    confidence: number | null;
    type?: string;
    insight?: string | null;
    evidence_event_ids?: number[];
    data?: any;
};

export type ReflectionInsightMessage = {
    id: number;
    reflection_id: number;
    insight_id: string;
    role: "user" | "assistant";
    message: string;
    created_at: string;
};

export type ReflectionChatMessage = {
    id: number;
    reflection_id: number;
    role: "user" | "assistant";
    message: string;
    created_at: string;
};
