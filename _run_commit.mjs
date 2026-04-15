import { execSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync } from 'fs';

// Create /bin/sh symlink to busybox so shell commands work
if (!existsSync('/bin/sh')) {
  try {
    symlinkSync('/bin/busybox', '/bin/sh');
    console.log('Created /bin/sh -> /bin/busybox symlink');
  } catch (e) {
    console.error('Failed to create symlink:', e.message);
  }
} else {
  try {
    chmodSync('/bin/sh', 0o755);
    console.log('/bin/sh already exists, ensured +x');
  } catch (e) {
    console.log('/bin/sh exists');
  }
}

const cwd = '/tmp/worktree-aov-11';

function run(cmd, opts = {}) {
  console.log(`\n--- ${cmd} ---`);
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf8', timeout: 120000, ...opts });
    console.log(out);
    return out;
  } catch (e) {
    console.error('FAILED:', e.message);
    if (e.stdout) console.log('stdout:', e.stdout.toString());
    if (e.stderr) console.log('stderr:', e.stderr.toString());
    throw e;
  }
}

// Install deps
run('npm install');

// Run tests
run('npx vitest run src/adapters/codex-runner.test.ts src/adapters/codex-adapter.test.ts src/config/codex-config.test.ts');

// Stage files
run('git add src/migrations/007_codex_adapter.sql src/config/codex-config.ts src/config/codex-config.test.ts src/adapters/codex-runner.ts src/adapters/codex-runner.test.ts src/adapters/codex-adapter.ts src/adapters/codex-adapter.test.ts src/adapters/index.ts src/config/agent-models.ts src/routes/adapters.ts src/services/adapterRouter.ts');

// Commit
const commitMsg = `feat(AOV-11): Codex adapter: full prompt with embedded context, async polling, and result normalization

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`;
run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);

// Show status
run('git log --oneline -3');
run('git status');
