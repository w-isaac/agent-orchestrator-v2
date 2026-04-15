import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAll = vi.fn();
const mockClose = vi.fn();

vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn(() => ({
      prepare: vi.fn(() => ({ all: mockAll })),
      close: mockClose,
    })),
  };
});

import { SqliteReader } from './sqlite-reader';

describe('SqliteReader', () => {
  let reader: SqliteReader;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAll.mockReturnValue([]);
    reader = new SqliteReader('/fake/path.db');
  });

  describe('readProjects', () => {
    it('returns project rows from SQLite', () => {
      const rows = [{ id: 'p1', name: 'Project 1' }];
      mockAll.mockReturnValueOnce(rows);
      expect(reader.readProjects()).toEqual(rows);
    });

    it('returns empty array when table is empty', () => {
      mockAll.mockReturnValueOnce([]);
      expect(reader.readProjects()).toEqual([]);
    });
  });

  describe('readStories', () => {
    it('returns story rows from SQLite', () => {
      const rows = [{ id: 's1', project_id: 'p1', title: 'Story', status: 'queued' }];
      mockAll.mockReturnValueOnce(rows);
      expect(reader.readStories()).toEqual(rows);
    });
  });

  describe('readAgentRuns', () => {
    it('returns agent_run rows from SQLite', () => {
      const rows = [{ id: 'r1', story_id: 's1', project_id: 'p1' }];
      mockAll.mockReturnValueOnce(rows);
      expect(reader.readAgentRuns()).toEqual(rows);
    });
  });

  describe('readStages', () => {
    it('returns stage rows when pipeline_stages table exists', () => {
      const rows = [{ id: 'st1' }];
      mockAll.mockReturnValueOnce(rows);
      expect(reader.readStages()).toEqual(rows);
    });

    it('returns empty array when pipeline_stages table does not exist', () => {
      mockAll.mockImplementationOnce(() => { throw new Error('no such table: pipeline_stages'); });
      expect(reader.readStages()).toEqual([]);
    });
  });

  describe('close', () => {
    it('closes the database', () => {
      reader.close();
      expect(mockClose).toHaveBeenCalledOnce();
    });
  });
});
