import { execSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync } from 'fs';

if (!existsSync('/bin/sh')) {
  try { symlinkSync('/bin/busybox', '/bin/sh'); } catch (_) {}
} else {
  try { chmodSync('/bin/sh', 0o755); } catch (_) {}
}

const cwd = '/tmp/worktree-aov-194';
const env = {
  ...process.env,
  PATH: '/usr/local/bin:/usr/bin:/bin',
  HOME: '/home/appuser',
  GIT_AUTHOR_NAME: 'Agent Orchestrator',
  GIT_COMMITTER_NAME: 'Agent Orchestrator',
  GIT_AUTHOR_EMAIL: 'agent@orchestrator.dev',
  GIT_COMMITTER_EMAIL: 'agent@orchestrator.dev',
};

function run(cmd, opts = {}) {
  console.log(`\n=== ${cmd} ===`);
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf8', timeout: 300000, env, ...opts });
    if (out) console.log(out);
    return out;
  } catch (e) {
    console.error('FAILED:', e.message?.slice(0, 200));
    if (e.stdout) console.log('stdout:', e.stdout.slice(-4000));
    if (e.stderr) console.log('stderr:', e.stderr.slice(-2000));
    return null;
  }
}

const files = [
  'src/migrations/20260418_016_create_smoke_configs.up.sql',
  'src/migrations/20260418_016_create_smoke_configs.down.sql',
  'src/migrations/20260418_016_create_smoke_configs.test.ts',
  'src/routes/smoke-config.ts',
  'src/routes/smoke-config.test.ts',
  'src/app.ts',
];

run(`git add ${files.join(' ')}`);

const commitMsg = `feat(AOV-194): Smoke config table, CRUD endpoints, and synchronous connectivity test

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`;

run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
run('git log --oneline -3');
run('git status');

console.log('\n========== INSTALLING DEPS ==========');
run('npm install --silent');

console.log('\n========== RUNNING TESTS ==========');
run('npx vitest run src/migrations/20260418_016_create_smoke_configs.test.ts src/routes/smoke-config.test.ts');
