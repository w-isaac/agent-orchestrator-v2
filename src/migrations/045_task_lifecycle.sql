-- AOV-39: Extend task status constraint for full lifecycle statuses

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN (
    'pending', 'queued', 'pre_flight', 'preflight',
    'dispatched', 'collecting', 'validated', 'graph_updated',
    'running', 'validating', 'complete', 'completed',
    'invalid', 'failed', 'cancelled', 'pre_flight_failed'
  ));
