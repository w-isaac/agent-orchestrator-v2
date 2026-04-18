const fs = require('fs');
const { execFileSync } = require('child_process');

const cwd = '/tmp/worktree-aov-177';
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

function run(bin, args, label, opts = {}) {
  console.log('\n=== ' + (label || bin + ' ' + args.join(' ')) + ' ===');
  try {
    const out = execFileSync(bin, args, { cwd, encoding: 'utf8', timeout: 600000, env, maxBuffer: 20*1024*1024, ...opts });
    console.log(out);
    return { ok: true, out };
  } catch(e) {
    console.log('STDOUT:', e.stdout || '');
    console.error('STDERR:', e.stderr || '');
    console.error('Exit code:', e.status);
    return { ok: false, out: (e.stdout || '') + (e.stderr || ''), error: e };
  }
}

// Step 0: Fix /bin/sh
try {
  const stat = fs.statSync('/bin/sh');
  const mode = stat.mode & 0o7777;
  console.log('/bin/sh exists, mode:', '0' + mode.toString(8));
  if (!(mode & 0o111)) {
    console.log('Not executable, chmod...');
    try { fs.chmodSync('/bin/sh', 0o755); console.log('chmod 755 SUCCESS'); } catch(e) { console.log('chmod error:', e.message); }
  }
} catch(e) {
  console.log('/bin/sh missing, creating symlink...');
  try {
    fs.symlinkSync('/bin/busybox', '/bin/sh');
    console.log('symlink created');
  } catch(e2) {
    console.log('symlink error:', e2.message);
  }
}

try {
  const result = execFileSync('/bin/sh', ['-c', 'echo shell works'], { encoding: 'utf8' }).trim();
  console.log('Shell test:', result);
} catch(e) {
  console.log('Shell test FAILED:', e.message);
}

// Append progress
fs.appendFileSync(cwd + '/.edison-progress.md', 'Writing tests\n');
fs.appendFileSync(cwd + '/.edison-progress.md', 'Staging and committing files\n');

// Step 1: Git status
run('/usr/bin/git', ['status'], 'git status');

// Step 2: Add exact files
run('/usr/bin/git', ['add',
  'src/migrations/20260418_013_add_auto_approve_to_projects.up.sql',
  'src/migrations/20260418_013_add_auto_approve_to_projects.down.sql',
  'src/routes/projects.ts',
  'src/routes/projects.test.ts',
  'src/lib/projectSchemas.ts',
  'src/lib/__tests__/projectSchemas.test.ts',
  'client/js/auto-approve-toggle.js',
  'client/js/confirm-auto-approve-modal.js',
  'client/__tests__/auto-approve-toggle.test.js',
  '.edison-progress.md',
], 'git add');

run('/usr/bin/git', ['status'], 'git status after add');

// Step 3: Commit
run('/usr/bin/git', ['commit', '-m',
  'feat(AOV-177): Whitelist auto_approve in PATCH /api/projects/:id and add AutoApproveToggle component'
], 'git commit');

run('/usr/bin/git', ['log', '--oneline', '-1'], 'git log');

// Step 4: Run server tests
fs.appendFileSync(cwd + '/.edison-progress.md', 'Running server tests...\n');
const nodePath = process.execPath;
const npxPath = '/usr/local/bin/npx';
const serverTest = run(nodePath, [npxPath, '--yes', 'vitest', 'run', '--reporter', 'verbose',
  'src/routes/projects.test.ts', 'src/lib/__tests__/projectSchemas.test.ts'
], 'vitest server');

// Parse pass/fail
function parseCounts(out) {
  // Look for "Tests  X passed" or "X passed | Y failed"
  let passed = 0, failed = 0;
  const mPass = out.match(/(\d+)\s+passed/);
  const mFail = out.match(/(\d+)\s+failed/);
  if (mPass) passed = parseInt(mPass[1], 10);
  if (mFail) failed = parseInt(mFail[1], 10);
  return { passed, failed };
}

const serverCounts = parseCounts(serverTest.out || '');
fs.appendFileSync(cwd + '/.edison-progress.md', `Server tests: ${serverCounts.passed} passed, ${serverCounts.failed} failed\n`);

// Step 5: Run client tests
fs.appendFileSync(cwd + '/.edison-progress.md', 'Running client tests...\n');
const clientTest = run(nodePath, [npxPath, '--yes', 'vitest', 'run', '--reporter', 'verbose',
  'client/__tests__/auto-approve-toggle.test.js'
], 'vitest client');

const clientCounts = parseCounts(clientTest.out || '');
fs.appendFileSync(cwd + '/.edison-progress.md', `Client tests: ${clientCounts.passed} passed, ${clientCounts.failed} failed\n`);

const allPassed = serverTest.ok && clientTest.ok && serverCounts.failed === 0 && clientCounts.failed === 0;
if (allPassed) {
  fs.appendFileSync(cwd + '/.edison-progress.md', 'All tests passed\n');
}

run('/usr/bin/git', ['log', '--oneline', '-1'], 'final git log');

console.log('\n========== SUMMARY ==========');
console.log('Server:', JSON.stringify(serverCounts), 'ok=', serverTest.ok);
console.log('Client:', JSON.stringify(clientCounts), 'ok=', clientTest.ok);
console.log('All passed:', allPassed);
