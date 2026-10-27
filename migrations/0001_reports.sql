-- Reader reports from the "Add a protest" form, waiting for the pipeline (worker/report.ts,
-- worker/inbox.ts). The id keeps the Vercel Blob pathname format, so pipeline/reader.ts
-- sees exactly the same ids as before.
CREATE TABLE reports (
  id   TEXT PRIMARY KEY,   -- 'queue/<day>/<iphash>-<n>.json'
  day  TEXT NOT NULL,      -- YYYY-MM-DD (UTC)
  who  TEXT NOT NULL,      -- first 8 bytes of sha256(ip|day|salt), hex; never the IP
  n    INTEGER NOT NULL,   -- 1..3, the per-person daily slot
  at   TEXT NOT NULL,      -- ISO time the report arrived
  data TEXT NOT NULL       -- the cleaned report JSON, including submittedAt
);
CREATE INDEX reports_who ON reports (day, who);
