export type MetricMode = "metric" | "person";

export type MetricPoint = { bucket: string; value: number; label?: string; rawBucket?: string };
export type MetricAnnotation = { bucket: string; source_type: string; count: number; label?: string };

export type MetricsQuery = {
  mode: MetricMode;
  key?: string;
  person?: string;
  bucket: string;
  agg: string;
};

export async function fetchMetricsSeries({ mode, key, person, bucket, agg }: MetricsQuery) {
  const params = new URLSearchParams();
  params.set("type", mode);
  params.set("bucket", bucket);
  if (mode === "metric") {
    if (key) params.set("key", key);
    params.set("agg", agg);
  } else {
    if (person) params.set("person", person);
    params.set("agg", "count");
  }
  const res = await fetch(`/api/metrics?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message ?? "Query failed");
  }
  const data = await res.json();
  return (data.points ?? []).map((p: MetricPoint) => ({
    ...p,
    rawBucket: p.bucket,
    label: formatBucketLabel(p.bucket)
  }));
}

export async function fetchMetricWithAnnotations({ key, bucket, agg }: { key: string; bucket: string; agg: string }) {
  const params = new URLSearchParams();
  params.set("type", "metric");
  params.set("bucket", bucket);
  params.set("key", key);
  params.set("agg", agg);
  params.set("include_annotations", "1");
  const res = await fetch(`/api/metrics?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message ?? "Query failed");
  }
  const data = await res.json();
  const points: MetricPoint[] = (data.points ?? []).map((p: MetricPoint) => ({
    ...p,
    rawBucket: p.bucket,
    label: formatBucketLabel(p.bucket)
  }));
  const annotations: MetricAnnotation[] = Array.isArray(data.annotations)
    ? data.annotations.map((a: any) => ({
        bucket: a.bucket,
        source_type: a.source_type,
        count: Number(a.count) || 0,
        label: formatBucketLabel(a.bucket)
      }))
    : [];
  return { points, annotations };
}

function weekStartIso(year: number, week: number) {
  if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
  const simple = new Date(Date.UTC(year, 0, 1 + week * 7));
  const dow = simple.getUTCDay();
  const isoWeekStart = simple;
  isoWeekStart.setUTCDate(simple.getUTCDate() - (dow === 0 ? 6 : dow - 1)); // shift to Monday
  return isoWeekStart.toISOString();
}

export function formatBucketLabel(raw: string) {
  if (!raw) return raw;
  if (raw === "All time") return "All time";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? raw : formatFriendlyDateSafe(d);
  }
  const weekMatch = raw.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const year = Number(weekMatch[1]);
    const week = Number(weekMatch[2]);
    const start = weekStartIso(year, week);
    return start ? `Week of ${formatFriendlyDateSafe(new Date(start))}` : raw;
  }
  const monthMatch = raw.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const d = new Date(`${monthMatch[1]}-${monthMatch[2]}-01T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }
  const spanMatch = raw.match(/^(\d{4})-(\d{2}) \(\+(\d)m\)$/);
  if (spanMatch) {
    const d = new Date(`${spanMatch[1]}-${spanMatch[2]}-01T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return raw;
    const end = new Date(d);
    end.setMonth(d.getMonth() + Number(spanMatch[3]));
    return `${d.toLocaleDateString(undefined, { month: "short", year: "numeric" })} → ${end.toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
  }
  return raw;
}

function formatFriendlyDateSafe(d: Date) {
  try {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function movingAverage(series: MetricPoint[], window = 2) {
  if (series.length <= 2) return series;
  const vals = series.map((p) => p.value);
  const smooth = vals.map((_, idx) => {
    const start = Math.max(0, idx - window);
    const end = Math.min(vals.length, idx + window + 1);
    const slice = vals.slice(start, end);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    return avg;
  });
  return series.map((p, idx) => ({ ...p, value: Number(smooth[idx].toFixed(2)) }));
}

export function describeBucket(bucket: string) {
  switch (bucket) {
    case "day":
      return "day";
    case "week":
      return "week";
    case "month":
      return "month";
    case "month_2":
      return "2-month span";
    case "month_3":
      return "3-month span";
    case "all":
      return "all time";
    default:
      return bucket;
  }
}
