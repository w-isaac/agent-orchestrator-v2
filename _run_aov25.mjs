import { execSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync } from 'fs';

// Ensure /bin/sh exists
if (!existsSync('/bin/sh')) {
  try {
    symlinkSync('/bin/busybox', '/bin/sh');
    console.log('Created /bin/sh -> /bin/busybox');
  } catch (e) {
    console.error('Failed to create /bin/sh:', e.message);
  }
} else {
  try { chmodSync('/bin/sh', 0o755); } catch (_) {}
  console.log('/bin/sh already exists');
}

const cwd = '/tmp/worktree-aov-25';

function run(cmd, opts = {}) {
  console.log(`\n=== ${cmd} ===`);
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      timeout: 300000,
      env: { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/appuser', GIT_AUTHOR_NAME: 'Agent Orchestrator', GIT_COMMITTER_NAME: 'Agent Orchestrator', GIT_AUTHOR_EMAIL: 'agent@orchestrator.dev', GIT_COMMITTER_EMAIL: 'agent@orchestrator.dev' },
      ...opts
    });
    if (out) console.log(out);
    return out;
  } catch (e) {
    console.error('FAILED:', e.message);
    if (e.stdout) console.log('stdout:', e.stdout);
    if (e.stderr) console.log('stderr:', e.stderr);
    return null;
  }
}

// Step 1: git add all new/changed files
const files = [
  'src/api/v2/tasks.ts',
  'src/api/v2/tasks.test.ts',
  'src/api/v2/index.ts',
  'client/tasks.html',
  'client/js/tasks.js',
  'client/css/tasks.css',
  'client/__tests__/tasks.test.js',
  'client/dashboard.html',
  '.edison-progress.md',
];

console.log('\n========== GIT ADD ==========');
run(`git add ${files.join(' ')}`);

// Step 2: git commit
console.log('\n========== GIT COMMIT ==========');
const commitMsg = `feat(AOV-25): Task board with v2 status model

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`;

run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);

// Step 3: Show status
run('git log --oneline -3');
run('git status');

// Step 4: Install deps
console.log('\n========== INSTALLING DEPENDENCIES ==========');
run('npm install --silent');

// Step 5: Run tests
console.log('\n========== RUNNING TESTS ==========');
run('npx vitest run src/api/v2/tasks.test.ts client/__tests__/tasks.test.js');
