-- AOV-194 down: revert smoke_configs table
DROP TRIGGER IF EXISTS trg_smoke_configs_updated_at ON smoke_configs;
DROP TABLE IF EXISTS smoke_configs;
