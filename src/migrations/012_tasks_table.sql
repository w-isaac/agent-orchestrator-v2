CREATE TABLE IF NOT EXISTS tasks (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL,
  payload           TEXT NOT NULL,
  priority          TEXT NOT NULL DEFAULT 'normal',
  timeout_seconds   INTEGER,
  status            TEXT NOT NULL DEFAULT 'queued',
  output            TEXT,
  validation_error  TEXT,
  error_code        TEXT,
  error_message     TEXT,
  error_stack       TEXT,
  adapter_response  TEXT,
  source_task_id    TEXT REFERENCES tasks(id),
  retry_count       INTEGER NOT NULL DEFAULT 0,
  last_polled_at    TEXT,
  submitted_by      TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  dispatched_at     TEXT,
  completed_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
