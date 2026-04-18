-- AOV-190: iterations table — per-story work iterations with monotonic numbering

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS iterations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id          UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  iteration_number  INTEGER NOT NULL CHECK (iteration_number > 0),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'in_progress', 'completed', 'qa_failed', 'cancelled')),
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_iterations_story_id_created_at
  ON iterations (story_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_iterations_story_number
  ON iterations (story_id, iteration_number);

DROP TRIGGER IF EXISTS trg_iterations_updated_at ON iterations;
CREATE TRIGGER trg_iterations_updated_at
  BEFORE UPDATE ON iterations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
