import { execSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync } from 'fs';

// Setup shell
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

const cwd = '/tmp/worktree-aov-33';
const env = {
  ...process.env,
  PATH: '/usr/local/bin:/usr/bin:/bin',
  HOME: '/home/appuser',
  GIT_AUTHOR_NAME: 'Agent Orchestrator',
  GIT_COMMITTER_NAME: 'Agent Orchestrator',
  GIT_AUTHOR_EMAIL: 'agent@orchestrator.dev',
  GIT_COMMITTER_EMAIL: 'agent@orchestrator.dev',
};

function run(cmd) {
  console.log(`\n=== ${cmd} ===`);
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf8', timeout: 300000, env });
    if (out) console.log(out);
    return out;
  } catch (e) {
    console.error('FAILED:', e.message);
    if (e.stdout) console.log('stdout:', e.stdout);
    if (e.stderr) console.log('stderr:', e.stderr);
    return null;
  }
}

// Install deps
console.log('\n========== INSTALLING DEPENDENCIES ==========');
run('npm install --silent');

// Run tests
console.log('\n========== RUNNING PIPELINE TESTS ==========');
const testResult = run('npx vitest run client/__tests__/pipeline.test.js');

// Git operations
console.log('\n========== GIT COMMIT ==========');
run('git add client/pipeline.html client/js/pipeline.js client/css/pipeline.css client/__tests__/pipeline.test.js');
run('git status');
run(`git commit -m "feat(AOV-33): Pipeline view page with stage columns, story cards, and detail panel

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"`);
run('git log --oneline -3');
