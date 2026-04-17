import { execFileSync, execSync } from 'child_process';
import { existsSync, symlinkSync, chmodSync, statSync, writeFileSync } from 'fs';

// Fix /bin/sh
try {
  if (!existsSync('/bin/sh')) {
    symlinkSync('/bin/busybox', '/bin/sh');
    console.log('created /bin/sh -> /bin/busybox');
  } else {
    try { chmodSync('/bin/sh', 0o755); } catch(e) {}
  }
} catch(e) {
  console.log('shell fix error:', e.message);
}

const cwd = '/tmp/worktree-aov-45';
const env = {
  ...process.env,
  PATH: '/usr/local/lib/node_modules/.bin:/usr/local/bin:/usr/bin:/bin',
  HOME: '/home/appuser',
  SHELL: '/bin/sh',
  GIT_AUTHOR_NAME: 'Agent Orchestrator',
  GIT_COMMITTER_NAME: 'Agent Orchestrator',
  GIT_AUTHOR_EMAIL: 'agent@orchestrator.dev',
  GIT_COMMITTER_EMAIL: 'agent@orchestrator.dev',
};

function run(bin, args, label) {
  console.log('\n=== ' + (label || bin + ' ' + args.join(' ')) + ' ===');
  try {
    const out = execFileSync(bin, args, { cwd, encoding: 'utf8', timeout: 300000, env, maxBuffer: 10*1024*1024 });
    console.log(out);
    return { ok: true, out };
  } catch(e) {
    console.log('STDOUT:', e.stdout || '');
    console.error('STDERR:', e.stderr || '');
    console.error('Exit code:', e.status);
    return { ok: false, error: e };
  }
}

// Git status
run('/usr/bin/git', ['status'], 'git status');

// Stage files
run('/usr/bin/git', ['add',
  'src/migrations/044_graph_node_edges.sql',
  'src/routes/context-graph.ts',
  'src/routes/context-graph.test.ts',
  '.edison-progress.md',
], 'git add');

// Commit
run('/usr/bin/git', ['commit', '-m',
  'feat(AOV-45): Context graph: edge create, update, delete with validation and WebSocket\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>'
], 'git commit');

// Run tests
console.log('\n========= TESTS =========');
const npxPath = '/usr/local/bin/npx';
run(process.execPath, [npxPath, '--yes', 'vitest', 'run', '--reporter', 'verbose',
  'src/routes/context-graph.test.ts'
], 'vitest run');

// Final status
run('/usr/bin/git', ['log', '--oneline', '-5'], 'git log');

console.log('\n========== DONE ==========');
