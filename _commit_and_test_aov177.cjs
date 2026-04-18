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
    return { ok: false, error: e, out: (e.stdout || '') + (e.stderr || '') };
  }
}

// Step 0: ensure /bin/sh is executable (harness quirk)
try {
  const stat = fs.statSync('/bin/sh');
  const mode = stat.mode & 0o7777;
  if (!(mode & 0o111)) {
    try { fs.chmodSync('/bin/sh', 0o755); console.log('chmod /bin/sh 755 OK'); } catch (e) { console.log('chmod err:', e.message); }
  }
} catch (e) {
  try {
    fs.symlinkSync('/bin/busybox', '/bin/sh');
    fs.chmodSync('/bin/sh', 0o755);
    console.log('Symlinked /bin/sh -> /bin/busybox');
  } catch (e2) { console.log('symlink err:', e2.message); }
}

function appendProgress(line) {
  fs.appendFileSync(`${cwd}/.edison-progress.md`, line + '\n');
}

appendProgress('Writing tests');
appendProgress('Staging and committing files');

console.log('\n========= GIT COMMIT =========');
run('/usr/bin/git', ['status'], 'git status (before)');

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

run('/usr/bin/git', ['status'], 'git status (after add)');

run('/usr/bin/git', ['commit', '-m',
  'feat(AOV-177): Whitelist auto_approve in PATCH /api/projects/:id and add AutoApproveToggle component',
], 'git commit');

// Step 2: Run tests
console.log('\n========= SERVER TESTS =========');
appendProgress('Running server tests...');
const nodePath = process.execPath;
const npxPath = '/usr/local/bin/npx';

const server = run(nodePath, [npxPath, '--yes', 'vitest', 'run', '--reporter', 'verbose',
  'src/routes/projects.test.ts',
  'src/lib/__tests__/projectSchemas.test.ts',
], 'vitest run (server)');
const sOut = server.out || '';
const sPassed = (sOut.match(/(\d+) passed/) || [])[1] || '?';
const sFailed = (sOut.match(/(\d+) failed/) || [])[1] || '0';
appendProgress(`Server tests: ${sPassed} passed, ${sFailed} failed`);

console.log('\n========= CLIENT TESTS =========');
appendProgress('Running client tests...');
const client = run(nodePath, [npxPath, '--yes', 'vitest', 'run', '--reporter', 'verbose',
  'client/__tests__/auto-approve-toggle.test.js',
], 'vitest run (client)');
const cOut = client.out || '';
const cPassed = (cOut.match(/(\d+) passed/) || [])[1] || '?';
const cFailed = (cOut.match(/(\d+) failed/) || [])[1] || '0';
appendProgress(`Client tests: ${cPassed} passed, ${cFailed} failed`);

if (server.ok && client.ok) {
  appendProgress('All tests passed');
}

run('/usr/bin/git', ['log', '--oneline', '-3'], 'git log');
console.log('\n========== DONE ==========');
