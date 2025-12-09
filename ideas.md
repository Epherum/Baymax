# Idea Backlog (to grow with usage)

- Capture
  - Inline “streak” + rolling 7/30-day stats in header, with quick prompt suggestions based on recent gaps.
  - Smart defaults: auto-set occurred_at from last edited time; remember last-used tags/metrics per session.
  - Capture templates (morning check-in, evening retro, decision log) selectable from the header card.
  - Quick-add drawer: ctrl/cmd+J opens a tiny capture field with tag chips and one metric.

- Achievements
  - Streak badge for weekly logging; “recent themes” chips (top tags from last 30 days) under the header stats.
  - One-click “promote to reflection” to create a structured reflection from an achievement.
  - Timeline mini-chart (sparklines) for achievements per week/month beside the count cards.

- Life Dump
  - Progress chip showing % of chunks summarized and % with embeddings per import.
  - Chunk heatmap (length vs position) rendered inline under the header card.
  - “Next actions” hints: if an import is finalized but has few metrics, prompt to extract metrics from top chunks.

- Metrics & Insights
  - Metric directory page: list of all unique metrics with usage counts and first/last seen dates.
  - “Interesting deltas” panel: auto-highlight metrics with >X% change vs prior period.
  - People timeline overlay: show captures mentioning top people overlaid with a chosen metric.

- Reflections
  - “Evidence readiness” badge (events linked, insights drafted, chat used) before generating a reflection.
  - Saved chat snippets: pin an assistant answer into the reflection body with one click.

- Navigation & UI density
  - Global header summary bar (sticky): totals for captures/achievements/imports + quick add buttons.
  - Command palette expansions: “add achievement”, “search metrics”, “open last capture”, “start life dump import”.
  - Split-pane option on desktop to view capture list and detail/chat side-by-side.

- Growth hooks (update this list as you use the app)
  - Log rough weekly usage metrics (captures per week, achievements per week, active metrics) to seed new UI prompts.
  - When a counter passes a threshold (e.g., >5 achievements), surface the next UI card (e.g., themes, streak).
  - Keep a short changelog section in this file with dates and the behaviors you’d like to see next.
