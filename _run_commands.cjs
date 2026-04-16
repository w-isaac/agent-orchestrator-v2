const { spawnSync } = require('child_process');
const cwd = '/tmp/worktree-aov-43';

function run(cmd, args, opts = {}) {
  console.log(`\n>>> ${cmd} ${args.join(' ')}\n`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'pipe', ...opts });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  console.log(`\n--- exit code: ${r.status} ---\n`);
  return r.status;
}

// 1. git add
run('git', ['add',
  'src/migrations/043_autopack_ratio_index.sql',
  'src/routes/stories.ts',
  'src/routes/stories.test.ts',
  'client/js/context-preview.js',
  'client/context-preview.html',
  'client/css/context-preview.css',
  'client/__tests__/context-preview.test.js',
  '.edison-progress.md'
]);

// 2. git commit
run('git', ['commit', '-m',
  'feat(AOV-43): Auto-Pack button: greedy knapsack artifact selection within token budget\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>'
]);

// 3. run tests
const testStatus = run('npx', ['vitest', 'run', '--reporter', 'verbose',
  'src/routes/stories.test.ts',
  'client/__tests__/context-preview.test.js'
], { timeout: 120000 });

process.exit(testStatus);
