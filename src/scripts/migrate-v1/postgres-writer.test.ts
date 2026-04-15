import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pg before importing the writer
vi.mock('pg', () => {
  const mockQuery = vi.fn();
  const mockEnd = vi.fn();
  return {
    Pool: vi.fn(() => ({
      query: mockQuery,
      end: mockEnd,
    })),
    __mockQuery: mockQuery,
    __mockEnd: mockEnd,
  };
});

import { PostgresWriter } from './postgres-writer';
import * as pgModule from 'pg';

const { __mockQuery: mockQuery, __mockEnd: mockEnd } = pgModule as unknown as {
  __mockQuery: ReturnType<typeof vi.fn>;
  __mockEnd: ReturnType<typeof vi.fn>;
};

describe('PostgresWriter', () => {
  let writer: PostgresWriter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rowCount: 1 });
    writer = new PostgresWriter('postgresql://localhost/test');
  });

  describe('upsertProjects', () => {
    it('upserts all rows and returns count', async () => {
      const rows = [
        { id: 'p1', name: 'Project 1', created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 'p2', name: 'Project 2', created_at: '2024-01-01', updated_at: '2024-01-01' },
      ];
      const result = await writer.upsertProjects(rows);
      expect(result.upserted).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('records failures without throwing', async () => {
      mockQuery.mockRejectedValueOnce(new Error('duplicate key'));
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      const rows = [
        { id: 'p1', name: 'Bad' },
        { id: 'p2', name: 'Good' },
      ];
      const result = await writer.upsertProjects(rows);
      expect(result.upserted).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toEqual({ id: 'p1', error: 'duplicate key' });
    });

    it('parses settings from JSON string', async () => {
      const rows = [{ id: 'p1', name: 'P', settings: '{"key":"val"}', created_at: '2024-01-01', updated_at: '2024-01-01' }];
      await writer.upsertProjects(rows);
      const callArgs = mockQuery.mock.calls[0][1];
      expect(callArgs[6]).toBe('{"key":"val"}');
    });
  });

  describe('upsertTasks', () => {
    it('upserts task rows from mapped stories', async () => {
      const rows = [
        { id: 't1', project_id: 'p1', title: 'Task 1', status: 'running', created_at: '2024-01-01', updated_at: '2024-01-01' },
      ];
      const result = await writer.upsertTasks(rows);
      expect(result.upserted).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('isolates per-record errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('FK violation'));
      const rows = [{ id: 't1', project_id: 'bad', title: 'T', status: 'queued' }];
      const result = await writer.upsertTasks(rows);
      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toBe('FK violation');
    });
  });

  describe('upsertTaskResults', () => {
    it('upserts task result rows from mapped agent runs', async () => {
      const rows = [
        { id: 'r1', task_id: 't1', project_id: 'p1', agent_role: 'architect', status: 'completed' },
        { id: 'r2', task_id: 't1', project_id: 'p1', agent_role: 'coder', status: 'running' },
      ];
      const result = await writer.upsertTaskResults(rows);
      expect(result.upserted).toBe(2);
      expect(result.failed).toBe(0);
    });
  });

  describe('close', () => {
    it('ends the pool', async () => {
      await writer.close();
      expect(mockEnd).toHaveBeenCalledOnce();
    });
  });
});
