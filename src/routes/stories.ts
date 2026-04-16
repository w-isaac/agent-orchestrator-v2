import { Router, Request, Response } from 'express';
import { getPool } from '../lib/db';

export const storiesRouter = Router();

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

    if (artifacts.length === 0) {
      // Check if story has any artifacts at all (including superseded)
      const { rows: anyArtifacts } = await pool.query(
        'SELECT 1 FROM context_artifacts WHERE story_id = $1 LIMIT 1',
        [storyId],
      );
      // Return empty list regardless — story may simply have no artifacts
      res.json({
        artifacts: [],
        summary: { artifact_count: 0, total_tokens: 0 },
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
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
