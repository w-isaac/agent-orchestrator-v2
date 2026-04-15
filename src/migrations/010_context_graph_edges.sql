-- Auto edge creation tables: graph_edges, ingestion_jobs, artifact_embeddings

CREATE TABLE IF NOT EXISTS graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_artifact_id UUID NOT NULL REFERENCES context_nodes(id) ON DELETE CASCADE,
  target_artifact_id UUID NOT NULL REFERENCES context_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL CHECK (edge_type IN ('depends_on', 'references', 'related_to', 'child_of')),
  derived_from TEXT NOT NULL DEFAULT 'auto',
  similarity_score REAL,
  metadata JSONB,
  ingestion_job_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES context_nodes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  depends_on_status TEXT NOT NULL DEFAULT 'pending',
  depends_on_count INTEGER NOT NULL DEFAULT 0,
  references_status TEXT NOT NULL DEFAULT 'pending',
  references_count INTEGER NOT NULL DEFAULT 0,
  related_to_status TEXT NOT NULL DEFAULT 'pending',
  related_to_count INTEGER NOT NULL DEFAULT 0,
  child_of_status TEXT NOT NULL DEFAULT 'pending',
  child_of_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artifact_embeddings (
  artifact_id UUID PRIMARY KEY REFERENCES context_nodes(id) ON DELETE CASCADE,
  embedding TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from graph_edges to ingestion_jobs after both tables exist
ALTER TABLE graph_edges ADD CONSTRAINT fk_graph_edges_job
  FOREIGN KEY (ingestion_job_id) REFERENCES ingestion_jobs(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_artifact_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_artifact_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON graph_edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_graph_edges_job ON graph_edges(ingestion_job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_edges_unique ON graph_edges(source_artifact_id, target_artifact_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_artifact ON ingestion_jobs(artifact_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON ingestion_jobs(status);
