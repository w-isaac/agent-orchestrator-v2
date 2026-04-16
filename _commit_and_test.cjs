// Self-contained commit + test runner using execFileSync (no shell needed)
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');

const cwd = '/tmp/worktree-aov-31';
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
    const out = execFileSync(bin, args, { cwd, encoding: 'utf8', timeout: 300000, env, maxBuffer: 10*1024*1024 });
    console.log(out);
    return { ok: true, out };
  } catch(e) {
    console.log('STDOUT:', e.stdout || '');
    console.error('STDERR:', e.stderr || '');
    console.error('Exit code:', e.status);
    return { ok: false, error: e };
  }
}

// Step 0: Try to fix /bin/sh
if (!fs.existsSync('/bin/sh')) {
  try {
    execFileSync('/bin/busybox', ['ln', '-sf', '/bin/busybox', '/bin/sh']);
    console.log('Created /bin/sh symlink');
  } catch(e) {
    try { fs.symlinkSync('/bin/busybox', '/bin/sh'); console.log('Created symlink via fs'); } catch(e2) { console.log('Could not create /bin/sh:', e2.message); }
  }
} else {
  try { fs.chmodSync('/bin/sh', 0o755); console.log('chmod /bin/sh 755'); } catch(_) {}
}

// Step 1: Git add
console.log('\n========= GIT COMMIT =========');
run('/usr/bin/git', ['add',
  'src/migrations/041_add_token_count_index.sql',
  'src/routes/stories.ts',
  'src/routes/stories.test.ts',
  'client/js/context-preview.js',
  'client/context-preview.html',
  'client/css/context-preview.css',
  'client/__tests__/context-preview.test.js',
  '.edison-progress.md',
], 'git add');

run('/usr/bin/git', ['status'], 'git status');

run('/usr/bin/git', ['commit', '-m',
  'feat(AOV-31): Context preview panel: budget controls, artifact toggling, and greedy knapsack auto-packing\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>'
], 'git commit');

// Step 2: Run tests
console.log('\n========= TESTS =========');
const nodePath = process.execPath;
const npxPath = '/usr/local/bin/npx';
run(nodePath, [npxPath, '--yes', 'vitest', 'run', '--reporter', 'verbose',
  'src/routes/stories.test.ts', 'client/__tests__/context-preview.test.js'
], 'vitest run');

// Final status
run('/usr/bin/git', ['log', '--oneline', '-5'], 'git log');

console.log('\n========== DONE ==========');
