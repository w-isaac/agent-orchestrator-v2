import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/db', () => ({
  getPool: vi.fn(),
}));

import { deriveEdges } from './edgeDerivation';

function createMockClient() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
}

function createMockPool(client: ReturnType<typeof createMockClient>) {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue(client),
  };
}

const JOB_ID = 'job-123';
const ARTIFACT_ID = 'artifact-456';

describe('deriveEdges', () => {
  let client: ReturnType<typeof createMockClient>;
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockClient();
    pool = createMockPool(client);
  });

  it('creates an ingestion job and returns completed', async () => {
    // Job insert
    client.query
      .mockResolvedValueOnce({ rows: [{ id: JOB_ID }] }) // INSERT ingestion_jobs
      .mockResolvedValueOnce({ rows: [{ id: ARTIFACT_ID, type: 'file', metadata: { content: '', path: '' }, project_id: 'p1' }] }) // SELECT artifact
      .mockResolvedValue({ rows: [] }); // All subsequent queries

    const result = await deriveEdges(pool as any, ARTIFACT_ID);

    expect(result.job_id).toBe(JOB_ID);
    expect(result.status).toBe('completed');
    expect(client.release).toHaveBeenCalled();
  });

  it('marks job as failed when artifact not found', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: JOB_ID }] }) // INSERT ingestion_jobs
      .mockResolvedValueOnce({ rows: [] }) // SELECT artifact - not found
      .mockResolvedValue({ rows: [] });

    const result = await deriveEdges(pool as any, ARTIFACT_ID);

    expect(result.status).toBe('failed');
  });

  it('broadcasts events during derivation', async () => {
    const broadcast = vi.fn();

    client.query
      .mockResolvedValueOnce({ rows: [{ id: JOB_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: ARTIFACT_ID, type: 'file', metadata: { content: '', path: '' }, project_id: 'p1' }] })
      .mockResolvedValue({ rows: [] });

    await deriveEdges(pool as any, ARTIFACT_ID, undefined, broadcast);

    expect(broadcast).toHaveBeenCalledWith('ingestion:started', expect.objectContaining({ job_id: JOB_ID }));
    expect(broadcast).toHaveBeenCalledWith('ingestion:completed', expect.objectContaining({ job_id: JOB_ID }));
  });

  it('creates depends_on edges from import parsing', async () => {
    const code = `import { foo } from './bar';`;
    client.query
      .mockResolvedValueOnce({ rows: [{ id: JOB_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: ARTIFACT_ID, type: 'file', metadata: { content: code, path: '/src/index.ts' }, project_id: 'p1' }] })
      // deriveImportEdges: SELECT artifacts
      .mockResolvedValueOnce({ rows: [{ id: 'target-1', path: '/src/bar.ts' }] })
      // upsertEdge
      .mockResolvedValueOnce({ rows: [] })
      // updateEdgeTypeStatus
      .mockResolvedValue({ rows: [] });

    const result = await deriveEdges(pool as any, ARTIFACT_ID);
    expect(result.status).toBe('completed');

    // Check that upsert was called with depends_on
    const upsertCall = client.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO graph_edges') && call[1]?.[2] === 'depends_on',
    );
    expect(upsertCall).toBeTruthy();
  });

  it('handles explicit edges with merge', async () => {
    const explicitEdges = [
      { target_id: 'target-1', edge_type: 'depends_on' as const },
    ];

    client.query
      .mockResolvedValueOnce({ rows: [{ id: JOB_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: ARTIFACT_ID, type: 'file', metadata: { content: '', path: '' }, project_id: 'p1' }] })
      .mockResolvedValue({ rows: [] });

    const result = await deriveEdges(pool as any, ARTIFACT_ID, explicitEdges);
    expect(result.status).toBe('completed');

    // Check explicit edge upsert
    const explicitCall = client.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO graph_edges') && call[1]?.[3] === 'explicit',
    );
    expect(explicitCall).toBeTruthy();
  });

  it('releases client even on error', async () => {
    client.query.mockRejectedValueOnce(new Error('DB error'));

    await expect(deriveEdges(pool as any, ARTIFACT_ID)).rejects.toThrow('DB error');
    expect(client.release).toHaveBeenCalled();
  });
});
