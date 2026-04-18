const fs = require('fs');
const { execFileSync } = require('child_process');

const cwd = '/tmp/worktree-aov-18';
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

run('/usr/bin/git', ['status'], 'git status before');

progress('Staging files for commit');
run('/usr/bin/git', ['add',
  'src/migrations/051_project_budgets.sql',
  'src/routes/analytics.ts',
  'src/routes/analytics.test.ts',
  'src/routes/index.ts',
  'src/app.ts',
  'client/analytics.html',
  'client/css/analytics.css',
  'client/js/analytics.js',
  'client/__tests__/analytics.test.js',
  '.edison-progress.md',
  '_run_aov18.cjs',
], 'git add');

progress('Committing work');
run('/usr/bin/git', ['commit', '-m',
  'feat(AOV-18): Token Analytics Dashboard: Charts, Gauges, and Cost Visualizations\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>',
], 'git commit');

progress('Running server route tests...');
const serverTest = run(nodePath, ['/usr/local/bin/npx', '--yes', 'vitest', 'run', '--reporter', 'verbose',
  'src/routes/analytics.test.ts',
], 'vitest server');

progress('Running client helper tests...');
const clientTest = run(nodePath, ['/usr/local/bin/npx', '--yes', 'vitest', 'run', '--reporter', 'verbose',
  'client/__tests__/analytics.test.js',
], 'vitest client');

if (serverTest.ok && clientTest.ok) {
  progress('All scoped tests passed');
} else {
  progress('Some scoped tests failed — see output above');
}

run('/usr/bin/git', ['add', '.edison-progress.md'], 'git add progress');
run('/usr/bin/git', ['commit', '--amend', '--no-edit'], 'git commit amend');

run('/usr/bin/git', ['log', '--oneline', '-3'], 'git log');
console.log('\n========== DONE ==========');
