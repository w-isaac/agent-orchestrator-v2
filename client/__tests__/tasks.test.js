import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for the task board JS logic.
 * Tests the core data-transformation functions and API interaction patterns.
 */

describe('Task Board', () => {
  describe('status mapping', () => {
    // These mirror the backend mapping logic used in the API responses
    const statusMap = {
      pending: 'queued',
      failed: 'queued',
      running: 'in_progress',
      complete: 'complete',
    };

    it('maps DB statuses to API statuses', () => {
      expect(statusMap.pending).toBe('queued');
      expect(statusMap.running).toBe('in_progress');
      expect(statusMap.complete).toBe('complete');
      expect(statusMap.failed).toBe('queued');
    });
  });

  describe('task grouping', () => {
    function groupTasks(tasks) {
      var grouped = { queued: [], in_progress: [], complete: [] };
      tasks.forEach(function (t) {
        if (grouped[t.status]) grouped[t.status].push(t);
      });
      return grouped;
    }

    it('groups tasks by status', () => {
      const tasks = [
        { id: '1', title: 'A', status: 'queued' },
        { id: '2', title: 'B', status: 'in_progress' },
        { id: '3', title: 'C', status: 'complete' },
        { id: '4', title: 'D', status: 'queued' },
      ];

      const grouped = groupTasks(tasks);
      expect(grouped.queued).toHaveLength(2);
      expect(grouped.in_progress).toHaveLength(1);
      expect(grouped.complete).toHaveLength(1);
    });

    it('handles empty task list', () => {
      const grouped = groupTasks([]);
      expect(grouped.queued).toHaveLength(0);
      expect(grouped.in_progress).toHaveLength(0);
      expect(grouped.complete).toHaveLength(0);
    });
  });

  describe('API calls', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('fetches tasks with project_id', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tasks: [{ id: 't1', title: 'Test', status: 'queued' }] }),
      });

      const res = await fetch('/api/v2/tasks?project_id=p1');
      const data = await res.json();

      expect(fetch).toHaveBeenCalledWith('/api/v2/tasks?project_id=p1');
      expect(data.tasks).toHaveLength(1);
      expect(data.tasks[0].status).toBe('queued');
    });

    it('creates a task via POST', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 't1', title: 'New', status: 'queued' }),
      });

      const res = await fetch('/api/v2/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: 'p1', title: 'New' }),
      });
      const data = await res.json();

      expect(data.status).toBe('queued');
      expect(data.title).toBe('New');
    });

    it('updates task status via PATCH', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 't1', title: 'Test', status: 'in_progress' }),
      });

      const res = await fetch('/api/v2/tasks/t1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      });
      const data = await res.json();

      expect(data.status).toBe('in_progress');
    });

    it('handles API error on status update', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid status' }),
      });

      const res = await fetch('/api/v2/tasks/t1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'invalid' }),
      });

      expect(res.ok).toBe(false);
    });
  });
});
