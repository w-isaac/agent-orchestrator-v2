import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMigrations } from './migrations';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs');
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return { ...actual, resolve: vi.fn((p: string) => p) };
});

const mockedFs = vi.mocked(fs);
const mockedPath = vi.mocked(path);

function createMockPool() {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue(mockClient),
  };
  return { mockPool, mockClient };
}

describe('runMigrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('applies pending migrations in order', async () => {
    const { mockPool, mockClient } = createMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
      .mockResolvedValueOnce({ rows: [] }); // SELECT applied

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readdirSync.mockReturnValue(['001_init.sql', '002_add_table.sql'] as any);
    mockedFs.readFileSync.mockReturnValueOnce('CREATE TABLE a;').mockReturnValueOnce('CREATE TABLE b;');

    await runMigrations(mockPool as any, 'migrations');

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('CREATE TABLE a;');
    expect(mockClient.query).toHaveBeenCalledWith('INSERT INTO schema_migrations (filename) VALUES ($1)', ['001_init.sql']);
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(2);
  });

  it('skips already-applied migrations', async () => {
    const { mockPool, mockClient } = createMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
      .mockResolvedValueOnce({ rows: [{ filename: '001_init.sql' }] }); // Already applied

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readdirSync.mockReturnValue(['001_init.sql', '002_add_table.sql'] as any);
    mockedFs.readFileSync.mockReturnValueOnce('CREATE TABLE b;');

    await runMigrations(mockPool as any, 'migrations');

    // Only one migration should be applied (002)
    expect(mockClient.query).toHaveBeenCalledWith('INSERT INTO schema_migrations (filename) VALUES ($1)', ['002_add_table.sql']);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and throws on migration error', async () => {
    const { mockPool, mockClient } = createMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readdirSync.mockReturnValue(['001_bad.sql'] as any);
    mockedFs.readFileSync.mockReturnValueOnce('INVALID SQL;');

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('syntax error')) // SQL exec
      .mockResolvedValueOnce({}); // ROLLBACK

    await expect(runMigrations(mockPool as any, 'migrations')).rejects.toThrow('syntax error');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('logs up to date when no pending migrations', async () => {
    const { mockPool } = createMockPool();
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ filename: '001_init.sql' }] });

    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readdirSync.mockReturnValue(['001_init.sql'] as any);

    await runMigrations(mockPool as any, 'migrations');

    expect(console.log).toHaveBeenCalledWith('\u2713 All migrations up to date');
  });
});
