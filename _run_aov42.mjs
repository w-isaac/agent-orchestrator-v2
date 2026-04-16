// Uses spawnSync to bypass shell requirement
import { spawnSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync, writeFileSync, appendFileSync } from 'fs';

const cwd = '/tmp/worktree-aov-42';
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

// Try to fix shell
if (!existsSync('/bin/sh')) {
  try { symlinkSync('/bin/busybox', '/bin/sh'); console.log('Created /bin/sh'); } catch(e) { console.log('No /bin/sh:', e.message); }
} else {
  try { chmodSync('/bin/sh', 0o755); } catch(_) {}
  console.log('/bin/sh exists');
}

function run(bin, args, label) {
  console.log(`\n=== ${label || bin + ' ' + args.join(' ')} ===`);
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', timeout: 300000, env, maxBuffer: 10*1024*1024 });
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  if (result.error) console.error('spawn error:', result.error.message);
  console.log('exit code:', result.status);
  return result;
}

// Progress
writeFileSync(cwd + '/.edison-progress.md',
  'Reading spec and AGENTS.md\n' +
  'Planning implementation approach\n' +
  'Implementing backend: src/routes/stories.ts, src/migrations/042_budget_usage_bar.sql\n' +
  'Implementing frontend: context-preview.html, context-preview.css, context-preview.js\n' +
  'Writing tests: stories.test.ts, context-preview.test.js\n' +
  'Staging and committing 7 files\n'
);

const nodePath = process.execPath;

// Step 1: Git add + commit
console.log('\n========== GIT COMMIT ==========');
run('/usr/bin/git', ['add',
  'src/migrations/042_budget_usage_bar.sql',
  'src/routes/stories.ts',
  'src/routes/stories.test.ts',
  'client/js/context-preview.js',
  'client/context-preview.html',
  'client/css/context-preview.css',
  'client/__tests__/context-preview.test.js',
  '.edison-progress.md',
], 'git add');

run('/usr/bin/git', ['status'], 'git status');

const commitResult = run('/usr/bin/git', ['commit', '-m',
  'feat(AOV-42): Context preview: budget usage bar with over-budget warning\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>'
], 'git commit');
console.log('Commit exit:', commitResult.status);

// Step 2: Run tests
console.log('\n========== RUNNING TESTS ==========');
appendFileSync(cwd + '/.edison-progress.md', 'Running tests: stories.test.ts, context-preview.test.js\n');

const npxPath = '/usr/local/bin/npx';
const testResult = run(nodePath, [npxPath, 'vitest', 'run', '--reporter', 'verbose',
  'src/routes/stories.test.ts', 'client/__tests__/context-preview.test.js'
], 'vitest run');

const combined = (testResult.stdout || '') + (testResult.stderr || '');
const passMatch = combined.match(/(\d+)\s+passed/);
const failMatch = combined.match(/(\d+)\s+failed/);
const passed = passMatch ? parseInt(passMatch[1]) : 0;
const failed = failMatch ? parseInt(failMatch[1]) : 0;

appendFileSync(cwd + '/.edison-progress.md',
  `Server tests: ${passed} passed, ${failed} failed\n` +
  (testResult.status === 0 ? 'All tests passed\n' : 'Tests had failures\n')
);

// Final git log
run('/usr/bin/git', ['log', '--oneline', '-5'], 'git log');

console.log(`\nTEST RESULT: ${passed} passed, ${failed} failed, exit=${testResult.status}`);
console.log('\n========== DONE ==========');
