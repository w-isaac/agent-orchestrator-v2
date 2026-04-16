import { execFileSync } from 'child_process';

const cwd = '/tmp/worktree-aov-44';

function run(cmd, args, opts = {}) {
  console.log(`\n>>> ${cmd} ${args.join(' ')}`);
  try {
    const out = execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe', ...opts });
    console.log(out);
    return out;
  } catch (e) {
    console.log('STDOUT:', e.stdout);
    console.error('STDERR:', e.stderr);
    console.error('Exit code:', e.status);
    return e.stdout || '';
  }
}

// Git status
run('git', ['status']);

// Stage files
run('git', ['add',
  'src/migrations/042_context_graph_nodes.sql',
  'src/ws/broadcaster.ts',
  'src/routes/context-graph.ts',
  'src/routes/context-graph.test.ts',
  'src/routes/index.ts',
  'src/app.ts',
  '.edison-progress.md',
]);

// Commit
run('git', ['commit', '-m', 'feat(AOV-44): Context graph: PATCH and DELETE node endpoints with cascade and WebSocket broadcasts\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>']);

// Run tests
run('npx', ['vitest', 'run', 'src/routes/context-graph.test.ts'], { timeout: 60000 });
