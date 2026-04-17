import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  snapshotArtifacts,
  classifyArtifactConflicts,
  classifyWithContent,
} from './artifactSnapshot';
import { computeContentHash } from './conflictClassifier';

function createMockPool() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

describe('artifactSnapshot', () => {
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = createMockPool();
  });

  describe('snapshotArtifacts', () => {
    it('inserts one task_snapshots row per artifact at task start', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 's1',
              task_id: 't1',
              artifact_id: 'a1',
              content_hash: computeContentHash('alpha'),
              snapshot_at: '2026-04-17T00:00:00Z',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 's2',
              task_id: 't1',
              artifact_id: 'a2',
              content_hash: computeContentHash('beta'),
              snapshot_at: '2026-04-17T00:00:00Z',
            },
          ],
        });

      const rows = await snapshotArtifacts(pool as any, 't1', [
        { artifact_id: 'a1', content: 'alpha' },
        { artifact_id: 'a2', content: 'beta' },
      ]);

      expect(rows).toHaveLength(2);
      expect(pool.query).toHaveBeenCalledTimes(2);

      const firstCall = pool.query.mock.calls[0];
      expect(firstCall[0]).toContain('INSERT INTO task_snapshots');
      expect(firstCall[1][1]).toBe('t1');
      expect(firstCall[1][2]).toBe('a1');
      expect(firstCall[1][3]).toBe(computeContentHash('alpha'));
    });

    it('returns empty array when no artifacts to snapshot', async () => {
      const rows = await snapshotArtifacts(pool as any, 't1', []);
      expect(rows).toEqual([]);
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('classifyArtifactConflicts', () => {
    it('returns no_conflict for unchanged artifacts and logs to conflict_log', async () => {
      const original = computeContentHash('alpha');
      pool.query
        .mockResolvedValueOnce({
          rows: [{ artifact_id: 'a1', content_hash: original }],
        })
        .mockResolvedValueOnce({ rows: [] }); // insert into conflict_log

      const result = await classifyArtifactConflicts(pool as any, 't1', [
        { artifact_id: 'a1', content: 'alpha' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].classification).toBe('no_conflict');
      expect(result[0].artifact_id).toBe('a1');

      const insertCall = pool.query.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO conflict_log');
      expect(insertCall[1][1]).toBe('t1');
      expect(insertCall[1][2]).toBe('a1');
      expect(insertCall[1][3]).toBe('no_conflict');
    });

    it('classifies as incompatible when content diverges', async () => {
      pool.query
        .mockResolvedValueOnce({
          rows: [{ artifact_id: 'a1', content_hash: computeContentHash('alpha') }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await classifyArtifactConflicts(pool as any, 't1', [
        { artifact_id: 'a1', content: 'totally different' },
      ]);

      expect(result[0].classification).toBe('incompatible');
      expect(pool.query.mock.calls[1][1][3]).toBe('incompatible');
    });

    it('skips artifacts with no prior snapshot', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] }); // no snapshots

      const result = await classifyArtifactConflicts(pool as any, 't1', [
        { artifact_id: 'unseen', content: 'x' },
      ]);

      expect(result).toEqual([]);
      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('classifyWithContent', () => {
    it('produces all four classifications based on snapshot+current content', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const result = await classifyWithContent(pool as any, 't1', [
        {
          artifact_id: 'a1',
          snapshot_content: 'same',
          current_content: 'same',
          snapshot_type: 'code',
          current_type: 'code',
        },
        {
          artifact_id: 'a2',
          snapshot_content: 'old',
          current_content: 'new',
          snapshot_type: 'code',
          current_type: 'doc',
        },
        {
          artifact_id: 'a3',
          snapshot_content: 'foo',
          current_content: 'foo bar',
          snapshot_type: 'code',
          current_type: 'code',
        },
        {
          artifact_id: 'a4',
          snapshot_content: 'foo',
          current_content: 'baz',
          snapshot_type: 'code',
          current_type: 'code',
        },
      ]);

      expect(result.map((r) => r.classification)).toEqual([
        'no_conflict',
        'non_overlapping',
        'compatible',
        'incompatible',
      ]);

      // 4 conflict_log inserts (one per artifact)
      const insertCalls = pool.query.mock.calls.filter((c: any[]) =>
        String(c[0]).includes('INSERT INTO conflict_log'),
      );
      expect(insertCalls).toHaveLength(4);
    });
  });
});
