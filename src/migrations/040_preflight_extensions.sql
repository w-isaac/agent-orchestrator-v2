-- AOV-37: Extend preflight_checks with run_id and check_order; update status constraints

ALTER TABLE preflight_checks ADD COLUMN IF NOT EXISTS run_id UUID;
ALTER TABLE preflight_checks ADD COLUMN IF NOT EXISTS check_order INTEGER;

-- Update preflight_checks status constraint to include spec values
ALTER TABLE preflight_checks DROP CONSTRAINT IF EXISTS preflight_checks_status_check;
ALTER TABLE preflight_checks ADD CONSTRAINT preflight_checks_status_check
  CHECK (status IN ('pending', 'pass', 'passed', 'fail', 'failed', 'skipped'));

-- Extend tasks status constraint to include pre-flight statuses
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('pending', 'queued', 'pre_flight', 'dispatched', 'running', 'validating', 'complete', 'completed', 'invalid', 'failed', 'cancelled', 'pre_flight_failed'));
