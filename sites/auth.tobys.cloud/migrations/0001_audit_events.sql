CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  email TEXT NOT NULL,
  ip TEXT,
  ua TEXT
);

CREATE INDEX audit_events_ts_id ON audit_events (ts DESC, id DESC);
