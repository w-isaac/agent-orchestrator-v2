import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';

export const storiesRouter = Router();

const VALID_STATUSES = ['queued', 'in_progress', 'gate', 'done', 'failed', 'cancelled'] as const;
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const STORY_COLUMNS =
  'id, project_id, title, description, acceptance_criteria, priority, epic, status, github_issue_number, created_at, updated_at';

/** POST /api/stories — create a new story */
storiesRouter.post('/api/stories', async (req: Request, res: Response) => {
  try {
    const {
      project_id,
      title,
      description,
      acceptance_criteria,
      priority,
      epic,
      github_issue_number,
    } = req.body ?? {};

    if (typeof project_id !== 'string' || project_id.length === 0) {
      res.status(400).json({ error: 'project_id is required' });
      return;
    }
    if (typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
      res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
      return;
    }
    if (
      github_issue_number !== undefined &&
      github_issue_number !== null &&
      (!Number.isInteger(github_issue_number) || github_issue_number <= 0)
    ) {
      res.status(400).json({ error: 'github_issue_number must be a positive integer' });
      return;
    }

    const pool = getPool();
    const projectCheck = await pool.query('SELECT 1 FROM projects WHERE id = $1', [project_id]);
    if (projectCheck.rows.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO stories (project_id, title, description, acceptance_criteria, priority, epic, github_issue_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${STORY_COLUMNS}`,
        [
          project_id,
          title,
          description ?? null,
          acceptance_criteria ?? null,
          priority ?? 'medium',
          epic ?? null,
          github_issue_number ?? null,
        ],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        res.status(409).json({ error: 'Duplicate github_issue_number for this project' });
        return;
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/stories — list stories, optionally filtered by project_id and status */
storiesRouter.get('/api/stories', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { project_id, status } = req.query;
    const filters: string[] = [];
    const params: unknown[] = [];
    if (typeof project_id === 'string' && project_id.length > 0) {
      params.push(project_id);
      filters.push(`project_id = $${params.length}`);
    }
    if (typeof status === 'string' && status.length > 0) {
      params.push(status);
      filters.push(`status = $${params.length}`);
    }
    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT ${STORY_COLUMNS} FROM stories ${where} ORDER BY created_at DESC`,
      params,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/stories/:id — fetch a single story */
storiesRouter.get('/api/stories/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT ${STORY_COLUMNS} FROM stories WHERE id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Story not found' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** PATCH /api/stories/:id — update a subset of story fields */
storiesRouter.patch('/api/stories/:id', async (req: Request, res: Response) => {
  try {
    const allowed = ['title', 'description', 'acceptance_criteria', 'priority', 'epic', 'status', 'github_issue_number'] as const;
    const body = req.body ?? {};
    const updates: string[] = [];
    const params: unknown[] = [];

    for (const field of allowed) {
      if (!(field in body)) continue;
      const value = body[field];
      if (field === 'status' && !VALID_STATUSES.includes(value)) {
        res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
        return;
      }
      if (field === 'priority' && !VALID_PRIORITIES.includes(value)) {
        res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
        return;
      }
      if (field === 'title' && (typeof value !== 'string' || value.trim().length === 0)) {
        res.status(400).json({ error: 'title cannot be empty' });
        return;
      }
      params.push(value);
      updates.push(`${field} = $${params.length}`);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'no valid fields to update' });
      return;
    }

    updates.push(`updated_at = now()`);
    params.push(req.params.id);

    const pool = getPool();
    try {
      const { rows } = await pool.query(
        `UPDATE stories SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING ${STORY_COLUMNS}`,
        params,
      );
      if (rows.length === 0) {
        res.status(404).json({ error: 'Story not found' });
        return;
      }
      res.json(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        res.status(409).json({ error: 'Duplicate github_issue_number for this project' });
        return;
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** DELETE /api/stories/:id — remove a story */
storiesRouter.delete('/api/stories/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rowCount } = await pool.query('DELETE FROM stories WHERE id = $1', [req.params.id]);
    if (rowCount === 0) {
      res.status(404).json({ error: 'Story not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/stories/:id/context-preview — list active artifacts for context preview */
storiesRouter.get('/api/stories/:id/context-preview', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const storyId = req.params.id;

    const { rows: artifacts } = await pool.query(
      `SELECT id, title, metadata->>'type' AS type, token_count_full AS token_count,
              relevance_score, created_at
       FROM context_artifacts
       WHERE story_id = $1 AND superseded = 0
       ORDER BY relevance_score DESC, created_at ASC`,
      [storyId],
    );

    // Fetch budget_limit for this story
    const { rows: budgetRows } = await pool.query(
      'SELECT budget_limit FROM story_budgets WHERE story_id = $1',
      [storyId],
    );
    const budgetLimit = budgetRows.length > 0 ? budgetRows[0].budget_limit : null;

    if (artifacts.length === 0) {
      res.json({
        artifacts: [],
        summary: { artifact_count: 0, total_tokens: 0 },
        budget_limit: budgetLimit,
      });
      return;
    }

    const totalTokens = artifacts.reduce(
      (sum: number, a: any) => sum + (parseInt(a.token_count, 10) || 0),
      0,
    );

    res.json({
      artifacts: artifacts.map((a: any) => ({
        id: a.id,
        title: a.title,
        type: a.type || 'unknown',
        token_count: parseInt(a.token_count, 10) || 0,
        relevance_score: a.relevance_score != null ? parseFloat(a.relevance_score) : null,
        created_at: a.created_at,
      })),
      summary: {
        artifact_count: artifacts.length,
        total_tokens: totalTokens,
      },
      budget_limit: budgetLimit,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** PATCH /api/stories/:id/budget-limit — set or update token budget for a story */
storiesRouter.patch('/api/stories/:id/budget-limit', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const storyId = req.params.id;
    const { budget_limit } = req.body;

    // Validate: must be a positive integer or null
    if (budget_limit !== null && budget_limit !== undefined) {
      if (typeof budget_limit !== 'number' || !Number.isInteger(budget_limit) || budget_limit <= 0) {
        res.status(400).json({ error: 'budget_limit must be a positive integer or null' });
        return;
      }
    }

    // Upsert into story_budgets
    await pool.query(
      `INSERT INTO story_budgets (story_id, budget_limit, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (story_id) DO UPDATE SET budget_limit = $2, updated_at = NOW()`,
      [storyId, budget_limit ?? null],
    );

    res.json({ story_id: storyId, budget_limit: budget_limit ?? null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/stories/:id/artifacts/auto-pack — greedy knapsack artifact selection */
storiesRouter.post('/api/stories/:id/artifacts/auto-pack', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const storyId = req.params.id;
    const { budget } = req.body;

    // Validate budget
    if (budget === undefined || budget === null || typeof budget !== 'number' || !Number.isInteger(budget) || budget <= 0) {
      res.status(400).json({ error: 'budget must be a positive integer' });
      return;
    }

    // Fetch non-superseded artifacts for story
    const { rows: artifacts } = await pool.query(
      `SELECT id, token_count_full AS token_count, relevance_score
       FROM context_artifacts
       WHERE story_id = $1 AND superseded = 0`,
      [storyId],
    );

    if (artifacts.length === 0) {
      // Check if story exists at all by checking any artifacts (including superseded)
      const { rows: anyArtifacts } = await pool.query(
        'SELECT 1 FROM context_artifacts WHERE story_id = $1 LIMIT 1',
        [storyId],
      );
      if (anyArtifacts.length === 0) {
        res.status(404).json({ error: 'Story not found' });
        return;
      }
      // Story exists but no active artifacts
      res.json({
        selected_artifact_ids: [],
        total_tokens: 0,
        budget,
        artifact_count: 0,
      });
      return;
    }

    // Compute ratio and sort descending; skip artifacts with token_count = 0
    const withRatio = artifacts
      .map((a: any) => ({
        id: a.id,
        token_count: parseInt(a.token_count, 10) || 0,
        relevance_score: parseFloat(a.relevance_score) || 0,
      }))
      .filter((a: any) => a.token_count > 0)
      .map((a: any) => ({
        ...a,
        ratio: a.relevance_score / a.token_count,
      }))
      .sort((a: any, b: any) => b.ratio - a.ratio);

    // Greedy selection
    const selected: string[] = [];
    let totalTokens = 0;
    for (const artifact of withRatio) {
      if (totalTokens + artifact.token_count <= budget) {
        selected.push(artifact.id);
        totalTokens += artifact.token_count;
      }
    }

    res.json({
      selected_artifact_ids: selected,
      total_tokens: totalTokens,
      budget,
      artifact_count: selected.length,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/stories/:id/dispatch — dispatch story with selected artifacts */
storiesRouter.post('/api/stories/:id/dispatch', async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const storyId = req.params.id;
    const { artifact_ids, token_budget } = req.body;

    // Validate artifact_ids is a non-empty array
    if (!Array.isArray(artifact_ids) || artifact_ids.length === 0) {
      res.status(400).json({ error: 'artifact_ids must be a non-empty array' });
      return;
    }

    // Validate token_budget is a positive number if provided
    if (token_budget !== undefined && (typeof token_budget !== 'number' || token_budget <= 0)) {
      res.status(400).json({ error: 'token_budget must be a positive number' });
      return;
    }

    // Check story has artifacts (acts as story existence check)
    const { rows: storyCheck } = await pool.query(
      'SELECT 1 FROM context_artifacts WHERE story_id = $1 LIMIT 1',
      [storyId],
    );
    if (storyCheck.length === 0) {
      res.status(404).json({ error: 'Story not found' });
      return;
    }

    // Validate all artifact_ids belong to this story and are not superseded
    const { rows: validArtifacts } = await pool.query(
      `SELECT id, token_count_full AS token_count
       FROM context_artifacts
       WHERE story_id = $1 AND id = ANY($2) AND superseded = 0`,
      [storyId, artifact_ids],
    );

    const validIds = new Set(validArtifacts.map((a: any) => a.id));
    const invalidIds = artifact_ids.filter((id: string) => !validIds.has(id));
    if (invalidIds.length > 0) {
      res.status(422).json({
        error: 'One or more artifact IDs not found or superseded',
        invalid_ids: invalidIds,
      });
      return;
    }

    const totalTokens = validArtifacts.reduce(
      (sum: number, a: any) => sum + (parseInt(a.token_count, 10) || 0),
      0,
    );

    res.json({
      story_id: storyId,
      dispatched: true,
      artifact_count: validArtifacts.length,
      total_tokens: totalTokens,
      token_budget: token_budget || null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
