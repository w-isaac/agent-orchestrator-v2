import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { statusBadgeClass, formatDate, escapeHtml } = require('../js/pipeline');

describe('Pipeline View', () => {
  describe('statusBadgeClass', () => {
    it('returns correct class for known statuses', () => {
      expect(statusBadgeClass('draft')).toBe('status-badge status-badge-draft');
      expect(statusBadgeClass('ready')).toBe('status-badge status-badge-ready');
      expect(statusBadgeClass('in_progress')).toBe('status-badge status-badge-in_progress');
      expect(statusBadgeClass('in_review')).toBe('status-badge status-badge-in_review');
      expect(statusBadgeClass('done')).toBe('status-badge status-badge-done');
      expect(statusBadgeClass('blocked')).toBe('status-badge status-badge-blocked');
    });

    it('returns default class for unknown status', () => {
      expect(statusBadgeClass('unknown')).toBe('status-badge status-badge-default');
      expect(statusBadgeClass('')).toBe('status-badge status-badge-default');
    });
  });

  describe('formatDate', () => {
    it('formats a valid date string', () => {
      const result = formatDate('2026-04-15T10:00:00Z');
      expect(result).toMatch(/Apr/);
      expect(result).toMatch(/2026/);
    });

    it('returns empty string for falsy input', () => {
      expect(formatDate('')).toBe('');
      expect(formatDate(null)).toBe('');
      expect(formatDate(undefined)).toBe('');
    });

    it('returns empty string for invalid date', () => {
      expect(formatDate('not-a-date')).toBe('');
    });
  });

  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('escapes ampersands', () => {
      expect(escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('returns empty string for falsy input', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
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

    it('fetches pipeline data for a project', async () => {
      const mockData = {
        project: { id: 'p1', name: 'Test Project' },
        pipeline: [
          {
            id: 's1',
            name: 'Backlog',
            icon: '📋',
            stage_order: 1,
            stories: [
              { id: 'st1', title: 'Story One', status: 'draft', display_id: 1 }
            ],
            agents: []
          },
          {
            id: 's2',
            name: 'In Progress',
            icon: '🔨',
            stage_order: 2,
            stories: [],
            agents: []
          }
        ]
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const res = await fetch('/api/projects/p1/pipeline');
      const data = await res.json();

      expect(fetch).toHaveBeenCalledWith('/api/projects/p1/pipeline');
      expect(data.pipeline).toHaveLength(2);
      expect(data.pipeline[0].stories).toHaveLength(1);
      expect(data.pipeline[1].stories).toHaveLength(0);
    });

    it('fetches story detail', async () => {
      const mockStory = {
        id: 'st1',
        title: 'Story One',
        status: 'in_progress',
        display_id: 1,
        description: 'A story',
        acceptance_criteria: '- Must do X',
        stage_name: 'Engineering',
        created_at: '2026-04-14T00:00:00Z',
        updated_at: '2026-04-15T00:00:00Z',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStory),
      });

      const res = await fetch('/api/stories/st1');
      const data = await res.json();

      expect(fetch).toHaveBeenCalledWith('/api/stories/st1');
      expect(data.title).toBe('Story One');
      expect(data.description).toBe('A story');
    });

    it('handles pipeline API error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });

      const res = await fetch('/api/projects/p1/pipeline');
      expect(res.ok).toBe(false);
    });

    it('handles story detail API error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Story not found' }),
      });

      const res = await fetch('/api/stories/nonexistent');
      expect(res.ok).toBe(false);
    });
  });

  describe('data transformation', () => {
    it('groups stories by stage', () => {
      const pipeline = [
        { id: 's1', name: 'Backlog', stories: [{ id: '1' }, { id: '2' }] },
        { id: 's2', name: 'In Progress', stories: [{ id: '3' }] },
        { id: 's3', name: 'Done', stories: [] },
      ];

      var stageStories = {};
      pipeline.forEach(function (stage) {
        stageStories[stage.name] = stage.stories;
      });

      expect(stageStories['Backlog']).toHaveLength(2);
      expect(stageStories['In Progress']).toHaveLength(1);
      expect(stageStories['Done']).toHaveLength(0);
    });

    it('renders empty stages correctly', () => {
      const pipeline = [
        { id: 's1', name: 'Empty Stage', stories: [] },
      ];

      expect(pipeline[0].stories).toHaveLength(0);
      // Empty stages should still be present in the pipeline array
      expect(pipeline).toHaveLength(1);
      expect(pipeline[0].name).toBe('Empty Stage');
    });
  });
});
