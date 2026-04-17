export interface NormalizedArtifact {
  id: string;
  type: string;
  content: string;
  scope?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface NormalizedRelationship {
  source_id: string;
  target_id: string;
  type: string;
}

export interface NormalizedResult {
  artifacts: NormalizedArtifact[];
  relationships: NormalizedRelationship[];
  metadata: {
    agent_id?: string;
    task_id?: string;
    timestamp: string;
    raw_keys: string[];
  };
}

/**
 * Transforms raw agent output into a canonical { artifacts, relationships, metadata } shape.
 * Handles common variations in raw output structure.
 */
export function normalizeResult(raw: Record<string, any>): NormalizedResult {
  const artifacts: NormalizedArtifact[] = [];
  const relationships: NormalizedRelationship[] = [];

  // Extract artifacts from common raw output shapes
  const rawArtifacts = raw.artifacts || raw.results || raw.outputs || [];
  if (Array.isArray(rawArtifacts)) {
    for (const item of rawArtifacts) {
      artifacts.push({
        id: item.id || '',
        type: item.type || 'unknown',
        content: typeof item.content === 'string' ? item.content : JSON.stringify(item.content ?? ''),
        scope: item.scope,
        confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
        metadata: item.metadata,
      });
    }
  }

  // Extract relationships
  const rawRelationships = raw.relationships || raw.edges || raw.links || [];
  if (Array.isArray(rawRelationships)) {
    for (const rel of rawRelationships) {
      relationships.push({
        source_id: rel.source_id || rel.source || '',
        target_id: rel.target_id || rel.target || '',
        type: rel.type || rel.relationship_type || 'related_to',
      });
    }
  }

  const metadata = {
    agent_id: raw.agent_id,
    task_id: raw.task_id,
    timestamp: raw.timestamp || new Date().toISOString(),
    raw_keys: Object.keys(raw),
  };

  return { artifacts, relationships, metadata };
}
