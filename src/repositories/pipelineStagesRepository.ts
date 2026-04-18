import type { PoolClient, Pool } from 'pg';
import { DEFAULT_PIPELINE_STAGES } from '../constants/defaultPipelineStages';

export interface PipelineStage {
  id: string;
  project_id: string;
  name: string;
  icon: string | null;
  stage_order: number;
  has_gate: boolean;
  created_at: string;
}

type Queryable = Pick<PoolClient | Pool, 'query'>;

export async function insertDefaultStages(client: Queryable, projectId: string): Promise<PipelineStage[]> {
  const values: string[] = [];
  const params: unknown[] = [];
  for (const stage of DEFAULT_PIPELINE_STAGES) {
    const base = params.length;
    params.push(projectId, stage.name, stage.icon, stage.stage_order, stage.has_gate);
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
  }
  const { rows } = await client.query(
    `INSERT INTO pipeline_stages (project_id, name, icon, stage_order, has_gate)
     VALUES ${values.join(', ')}
     RETURNING id, project_id, name, icon, stage_order, has_gate, created_at`,
    params,
  );
  return (rows as PipelineStage[]).sort((a, b) => a.stage_order - b.stage_order);
}

export async function listByProjectId(client: Queryable, projectId: string): Promise<PipelineStage[]> {
  const { rows } = await client.query(
    `SELECT id, project_id, name, icon, stage_order, has_gate, created_at
       FROM pipeline_stages
      WHERE project_id = $1
      ORDER BY stage_order ASC`,
    [projectId],
  );
  return rows as PipelineStage[];
}
