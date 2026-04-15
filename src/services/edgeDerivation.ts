/**
 * Edge derivation engine — orchestrates all 4 derivation strategies
 * for auto-creating graph edges on artifact ingestion.
 */

import { Pool, PoolClient } from 'pg';
import { parseImports, resolveImportPath } from '../lib/importParser';
import { parseWikiLinks } from '../lib/wikiLinkParser';
import { findSimilarArtifacts } from '../lib/embeddingSimilarity';
import { resolveParentArtifact } from '../lib/directoryResolver';

export interface ExplicitEdge {
  target_id: string;
  edge_type: 'depends_on' | 'references' | 'related_to' | 'child_of';
}

export interface IngestionJobResult {
  job_id: string;
  status: string;
}

type EdgeTypeStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

interface BroadcastFn {
  (event: string, payload: Record<string, unknown>): void;
}

export async function deriveEdges(
  pool: Pool,
  artifactId: string,
  explicitEdges?: ExplicitEdge[],
  broadcast?: BroadcastFn,
): Promise<IngestionJobResult> {
  const client = await pool.connect();

  try {
    // Create ingestion job
    const { rows: jobRows } = await client.query(
      `INSERT INTO ingestion_jobs (artifact_id, status, started_at)
       VALUES ($1, 'running', NOW())
       RETURNING id`,
      [artifactId],
    );
    const jobId = jobRows[0].id;

    broadcast?.('ingestion:started', { job_id: jobId, artifact_id: artifactId });

    // Fetch artifact info
    const { rows: artifactRows } = await client.query(
      `SELECT cn.id, cn.type, cn.metadata, cn.project_id
       FROM context_nodes cn WHERE cn.id = $1`,
      [artifactId],
    );

    if (artifactRows.length === 0) {
      await client.query(
        `UPDATE ingestion_jobs SET status = 'failed', error = 'Artifact not found', completed_at = NOW() WHERE id = $1`,
        [jobId],
      );
      broadcast?.('ingestion:failed', { job_id: jobId, error: 'Artifact not found' });
      return { job_id: jobId, status: 'failed' };
    }

    const artifact = artifactRows[0];
    const metadata = artifact.metadata || {};
    const content = metadata.content || '';
    const filePath = metadata.path || metadata.file_path || '';
    const projectId = artifact.project_id;

    let totalEdges = 0;

    // 1. Import dependencies (depends_on)
    try {
      const count = await deriveImportEdges(client, jobId, artifactId, content, filePath, projectId);
      totalEdges += count;
      await updateEdgeTypeStatus(client, jobId, 'depends_on', 'done', count);
      broadcast?.('ingestion:edge_type_update', { job_id: jobId, edge_type: 'depends_on', status: 'done', count });
    } catch (err) {
      await updateEdgeTypeStatus(client, jobId, 'depends_on', 'error', 0);
      broadcast?.('ingestion:edge_type_update', { job_id: jobId, edge_type: 'depends_on', status: 'error', count: 0 });
    }

    // 2. Wiki links (references)
    try {
      const count = await deriveWikiLinkEdges(client, jobId, artifactId, content, projectId);
      totalEdges += count;
      await updateEdgeTypeStatus(client, jobId, 'references', 'done', count);
      broadcast?.('ingestion:edge_type_update', { job_id: jobId, edge_type: 'references', status: 'done', count });
    } catch (err) {
      await updateEdgeTypeStatus(client, jobId, 'references', 'error', 0);
      broadcast?.('ingestion:edge_type_update', { job_id: jobId, edge_type: 'references', status: 'error', count: 0 });
    }

    // 3. Embedding similarity (related_to)
    try {
      const count = await deriveSimilarityEdges(client, jobId, artifactId, projectId);
      totalEdges += count;
      await updateEdgeTypeStatus(client, jobId, 'related_to', 'done', count);
      broadcast?.('ingestion:edge_type_update', { job_id: jobId, edge_type: 'related_to', status: 'done', count });
    } catch (err) {
      await updateEdgeTypeStatus(client, jobId, 'related_to', 'error', 0);
      broadcast?.('ingestion:edge_type_update', { job_id: jobId, edge_type: 'related_to', status: 'error', count: 0 });
    }

    // 4. Directory hierarchy (child_of)
    try {
      const count = await deriveDirectoryEdges(client, jobId, artifactId, filePath, projectId);
      totalEdges += count;
      await updateEdgeTypeStatus(client, jobId, 'child_of', 'done', count);
      broadcast?.('ingestion:edge_type_update', { job_id: jobId, edge_type: 'child_of', status: 'done', count });
    } catch (err) {
      await updateEdgeTypeStatus(client, jobId, 'child_of', 'error', 0);
      broadcast?.('ingestion:edge_type_update', { job_id: jobId, edge_type: 'child_of', status: 'error', count: 0 });
    }

    // 5. Explicit edges
    if (explicitEdges && explicitEdges.length > 0) {
      for (const edge of explicitEdges) {
        await upsertEdge(client, artifactId, edge.target_id, edge.edge_type, 'explicit', null, null, jobId);
      }
      totalEdges += explicitEdges.length;
    }

    // Mark job complete
    await client.query(
      `UPDATE ingestion_jobs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [jobId],
    );

    broadcast?.('ingestion:completed', { job_id: jobId, total_edges: totalEdges });

    return { job_id: jobId, status: 'completed' };
  } catch (err) {
    throw err;
  } finally {
    client.release();
  }
}

async function deriveImportEdges(
  client: PoolClient,
  jobId: string,
  artifactId: string,
  content: string,
  filePath: string,
  projectId: string,
): Promise<number> {
  if (!content) return 0;

  const imports = parseImports(content);
  if (imports.length === 0) return 0;

  // Get all artifact paths in this project
  const { rows: artifacts } = await client.query(
    `SELECT id, metadata->>'path' AS path FROM context_nodes
     WHERE project_id = $1 AND id != $2`,
    [projectId, artifactId],
  );

  const artifactPaths = artifacts.map((a: any) => a.path).filter(Boolean);
  let count = 0;

  for (const imp of imports) {
    const resolved = resolveImportPath(imp, artifactPaths, filePath);
    if (resolved) {
      const target = artifacts.find((a: any) => a.path === resolved);
      if (target) {
        await upsertEdge(client, artifactId, target.id, 'depends_on', 'auto', null, { import_path: imp }, jobId);
        count++;
      }
    }
  }

  return count;
}

async function deriveWikiLinkEdges(
  client: PoolClient,
  jobId: string,
  artifactId: string,
  content: string,
  projectId: string,
): Promise<number> {
  if (!content) return 0;

  const links = parseWikiLinks(content);
  if (links.length === 0) return 0;

  let count = 0;
  for (const link of links) {
    // Try to find artifact by name or title in metadata
    const { rows } = await client.query(
      `SELECT id FROM context_nodes
       WHERE project_id = $1 AND id != $2
         AND (metadata->>'name' = $3 OR metadata->>'title' = $3 OR metadata->>'path' LIKE $4)
       LIMIT 1`,
      [projectId, artifactId, link, `%/${link}%`],
    );

    if (rows.length > 0) {
      await upsertEdge(client, artifactId, rows[0].id, 'references', 'auto', null, { link_target: link }, jobId);
      count++;
    }
  }

  return count;
}

async function deriveSimilarityEdges(
  client: PoolClient,
  jobId: string,
  artifactId: string,
  projectId: string,
): Promise<number> {
  // Check if source artifact has an embedding
  const { rows: sourceRows } = await client.query(
    `SELECT embedding FROM artifact_embeddings WHERE artifact_id = $1`,
    [artifactId],
  );

  if (sourceRows.length === 0) return 0;

  const sourceEmbedding: number[] = JSON.parse(sourceRows[0].embedding);

  // Get all other embeddings in the project
  const { rows: candidates } = await client.query(
    `SELECT ae.artifact_id, ae.embedding
     FROM artifact_embeddings ae
     JOIN context_nodes cn ON ae.artifact_id = cn.id
     WHERE cn.project_id = $1 AND ae.artifact_id != $2`,
    [projectId, artifactId],
  );

  const parsed = candidates.map((c: any) => ({
    artifactId: c.artifact_id,
    embedding: JSON.parse(c.embedding),
  }));

  const similar = findSimilarArtifacts(sourceEmbedding, parsed, 0.7);

  let count = 0;
  for (const match of similar) {
    await upsertEdge(client, artifactId, match.artifactId, 'related_to', 'auto', match.similarity, null, jobId);
    count++;
  }

  return count;
}

async function deriveDirectoryEdges(
  client: PoolClient,
  jobId: string,
  artifactId: string,
  filePath: string,
  projectId: string,
): Promise<number> {
  if (!filePath) return 0;

  // Get all artifacts with paths in this project
  const { rows: artifacts } = await client.query(
    `SELECT id, metadata->>'path' AS path FROM context_nodes
     WHERE project_id = $1 AND id != $2`,
    [projectId, artifactId],
  );

  const pathMap = new Map<string, string>();
  for (const a of artifacts) {
    if (a.path) pathMap.set(a.path, a.id);
  }

  const result = resolveParentArtifact(filePath, pathMap);
  if (result) {
    await upsertEdge(client, artifactId, result.parentId, 'child_of', 'auto', null, { parent_path: result.parentPath }, jobId);
    return 1;
  }

  return 0;
}

async function upsertEdge(
  client: PoolClient,
  sourceId: string,
  targetId: string,
  edgeType: string,
  derivedFrom: string,
  similarityScore: number | null,
  metadata: Record<string, unknown> | null,
  jobId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO graph_edges (source_artifact_id, target_artifact_id, edge_type, derived_from, similarity_score, metadata, ingestion_job_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (source_artifact_id, target_artifact_id, edge_type)
     DO UPDATE SET derived_from = CASE WHEN EXCLUDED.derived_from = 'explicit' THEN 'explicit' ELSE graph_edges.derived_from END,
                   similarity_score = COALESCE(EXCLUDED.similarity_score, graph_edges.similarity_score),
                   metadata = COALESCE(EXCLUDED.metadata, graph_edges.metadata),
                   ingestion_job_id = EXCLUDED.ingestion_job_id`,
    [sourceId, targetId, edgeType, derivedFrom, similarityScore, metadata ? JSON.stringify(metadata) : null, jobId],
  );
}

async function updateEdgeTypeStatus(
  client: PoolClient,
  jobId: string,
  edgeType: string,
  status: string,
  count: number,
): Promise<void> {
  await client.query(
    `UPDATE ingestion_jobs SET ${edgeType}_status = $2, ${edgeType}_count = $3 WHERE id = $1`,
    [jobId, status, count],
  );
}
