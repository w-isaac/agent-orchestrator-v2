-- Context graph extensions: add label, content, staleness_ttl_ms to context_nodes
ALTER TABLE context_nodes ADD COLUMN IF NOT EXISTS label VARCHAR(255);
ALTER TABLE context_nodes ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE context_nodes ADD COLUMN IF NOT EXISTS staleness_ttl_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_context_nodes_label ON context_nodes(label);
