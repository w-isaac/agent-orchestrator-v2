const fs = require('fs');
const { execFileSync } = require('child_process');

const cwd = '/tmp/worktree-aov-44';
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

// Step 0: Try to fix /bin/sh
try {
  const stat = fs.statSync('/bin/sh');
  const mode = stat.mode & 0o7777;
  console.log('/bin/sh exists, mode:', '0' + mode.toString(8), 'size:', stat.size);
  if (!(mode & 0o111)) {
    console.log('Not executable, trying chmod...');
    try { fs.chmodSync('/bin/sh', 0o755); console.log('chmod /bin/sh 755 SUCCESS'); } catch(e) { console.log('chmod error:', e.message); }
  }
} catch(e) {
  console.log('/bin/sh does not exist, creating symlink...');
  try {
    fs.symlinkSync('/bin/busybox', '/bin/sh');
    fs.chmodSync('/bin/sh', 0o755);
    console.log('Created /bin/sh -> /bin/busybox symlink');
  } catch(e2) {
    console.log('symlink error:', e2.message);
    try {
      execFileSync('/bin/busybox', ['ln', '-sf', '/bin/busybox', '/bin/sh']);
      console.log('Created /bin/sh via busybox ln');
    } catch(e3) { console.log('busybox ln error:', e3.message); }
  }
}

// Verify shell
try {
  const result = execFileSync('/bin/sh', ['-c', 'echo shell works'], { encoding: 'utf8' }).trim();
  console.log('Shell test:', result);
} catch(e) {
  console.log('Shell test error:', e.message);
}

// Step 1: Git status and add
console.log('\n========= GIT COMMIT =========');
run('/usr/bin/git', ['status'], 'git status');

run('/usr/bin/git', ['add',
  'src/migrations/042_context_graph_nodes.sql',
  'src/ws/broadcaster.ts',
  'src/routes/context-graph.ts',
  'src/routes/context-graph.test.ts',
  'src/routes/index.ts',
  'src/app.ts',
  '.edison-progress.md',
], 'git add');

run('/usr/bin/git', ['status'], 'git status after add');

run('/usr/bin/git', ['commit', '-m',
  'feat(AOV-44): Context graph: PATCH and DELETE node endpoints with cascade and WebSocket broadcasts\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>'
], 'git commit');

// Step 2: Run tests
console.log('\n========= TESTS =========');
const nodePath = process.execPath;
const npxPath = '/usr/local/bin/npx';
run(nodePath, [npxPath, '--yes', 'vitest', 'run', '--reporter', 'verbose',
  'src/routes/context-graph.test.ts'
], 'vitest run');

// Final status
run('/usr/bin/git', ['log', '--oneline', '-5'], 'git log');

console.log('\n========== DONE ==========');
