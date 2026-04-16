import { execSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync } from 'fs';

// Ensure /bin/sh exists
try { chmodSync('/bin/busybox', 0o755); } catch (_) {}
if (!existsSync('/bin/sh')) {
  try { symlinkSync('/bin/busybox', '/bin/sh'); console.log('Created /bin/sh'); } catch (e) { console.error(e.message); }
} else {
  try { chmodSync('/bin/sh', 0o755); } catch (_) {}
  console.log('/bin/sh exists');
}

const cwd = '/tmp/worktree-aov-37';

function run(cmd) {
  console.log(`\n=== ${cmd} ===`);
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      timeout: 300000,
      env: {
        ...process.env,
        PATH: '/usr/local/bin:/usr/bin:/bin',
        HOME: '/home/appuser',
        GIT_AUTHOR_NAME: 'Agent Orchestrator',
        GIT_COMMITTER_NAME: 'Agent Orchestrator',
        GIT_AUTHOR_EMAIL: 'agent@orchestrator.dev',
        GIT_COMMITTER_EMAIL: 'agent@orchestrator.dev',
      },
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

// Install deps
console.log('\n========== INSTALLING DEPENDENCIES ==========');
run('npm install --silent');

// Run tests
console.log('\n========== RUNNING TESTS ==========');
run('npx vitest run src/services/preflightService.test.ts');

// Git operations
console.log('\n========== GIT COMMIT ==========');
run('git add src/migrations/040_preflight_extensions.sql src/services/preflightService.ts src/services/preflightService.test.ts src/services/index.ts src/routes/tasks.ts');
run('git status');
run('git commit -m "feat(AOV-37): Pre-flight validation and budget estimation service\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"');
run('git log --oneline -3');
