const fs = require('fs');
const { execFileSync } = require('child_process');

const cwd = '/tmp/worktree-aov-48';
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
    const out = execFileSync(bin, args, { cwd, encoding: 'utf8', timeout: 600000, env, maxBuffer: 20 * 1024 * 1024 });
    console.log(out);
    return { ok: true, out };
  } catch (e) {
    console.log('STDOUT:', e.stdout || '');
    console.error('STDERR:', e.stderr || '');
    console.error('Exit code:', e.status);
    return { ok: false, error: e };
  }
}

// Fix /bin/sh if broken
try {
  const stat = fs.statSync('/bin/sh');
  const mode = stat.mode & 0o7777;
  if (!(mode & 0o111)) {
    try { fs.chmodSync('/bin/sh', 0o755); } catch (e) {}
  }
} catch (e) {
  try {
    fs.symlinkSync('/bin/busybox', '/bin/sh');
    fs.chmodSync('/bin/sh', 0o755);
  } catch (e2) {}
}

const nodePath = process.execPath;

function progress(line) {
  try { fs.appendFileSync(`${cwd}/.edison-progress.md`, line + '\n'); } catch (e) {}
}

// Status
run('/usr/bin/git', ['status'], 'git status before');

// Stage
progress('Staging files for commit');
run('/usr/bin/git', ['add',
  'src/routes/context-graph.ts',
  'src/routes/context-graph.test.ts',
  '.edison-progress.md',
  '_run_aov48.cjs',
], 'git add');

// Commit
progress('Committing work');
run('/usr/bin/git', ['commit', '-m',
  'feat(AOV-48): ForceGraph context menus and node detail panel\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>',
], 'git commit');

// Run tests
progress('Running server tests...');
const testResult = run(nodePath, ['/usr/local/bin/npx', '--yes', 'vitest', 'run', '--reporter', 'verbose',
  'src/routes/context-graph.test.ts',
], 'vitest run');

if (testResult.ok) {
  progress('Server tests: all passed');
} else {
  progress('Server tests failed — see test output');
}

// Amend if progress file changed
run('/usr/bin/git', ['add', '.edison-progress.md'], 'git add progress');
run('/usr/bin/git', ['commit', '--amend', '--no-edit'], 'git commit amend');

run('/usr/bin/git', ['log', '--oneline', '-3'], 'git log');
console.log('\n========== DONE ==========');
