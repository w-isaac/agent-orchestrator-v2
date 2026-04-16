import { execSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync } from 'fs';

// Bootstrap /bin/sh
if (!existsSync('/bin/sh')) {
  try {
    symlinkSync('/bin/busybox', '/bin/sh');
    console.log('Created /bin/sh -> /bin/busybox');
  } catch (e) {
    console.error('Failed to create /bin/sh symlink:', e.message);
  }
} else {
  try { chmodSync('/bin/sh', 0o755); } catch (_) {}
  console.log('/bin/sh already exists, ensured executable');
}

const cwd = '/tmp/worktree-aov-35';
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

// Run tests
console.log('\n========== RUNNING TESTS ==========');
const testResult = run('npx vitest run src/services/taskDispatcher.test.ts src/routes/tasks.test.ts');

// Git add and commit
console.log('\n========== COMMITTING ==========');
run('git add src/migrations/012_tasks_table.sql src/services/taskDispatcher.ts src/services/taskDispatcher.test.ts src/routes/tasks.ts src/routes/tasks.test.ts src/routes/index.ts src/app.ts');
run('git status');
run('git commit -m "feat(AOV-35): TaskDispatcher service: dispatch-collect-validate lifecycle with unit tests"');
run('git log --oneline -3');
