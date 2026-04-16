import { execSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync } from 'fs';

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

const cwd = '/tmp/worktree-aov-31';

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
    console.error('FAILED:', e.message?.slice(0, 200));
    if (e.stdout) console.log('stdout:', e.stdout.slice(-2000));
    if (e.stderr) console.log('stderr:', e.stderr.slice(-1000));
    return null;
  }
}

const files = [
  'src/migrations/041_add_token_count_index.sql',
  'src/routes/stories.ts',
  'src/routes/stories.test.ts',
  'client/context-preview.html',
  'client/css/context-preview.css',
  'client/js/context-preview.js',
  'client/__tests__/context-preview.test.js',
  '.edison-progress.md',
];

run(`git add ${files.join(' ')}`);

const commitMsg = `feat(AOV-31): Context preview panel: budget controls, artifact toggling, and greedy knapsack auto-packing

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`;

run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
run('git log --oneline -3');
run('git status');

console.log('\n========== INSTALLING DEPS ==========');
run('npm install --silent');

console.log('\n========== RUNNING TESTS ==========');
run('npx vitest run src/routes/stories.test.ts client/__tests__/context-preview.test.js');
