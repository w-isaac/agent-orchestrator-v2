import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { formatDryRun, formatSummary, formatProgress, formatErrors, MigrationCounts, ErrorDetail } from './reporter';

describe('reporter', () => {
  const originalEnv = process.env.NO_COLOR;

  beforeEach(() => {
    // Disable color for deterministic output
    process.env.NO_COLOR = '1';
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = originalEnv;
    }
  });

  describe('formatDryRun', () => {
    it('renders correct counts for each entity type', () => {
      const counts: MigrationCounts = {
        projects: { total: 4, upserted: 0, failed: 0 },
        tasks: { total: 27, upserted: 0, failed: 0 },
        taskResults: { total: 142, upserted: 0, failed: 0 },
        stages: { total: 12, dropped: 12 },
      };
      const output = formatDryRun(counts);
      expect(output).toContain('DRY RUN');
      expect(output).toContain('Projects        4 records would be upserted');
      expect(output).toContain('Tasks (stories) 27 records would be upserted');
      expect(output).toContain('Task results    142 records would be upserted');
      expect(output).toContain('Stages          12 records DROPPED');
      expect(output).toContain('No changes made');
    });

    it('renders zero counts for empty database', () => {
      const counts: MigrationCounts = {
        projects: { total: 0, upserted: 0, failed: 0 },
        tasks: { total: 0, upserted: 0, failed: 0 },
        taskResults: { total: 0, upserted: 0, failed: 0 },
        stages: { total: 0, dropped: 0 },
      };
      const output = formatDryRun(counts);
      expect(output).toContain('Projects        0 records would be upserted');
      expect(output).toContain('Stages          0 records DROPPED');
    });
  });

  describe('formatProgress', () => {
    it('shows upserted count without failures', () => {
      const output = formatProgress('projects...', 4, 0);
      expect(output).toContain('Migrating projects...');
      expect(output).toContain('4 upserted');
      expect(output).not.toContain('failed');
    });

    it('shows failures when present', () => {
      const output = formatProgress('task results...', 140, 2);
      expect(output).toContain('140 upserted');
      expect(output).toContain('2 failed');
    });
  });

  describe('formatErrors', () => {
    it('returns empty string when no errors', () => {
      expect(formatErrors([])).toBe('');
    });

    it('lists each error with entity and id', () => {
      const errors: ErrorDetail[] = [
        { entity: 'task', id: 'abc-123', error: 'FK violation' },
        { entity: 'project', id: 'def-456', error: 'duplicate key' },
      ];
      const output = formatErrors(errors);
      expect(output).toContain('Errors:');
      expect(output).toContain('task abc-123: FK violation');
      expect(output).toContain('project def-456: duplicate key');
    });
  });

  describe('formatSummary', () => {
    it('sums totals across entity types', () => {
      const counts: MigrationCounts = {
        projects: { total: 4, upserted: 4, failed: 0 },
        tasks: { total: 10, upserted: 9, failed: 1 },
        taskResults: { total: 20, upserted: 18, failed: 2 },
        stages: { total: 5, dropped: 5 },
      };
      const output = formatSummary(counts, []);
      expect(output).toContain('Migration complete.');
      expect(output).toContain('Total upserted: 31');
      expect(output).toContain('Total failed:   3');
      expect(output).toContain('Stages dropped: 5');
    });

    it('includes error block when errors present', () => {
      const counts: MigrationCounts = {
        projects: { total: 1, upserted: 0, failed: 1 },
        tasks: { total: 0, upserted: 0, failed: 0 },
        taskResults: { total: 0, upserted: 0, failed: 0 },
        stages: { total: 0, dropped: 0 },
      };
      const errors: ErrorDetail[] = [
        { entity: 'project', id: 'x', error: 'boom' },
      ];
      const output = formatSummary(counts, errors);
      expect(output).toContain('Errors:');
      expect(output).toContain('project x: boom');
    });
  });
});
