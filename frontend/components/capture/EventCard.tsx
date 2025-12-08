"use client";

import { useState } from "react";
import { Clock, MapPin, Trash2, Smile, Zap, AlertCircle } from "lucide-react";

export type EventItem = {
    id: number;
    raw_text: string;
    occurred_at: string;
    source: string;
    has_embedding?: boolean;
    summary?: string | null;
    mood_score?: number | null;
    energy_level?: number | null;
    importance?: number | null;
    location?: string | null;
    tags?: string[] | null;
    people?: string[] | null;
    activities?: string[] | null;
    emotions?: string[] | null;
};

type Props = {
    event: EventItem;
    onUpdated: () => void;
};

export function EventCard({ event, onUpdated }: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [summary, setSummary] = useState(event.summary ?? "");
    const [mood, setMood] = useState<number | undefined>(event.mood_score ?? undefined);
    const [energy, setEnergy] = useState<number | undefined>(event.energy_level ?? undefined);
    const [importance, setImportance] = useState<number | undefined>(event.importance ?? undefined);
    const [location, setLocation] = useState(event.location ?? "");
    const [tags, setTags] = useState((event.tags ?? []).join(", "));
    const [people, setPeople] = useState((event.people ?? []).join(", "));
    const [activities, setActivities] = useState((event.activities ?? []).join(", "));
    const [emotions, setEmotions] = useState((event.emotions ?? []).join(", "));
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    async function handleSave() {
        setSaving(true);
        try {
            await fetch(`/api/events/${event.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    metadata: {
                        summary: summary || null,
                        mood_score: mood ?? null,
                        energy_level: energy ?? null,
                        importance: importance ?? null,
                        location: location || null,
                        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : null,
                        people: people ? people.split(",").map((p) => p.trim()).filter(Boolean) : null,
                        activities: activities ? activities.split(",").map((a) => a.trim()).filter(Boolean) : null,
                        emotions: emotions ? emotions.split(",").map((e) => e.trim()).filter(Boolean) : null,
                    },
                }),
            });
            onUpdated();
            setIsEditing(false);
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!confirm("Are you sure you want to delete this entry?")) return;
        setDeleting(true);
        try {
            await fetch(`/api/events/${event.id}`, { method: "DELETE" });
            onUpdated();
        } finally {
            setDeleting(false);
        }
    }

    return (
        <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--card)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", alignItems: "flex-start" }}>
                <span className="text-muted text-small" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <Clock size={12} />
                    {new Date(event.occurred_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    {event.importance && (
                        <span className="badge" style={{ background: "var(--accent)", color: "white", fontSize: "0.7rem", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>
                            {Array(event.importance).fill("!").join("")}
                        </span>
                    )}
                    {event.has_embedding && <span className="badge" style={{ fontSize: "0.6rem", padding: "0.1rem 0.3rem", background: "var(--muted)", borderRadius: "4px" }}>AI Ready</span>}
                </div>
            </div>

            <p style={{ whiteSpace: "pre-wrap", lineHeight: "1.4", fontSize: "0.95rem", marginBottom: "0.75rem" }}>
                {event.raw_text.length > 150 ? event.raw_text.slice(0, 150) + "..." : event.raw_text}
            </p>

            {event.summary && !isEditing && (
                <div style={{ padding: "0.5rem", background: "var(--muted)", borderRadius: "var(--radius)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                    <strong>Summary:</strong> {event.summary}
                </div>
            )}

            {!isEditing && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    {event.mood_score !== null && event.mood_score !== undefined && (
                        <span className="tag-filter" style={{ background: event.mood_score > 0 ? "var(--success-bg)" : "var(--error-bg)", color: "var(--foreground)" }}>
                            <Smile size={10} /> Mood: {event.mood_score}
                        </span>
                    )}
                    {event.location && <span className="tag-filter"><MapPin size={10} /> {event.location}</span>}
                    {event.tags?.map(t => <span key={t} className="tag-filter">#{t}</span>)}
                    {event.people?.map(p => <span key={p} className="tag-filter" style={{ background: "var(--secondary)" }}>@{p}</span>)}
                    {event.activities?.map(a => <span key={a} className="tag-filter" style={{ border: "1px solid var(--border)" }}>{a}</span>)}
                    {event.emotions?.map(e => <span key={e} className="tag-filter" style={{ fontStyle: "italic" }}>{e}</span>)}
                </div>
            )}

            {isEditing && (
                <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div>
                        <label className="label">Summary</label>
                        <textarea className="textarea" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                        <div>
                            <label className="label">Mood</label>
                            <input className="input" type="number" min={-5} max={5} value={mood ?? ""} onChange={(e) => setMood(e.target.value ? Number(e.target.value) : undefined)} />
                        </div>
                        <div>
                            <label className="label">Energy</label>
                            <input className="input" type="number" min={0} max={10} value={energy ?? ""} onChange={(e) => setEnergy(e.target.value ? Number(e.target.value) : undefined)} />
                        </div>
                        <div>
                            <label className="label">Importance</label>
                            <input className="input" type="number" min={1} max={5} value={importance ?? ""} onChange={(e) => setImportance(e.target.value ? Number(e.target.value) : undefined)} />
                        </div>
                        <div>
                            <label className="label">Location</label>
                            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
                        </div>
                    </div>
                    <div>
                        <label className="label">Tags</label>
                        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
                    </div>
                    <div>
                        <label className="label">People</label>
                        <input className="input" value={people} onChange={(e) => setPeople(e.target.value)} />
                    </div>
                    <div>
                        <label className="label">Activities</label>
                        <input className="input" value={activities} onChange={(e) => setActivities(e.target.value)} />
                    </div>
                    <div>
                        <label className="label">Emotions</label>
                        <input className="input" value={emotions} onChange={(e) => setEmotions(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                            {saving ? "Saving..." : "Save"}
                        </button>
                        <button className="btn btn-ghost" onClick={() => setIsEditing(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {!isEditing && (
                <div style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button className="btn btn-ghost btn-icon text-destructive" onClick={handleDelete} disabled={deleting} title="Delete entry">
                        <Trash2 size={14} />
                    </button>
                    <button className="btn btn-ghost text-small" onClick={() => setIsEditing(true)}>Edit</button>
                </div>
            )}
        </div>
    );
}
