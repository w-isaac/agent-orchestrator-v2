-- AOV-194: smoke_configs table — per-project smoke test base_url and route list

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS smoke_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  base_url    TEXT NOT NULL,
  routes      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_smoke_configs_updated_at ON smoke_configs;
CREATE TRIGGER trg_smoke_configs_updated_at
  BEFORE UPDATE ON smoke_configs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
