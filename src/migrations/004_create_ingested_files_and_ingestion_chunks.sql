-- Migration 004: Create ingested_files and ingestion_chunks tables for artifact ingestion

CREATE TABLE IF NOT EXISTS ingested_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('markdown', 'typescript', 'python', 'javascript', 'pdf', 'spreadsheet', 'design')),
  file_hash VARCHAR(64) NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'partial_error', 'error')),
  last_ingested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingested_files_file_hash ON ingested_files(file_hash);
CREATE INDEX IF NOT EXISTS idx_ingested_files_file_type ON ingested_files(file_type);
CREATE INDEX IF NOT EXISTS idx_ingested_files_status ON ingested_files(status);

CREATE TABLE IF NOT EXISTS ingestion_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES ingested_files(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  node_type VARCHAR(50) NOT NULL CHECK (node_type IN ('markdown', 'code')),
  heading_path TEXT,
  signature TEXT,
  content TEXT NOT NULL,
  summary TEXT,
  purpose TEXT,
  inputs_outputs JSONB,
  token_count INTEGER NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  embedding vector(1536),
  embedding_model VARCHAR(100),
  embedding_dims INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'embedded', 'skipped', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (file_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_ingestion_chunks_file_id ON ingestion_chunks(file_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_chunks_content_hash ON ingestion_chunks(content_hash);
CREATE INDEX IF NOT EXISTS idx_ingestion_chunks_node_type ON ingestion_chunks(node_type);
CREATE INDEX IF NOT EXISTS idx_ingestion_chunks_status ON ingestion_chunks(status);
