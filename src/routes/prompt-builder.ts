import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';
import {
  buildPrompt,
  computeBudget,
  assignTier,
  ContextArtifact,
  Tier,
} from '../services/promptBuilder';
import { countTokens } from '../services/ingestion/tokenCounter';

export const promptBuilderRouter = Router();

// Helper: load artifacts from DB
async function loadArtifacts(storyId: string): Promise<ContextArtifact[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, title, full_content, summary, one_liner,
            relevance_score, token_count_full, token_count_summary, token_count_oneliner
     FROM context_artifacts WHERE story_id = $1
     ORDER BY relevance_score DESC`,
    [storyId],
  );
  return rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    fullContent: r.full_content,
    summary: r.summary,
    oneLiner: r.one_liner,
    relevanceScore: parseFloat(r.relevance_score),
    tokenCountFull: r.token_count_full,
    tokenCountSummary: r.token_count_summary,
    tokenCountOneliner: r.token_count_oneliner,
  }));
}

// Helper: load tier overrides
async function loadOverrides(storyId: string): Promise<Map<string, Tier>> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ato.artifact_id, ato.tier
     FROM artifact_tier_overrides ato
     JOIN context_artifacts ca ON ca.id = ato.artifact_id
     WHERE ca.story_id = $1`,
    [storyId],
  );
  const map = new Map<string, Tier>();
  for (const r of rows) {
    map.set(r.artifact_id, r.tier as Tier);
  }
  return map;
}

// GET /:storyId/artifacts — artifacts with auto-assigned tiers
promptBuilderRouter.get('/api/prompt-builder/:storyId/artifacts', async (req: Request, res: Response) => {
  try {
    const artifacts = await loadArtifacts(req.params.storyId);
    const overrides = await loadOverrides(req.params.storyId);
    const data = artifacts.map((a) => ({
      ...a,
      assignedTier: overrides.get(a.id) || assignTier(a.relevanceScore),
      hasOverride: overrides.has(a.id),
    }));
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /:storyId/budget — budget allocation breakdown
promptBuilderRouter.get('/api/prompt-builder/:storyId/budget', async (req: Request, res: Response) => {
  try {
    const tokenBudget = parseInt(req.query.token_budget as string, 10) || 8192;
    const budget = computeBudget(tokenBudget);
    res.json({ data: budget });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /:storyId/build — assemble + persist prompt
promptBuilderRouter.post('/api/prompt-builder/:storyId/build', async (req: Request, res: Response) => {
  try {
    const { task_text, constraints_text, token_budget, template_id } = req.body;
    const storyId = req.params.storyId;
    const totalBudget = token_budget || 8192;

    const artifacts = await loadArtifacts(storyId);
    const overrides = await loadOverrides(storyId);

    const result = buildPrompt(
      task_text || '',
      constraints_text || '',
      artifacts,
      totalBudget,
      overrides,
    );

    if (result.overBudget) {
      res.status(422).json({ error: 'Token budget exceeded', data: result });
      return;
    }

    // Persist the build
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO prompt_builds (story_id, template_id, total_token_budget, total_tokens_used,
         task_section, context_section, constraints_section, assembled_prompt, budget_breakdown)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at`,
      [
        storyId,
        template_id || null,
        totalBudget,
        result.tokensUsed.total,
        result.sections.task,
        result.sections.context,
        result.sections.constraints,
        result.prompt,
        JSON.stringify(result.budget),
      ],
    );

    res.json({ data: { id: rows[0].id, created_at: rows[0].created_at, ...result } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /:storyId/preview — assemble without persisting
promptBuilderRouter.post('/api/prompt-builder/:storyId/preview', async (req: Request, res: Response) => {
  try {
    const { task_text, constraints_text, token_budget } = req.body;
    const storyId = req.params.storyId;
    const totalBudget = token_budget || 8192;

    const artifacts = await loadArtifacts(storyId);
    const overrides = await loadOverrides(storyId);

    const result = buildPrompt(
      task_text || '',
      constraints_text || '',
      artifacts,
      totalBudget,
      overrides,
    );

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /artifacts/:artifactId/override — manual tier overrides
promptBuilderRouter.patch('/api/prompt-builder/artifacts/:artifactId/override', async (req: Request, res: Response) => {
  try {
    const { tier } = req.body;
    const validTiers: Tier[] = ['full', 'summary', 'one-liner'];
    if (!tier || !validTiers.includes(tier)) {
      res.status(400).json({ error: `tier must be one of: ${validTiers.join(', ')}` });
      return;
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO artifact_tier_overrides (artifact_id, tier)
       VALUES ($1, $2)
       ON CONFLICT (artifact_id) DO UPDATE SET tier = $2, created_at = NOW()
       RETURNING id`,
      [req.params.artifactId, tier],
    );

    res.json({ data: { id: rows[0].id, artifact_id: req.params.artifactId, tier } });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /templates — list prompt templates
promptBuilderRouter.get('/api/prompt-builder/templates', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, name, task_template, context_template, constraints_template, created_at, updated_at FROM prompt_templates ORDER BY name',
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
