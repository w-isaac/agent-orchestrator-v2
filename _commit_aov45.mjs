import { execFileSync, spawnSync } from 'child_process';
import { chmodSync, existsSync } from 'fs';

// Try to fix /bin/sh permissions
try {
  if (existsSync('/bin/sh')) {
    chmodSync('/bin/sh', 0o755);
    console.log('Fixed /bin/sh permissions');
  }
} catch (e) {
  console.log('Shell fix attempt:', e.message);
}

const cwd = '/tmp/worktree-aov-45';
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Agent Orchestrator',
  GIT_COMMITTER_NAME: 'Agent Orchestrator',
  GIT_AUTHOR_EMAIL: 'agent@orchestrator.dev',
  GIT_COMMITTER_EMAIL: 'agent@orchestrator.dev',
};

function git(...args) {
  console.log(`$ git ${args.join(' ')}`);
  try {
    const out = execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8', timeout: 30000, env });
    if (out.trim()) console.log(out.trim());
    return out;
  } catch (e) {
    if (e.stdout) console.log(e.stdout);
    if (e.stderr) console.error(e.stderr);
    throw e;
  }
}

// Stage
git('add',
  'src/migrations/044_graph_node_edges.sql',
  'src/routes/context-graph.ts',
  'src/routes/context-graph.test.ts',
  '.edison-progress.md'
);

// Commit
git('commit', '-m',
  'feat(AOV-45): Context graph: edge create, update, delete with validation and WebSocket\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>'
);

// Status
git('status');
git('log', '--oneline', '-5');

// Try running tests
console.log('\n=== Running tests ===');
try {
  // Install deps first if needed
  if (!existsSync(cwd + '/node_modules')) {
    console.log('Installing dependencies...');
    execFileSync('/usr/local/bin/npm', ['install'], { cwd, encoding: 'utf8', timeout: 120000, env });
  }
  const vitestBin = cwd + '/node_modules/.bin/vitest';
  if (existsSync(vitestBin)) {
    const out = execFileSync(vitestBin, ['run', 'src/routes/context-graph.test.ts'], {
      cwd, encoding: 'utf8', timeout: 60000, env: { ...env, NODE_ENV: 'test' }
    });
    console.log(out);
  } else {
    const out = execFileSync(process.execPath, ['/usr/local/bin/npx', 'vitest', 'run', 'src/routes/context-graph.test.ts'], {
      cwd, encoding: 'utf8', timeout: 120000, env: { ...env, NODE_ENV: 'test' }
    });
    console.log(out);
  }
} catch (e) {
  if (e.stdout) console.log(e.stdout);
  if (e.stderr) console.error(e.stderr);
  console.log('Test exit code:', e.status);
}

console.log('\n=== DONE ===');
