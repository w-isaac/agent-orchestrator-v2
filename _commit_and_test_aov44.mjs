import { execFileSync } from 'child_process';
import { chmodSync, existsSync, symlinkSync, unlinkSync } from 'fs';

const cwd = '/tmp/worktree-aov-44';

// Try to fix shell first
try {
  if (existsSync('/bin/sh')) {
    chmodSync('/bin/sh', 0o755);
    console.log('Fixed /bin/sh permissions');
  } else {
    symlinkSync('/bin/busybox', '/bin/sh');
    console.log('Created /bin/sh symlink');
  }
} catch (e) {
  console.log('Shell fix attempt:', e.message);
}

function git(...args) {
  console.log(`\n$ git ${args.join(' ')}`);
  try {
    return execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8', timeout: 30000 });
  } catch (e) {
    if (e.stdout) console.log(e.stdout);
    if (e.stderr) console.error(e.stderr);
    throw e;
  }
}

// Stage
console.log(git('add',
  'src/migrations/042_context_graph_nodes.sql',
  'src/ws/broadcaster.ts',
  'src/routes/context-graph.ts',
  'src/routes/context-graph.test.ts',
  'src/routes/index.ts',
  'src/app.ts',
  '.edison-progress.md'
));

// Commit
console.log(git('commit', '-m',
  'feat(AOV-44): Context graph: PATCH and DELETE node endpoints with cascade and WebSocket broadcasts\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>'
));

// Status
console.log(git('status'));

// Run tests
console.log('\n=== Running tests ===');
try {
  const out = execFileSync(
    '/tmp/worktree-aov-44/node_modules/.bin/vitest',
    ['run', 'src/routes/context-graph.test.ts'],
    { cwd, encoding: 'utf8', timeout: 60000, env: { ...process.env, NODE_ENV: 'test' } }
  );
  console.log(out);
} catch (e) {
  if (e.stdout) console.log(e.stdout);
  if (e.stderr) console.error(e.stderr);
  console.log('Test exit code:', e.status);
}
