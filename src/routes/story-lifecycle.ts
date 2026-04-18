import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';
import { broadcastStoryUpdated, StoryLifecycleCause } from '../services/storyBroadcaster';
import { detectCycle, DependencyEdge } from '../services/dependencyGraph';

export const storyLifecycleRouter = Router();

const STORY_COLUMNS =
  'id, project_id, title, description, acceptance_criteria, priority, epic, status, github_issue_number, current_stage_id, position, created_at, updated_at';

async function loadStoryWithStage(id: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT s.id, s.project_id, s.current_stage_id, s.position, s.status,
            ps.stage_order AS current_stage_order,
            ps.has_gate    AS current_stage_has_gate
       FROM stories s
       LEFT JOIN pipeline_stages ps ON ps.id = s.current_stage_id
      WHERE s.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

async function loadStory(id: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${STORY_COLUMNS} FROM stories WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

function sendAndBroadcast(
  res: Response,
  story: Record<string, unknown>,
  cause: StoryLifecycleCause,
  extra?: Record<string, unknown>,
) {
  broadcastStoryUpdated(story, cause);
  res.status(200).json({ story, ...(extra ?? {}) });
}

/** POST /api/stories/:id/advance — move to next stage if gate satisfied */
storyLifecycleRouter.post('/api/stories/:id/advance', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const storyRow = await loadStoryWithStage(req.params.id);
    if (!storyRow) {
      res.status(404).json({ error: 'Story not found' });
      return;
    }
    if (storyRow.current_stage_id == null) {
      res.status(409).json({ error: 'Story is not assigned to a pipeline stage' });
      return;
    }

    if (storyRow.current_stage_has_gate) {
      const { rows: gateRows } = await pool.query(
        `SELECT approved FROM story_gates WHERE story_id = $1 AND stage_id = $2`,
        [storyRow.id, storyRow.current_stage_id],
      );
      const approved = gateRows[0]?.approved === true;
      if (!approved) {
        res.status(422).json({ error: 'gate_approval_required' });
        return;
      }
    }

    const { rows: nextRows } = await pool.query(
      `SELECT id FROM pipeline_stages
         WHERE project_id = $1 AND stage_order > $2
         ORDER BY stage_order ASC LIMIT 1`,
      [storyRow.project_id, storyRow.current_stage_order],
    );
    if (nextRows.length === 0) {
      res.status(409).json({ error: 'Story is already at the terminal stage' });
      return;
    }
    const nextStageId = nextRows[0].id;

    const { rows: posRows } = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
         FROM stories WHERE current_stage_id = $1`,
      [nextStageId],
    );
    const nextPos = Number(posRows[0].next_pos);

    const { rows: updated } = await pool.query(
      `UPDATE stories SET current_stage_id = $1, position = $2, updated_at = now()
         WHERE id = $3 RETURNING ${STORY_COLUMNS}`,
      [nextStageId, nextPos, storyRow.id],
    );

    await pool.query(
      `INSERT INTO story_history (story_id, event_type, from_value, to_value, actor)
         VALUES ($1, 'advance', $2, $3, $4)`,
      [
        storyRow.id,
        JSON.stringify({ stage_id: storyRow.current_stage_id }),
        JSON.stringify({ stage_id: nextStageId }),
        (req.body && req.body.actor) ?? null,
      ],
    );

    sendAndBroadcast(res, updated[0], 'advance');
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/stories/:id/retreat — move to previous stage */
storyLifecycleRouter.post('/api/stories/:id/retreat', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const storyRow = await loadStoryWithStage(req.params.id);
    if (!storyRow) {
      res.status(404).json({ error: 'Story not found' });
      return;
    }
    if (storyRow.current_stage_id == null) {
      res.status(409).json({ error: 'Story is not assigned to a pipeline stage' });
      return;
    }

    const { rows: prevRows } = await pool.query(
      `SELECT id FROM pipeline_stages
         WHERE project_id = $1 AND stage_order < $2
         ORDER BY stage_order DESC LIMIT 1`,
      [storyRow.project_id, storyRow.current_stage_order],
    );
    if (prevRows.length === 0) {
      res.status(409).json({ error: 'Story is already at the initial stage' });
      return;
    }
    const prevStageId = prevRows[0].id;

    const { rows: posRows } = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
         FROM stories WHERE current_stage_id = $1`,
      [prevStageId],
    );
    const nextPos = Number(posRows[0].next_pos);

    const { rows: updated } = await pool.query(
      `UPDATE stories SET current_stage_id = $1, position = $2, updated_at = now()
         WHERE id = $3 RETURNING ${STORY_COLUMNS}`,
      [prevStageId, nextPos, storyRow.id],
    );

    await pool.query(
      `INSERT INTO story_history (story_id, event_type, from_value, to_value, actor)
         VALUES ($1, 'retreat', $2, $3, $4)`,
      [
        storyRow.id,
        JSON.stringify({ stage_id: storyRow.current_stage_id }),
        JSON.stringify({ stage_id: prevStageId }),
        (req.body && req.body.actor) ?? null,
      ],
    );

    sendAndBroadcast(res, updated[0], 'retreat');
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/stories/:id/approve — approve gate for the story's current stage */
storyLifecycleRouter.post('/api/stories/:id/approve', async (req: Request, res: Response) => {
  try {
    const { approver_name, approval_reason } = req.body ?? {};
    if (typeof approver_name !== 'string' || approver_name.trim().length === 0) {
      res.status(400).json({ error: 'approver_name is required' });
      return;
    }

    const pool = getPool();
    const storyRow = await loadStoryWithStage(req.params.id);
    if (!storyRow) {
      res.status(404).json({ error: 'Story not found' });
      return;
    }
    if (storyRow.current_stage_id == null) {
      res.status(409).json({ error: 'Story is not assigned to a pipeline stage' });
      return;
    }
    if (!storyRow.current_stage_has_gate) {
      res.status(422).json({ error: 'Current stage does not require gate approval' });
      return;
    }

    const { rows: gateRows } = await pool.query(
      `INSERT INTO story_gates (story_id, stage_id, approved, approver_name, approval_reason, approved_at)
         VALUES ($1, $2, TRUE, $3, $4, now())
       ON CONFLICT (story_id, stage_id)
         DO UPDATE SET approved = TRUE, approver_name = EXCLUDED.approver_name,
                       approval_reason = EXCLUDED.approval_reason, approved_at = now()
       RETURNING id, story_id, stage_id, approved, approver_name, approval_reason, approved_at`,
      [storyRow.id, storyRow.current_stage_id, approver_name, approval_reason ?? null],
    );

    await pool.query(
      `INSERT INTO story_history (story_id, event_type, from_value, to_value, actor)
         VALUES ($1, 'approve', $2, $3, $4)`,
      [
        storyRow.id,
        JSON.stringify({ stage_id: storyRow.current_stage_id, approved: false }),
        JSON.stringify({ stage_id: storyRow.current_stage_id, approved: true }),
        approver_name,
      ],
    );

    const story = await loadStory(storyRow.id);
    broadcastStoryUpdated(story, 'approve');
    res.status(200).json({ story, gate: gateRows[0] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** PUT /api/stories/:id/dependencies — replace the dependency set for a story */
storyLifecycleRouter.put('/api/stories/:id/dependencies', async (req: Request, res: Response) => {
  try {
    const { depends_on_ids } = req.body ?? {};
    if (!Array.isArray(depends_on_ids) || depends_on_ids.some((x) => typeof x !== 'string')) {
      res.status(400).json({ error: 'depends_on_ids must be an array of story ids' });
      return;
    }
    const storyId = req.params.id;
    const pool = getPool();

    const story = await loadStory(storyId);
    if (!story) {
      res.status(404).json({ error: 'Story not found' });
      return;
    }

    if (depends_on_ids.length > 0) {
      const { rows: targets } = await pool.query(
        `SELECT id FROM stories WHERE id = ANY($1::uuid[])`,
        [depends_on_ids],
      );
      if (targets.length !== new Set(depends_on_ids).size) {
        res.status(422).json({ error: 'one or more dependency targets not found' });
        return;
      }
    }

    const { rows: edgeRows } = await pool.query(
      `SELECT story_id, depends_on_story_id FROM story_dependencies`,
    );
    const cycle = detectCycle(edgeRows as DependencyEdge[], storyId, depends_on_ids);
    if (cycle) {
      res.status(422).json({ error: 'circular_dependency_detected', cycle });
      return;
    }

    await pool.query(`DELETE FROM story_dependencies WHERE story_id = $1`, [storyId]);
    if (depends_on_ids.length > 0) {
      const values: string[] = [];
      const params: unknown[] = [];
      for (const depId of depends_on_ids) {
        params.push(storyId, depId);
        values.push(`($${params.length - 1}, $${params.length})`);
      }
      await pool.query(
        `INSERT INTO story_dependencies (story_id, depends_on_story_id) VALUES ${values.join(', ')}`,
        params,
      );
    }

    await pool.query(
      `INSERT INTO story_history (story_id, event_type, from_value, to_value, actor)
         VALUES ($1, 'dep_add', $2, $3, $4)`,
      [storyId, JSON.stringify({}), JSON.stringify({ depends_on_ids }), null],
    );

    const updated = await loadStory(storyId);
    broadcastStoryUpdated(updated, 'deps');
    res.status(200).json({ story: updated, dependencies: depends_on_ids });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/stories/:id/dependencies — list deps and dependents */
storyLifecycleRouter.get('/api/stories/:id/dependencies', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const storyId = req.params.id;
    const { rows: deps } = await pool.query(
      `SELECT depends_on_story_id FROM story_dependencies WHERE story_id = $1`,
      [storyId],
    );
    const { rows: dependents } = await pool.query(
      `SELECT story_id FROM story_dependencies WHERE depends_on_story_id = $1`,
      [storyId],
    );
    res.json({
      dependencies: deps.map((r: { depends_on_story_id: string }) => r.depends_on_story_id),
      dependents: dependents.map((r: { story_id: string }) => r.story_id),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/stories/:id/prioritize — move story up/down within its stage */
storyLifecycleRouter.post('/api/stories/:id/prioritize', async (req: Request, res: Response) => {
  try {
    const { direction } = req.body ?? {};
    if (direction !== 'up' && direction !== 'down') {
      res.status(400).json({ error: "direction must be 'up' or 'down'" });
      return;
    }
    const pool = getPool();
    const storyId = req.params.id;

    const { rows: storyRows } = await pool.query(
      `SELECT id, current_stage_id, position FROM stories WHERE id = $1`,
      [storyId],
    );
    if (storyRows.length === 0) {
      res.status(404).json({ error: 'Story not found' });
      return;
    }
    const story = storyRows[0];
    if (story.current_stage_id == null) {
      res.status(409).json({ error: 'Story is not assigned to a pipeline stage' });
      return;
    }

    const op = direction === 'up' ? '<' : '>';
    const order = direction === 'up' ? 'DESC' : 'ASC';
    const { rows: neighborRows } = await pool.query(
      `SELECT id, position FROM stories
         WHERE current_stage_id = $1 AND position ${op} $2
         ORDER BY position ${order} LIMIT 1`,
      [story.current_stage_id, story.position],
    );
    if (neighborRows.length === 0) {
      res.status(409).json({ error: 'Story is already at the edge of its stage' });
      return;
    }
    const neighbor = neighborRows[0];

    await pool.query(
      `UPDATE stories SET position = $1, updated_at = now() WHERE id = $2`,
      [neighbor.position, story.id],
    );
    await pool.query(
      `UPDATE stories SET position = $1, updated_at = now() WHERE id = $2`,
      [story.position, neighbor.id],
    );

    await pool.query(
      `INSERT INTO story_history (story_id, event_type, from_value, to_value, actor)
         VALUES ($1, 'prioritize', $2, $3, $4)`,
      [
        story.id,
        JSON.stringify({ position: story.position }),
        JSON.stringify({ position: neighbor.position, direction }),
        null,
      ],
    );

    const updated = await loadStory(story.id);
    broadcastStoryUpdated(updated, 'prioritize');
    res.status(200).json({ story: updated, neighbor: { id: neighbor.id, position: story.position } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/stories/:id/history — list lifecycle events for a story */
storyLifecycleRouter.get('/api/stories/:id/history', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, story_id, event_type, from_value, to_value, actor, created_at
         FROM story_history WHERE story_id = $1 ORDER BY created_at DESC`,
      [req.params.id],
    );
    res.json({ events: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
