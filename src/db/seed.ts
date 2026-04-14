import { getPool } from '../lib/db';

function generateDeterministicEmbedding(seed: number): number[] {
  const embedding: number[] = [];
  let value = seed;
  for (let i = 0; i < 1536; i++) {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    embedding.push((value / 0x7fffffff) * 2 - 1);
  }
  // Normalize to unit vector
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return embedding.map((v) => v / magnitude);
}

export async function seed(): Promise<void> {
  const pool = getPool();

  const projectId = '10000000-0000-0000-0000-000000000001';
  const nodeIds = [
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000005',
  ];
  const taskIds = [
    '30000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Project
    await client.query(
      `INSERT INTO projects (id, name, description) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [projectId, 'Demo Project', 'Seed project for local development and testing'],
    );

    // Context nodes with embeddings
    const nodeData = [
      { id: nodeIds[0], type: 'file', metadata: { path: 'src/index.ts', language: 'typescript' }, seed: 1 },
      { id: nodeIds[1], type: 'file', metadata: { path: 'src/app.ts', language: 'typescript' }, seed: 2 },
      { id: nodeIds[2], type: 'function', metadata: { name: 'main', file: 'src/index.ts' }, seed: 3 },
      { id: nodeIds[3], type: 'concept', metadata: { name: 'database schema', domain: 'backend' }, seed: 4 },
      { id: nodeIds[4], type: 'function', metadata: { name: 'createPool', file: 'src/lib/db.ts' }, seed: 5 },
    ];

    for (const node of nodeData) {
      const embedding = generateDeterministicEmbedding(node.seed);
      await client.query(
        `INSERT INTO context_nodes (id, project_id, type, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [node.id, projectId, node.type, JSON.stringify(node.metadata), `[${embedding.join(',')}]`],
      );
    }

    // Context edges
    const edgeData = [
      { source: nodeIds[0], target: nodeIds[2], type: 'contains' },
      { source: nodeIds[0], target: nodeIds[1], type: 'imports' },
      { source: nodeIds[2], target: nodeIds[4], type: 'calls' },
      { source: nodeIds[1], target: nodeIds[4], type: 'imports' },
      { source: nodeIds[3], target: nodeIds[4], type: 'depends_on' },
      { source: nodeIds[3], target: nodeIds[0], type: 'depends_on' },
    ];

    for (const edge of edgeData) {
      await client.query(
        `INSERT INTO context_edges (source_id, target_id, type)
         VALUES ($1, $2, $3)`,
        [edge.source, edge.target, edge.type],
      );
    }

    // Tasks
    await client.query(
      `INSERT INTO tasks (id, project_id, type, status) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [taskIds[0], projectId, 'analysis', 'complete'],
    );
    await client.query(
      `INSERT INTO tasks (id, project_id, type, status) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [taskIds[1], projectId, 'indexing', 'pending'],
    );

    // Task results
    await client.query(
      `INSERT INTO task_results (task_id, payload, stdout, stderr)
       VALUES ($1, $2, $3, $4)`,
      [taskIds[0], JSON.stringify({ files_analyzed: 3 }), 'Analysis complete', ''],
    );

    // Task snapshots
    await client.query(
      `INSERT INTO task_snapshots (task_id, data)
       VALUES ($1, $2)`,
      [taskIds[0], JSON.stringify({ progress: 100, step: 'done' })],
    );

    await client.query('COMMIT');
    console.log('Seed data inserted successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run directly
if (require.main === module) {
  import('../lib/config').then(({ validateEnv }) => {
    validateEnv();
    import('../lib/db').then(({ createPool }) => {
      createPool();
      seed()
        .then(() => process.exit(0))
        .catch((err) => {
          console.error('Seed failed:', err);
          process.exit(1);
        });
    });
  });
}
