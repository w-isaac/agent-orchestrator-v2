-- Migration 009: Create parsed_units table for section-based ingestion
-- Stores extracted units (PDF sections, spreadsheet sheets, design components)

CREATE TABLE IF NOT EXISTS parsed_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES ingested_files(id) ON DELETE CASCADE,
  unit_type VARCHAR(50) NOT NULL CHECK (unit_type IN ('pdf_section', 'spreadsheet_sheet', 'design_component')),
  unit_index INTEGER NOT NULL,
  title VARCHAR(500),
  content TEXT NOT NULL,
  summary TEXT,
  metadata JSONB DEFAULT '{}',
  token_count INTEGER NOT NULL DEFAULT 0,
  content_hash VARCHAR(64) NOT NULL,
  embedding vector(1536),
  context_node_id UUID REFERENCES context_nodes(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'parsed', 'embedded', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (file_id, unit_index)
);

CREATE INDEX IF NOT EXISTS idx_parsed_units_file_id ON parsed_units(file_id);
CREATE INDEX IF NOT EXISTS idx_parsed_units_unit_type ON parsed_units(unit_type);
CREATE INDEX IF NOT EXISTS idx_parsed_units_status ON parsed_units(status);
CREATE INDEX IF NOT EXISTS idx_parsed_units_context_node ON parsed_units(context_node_id);
