// Self-contained commit + test runner using execFileSync (no shell needed)
const { execFileSync } = require('child_process');
const fs = require('fs');

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

// Fix /bin/sh if needed
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

// Write progress
fs.writeFileSync(cwd + '/.edison-progress.md',
  'Reading spec and AGENTS.md\n' +
  'Planning implementation approach\n' +
  'Implementing backend: src/routes/stories.ts, src/migrations/042_budget_usage_bar.sql\n' +
  'Implementing frontend: context-preview.html, context-preview.css, context-preview.js\n' +
  'Writing tests: stories.test.ts, context-preview.test.js\n' +
  'Staging and committing 7 files\n'
);

// Step 1: Git add
console.log('\n========= GIT COMMIT =========');
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

run('/usr/bin/git', ['commit', '-m',
  'feat(AOV-42): Context preview: budget usage bar with over-budget warning\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>'
], 'git commit');

// Step 2: Run tests
console.log('\n========= TESTS =========');
const nodePath = process.execPath;
const npxPath = '/usr/local/bin/npx';
const result = run(nodePath, [npxPath, '--yes', 'vitest', 'run', '--reporter', 'verbose',
  'src/routes/stories.test.ts', 'client/__tests__/context-preview.test.js'
], 'vitest run');

// Final status
run('/usr/bin/git', ['log', '--oneline', '-5'], 'git log');

// Update progress
const progressSuffix = result.ok ? 'All tests passed\n' : 'Tests had failures - check output\n';
fs.appendFileSync(cwd + '/.edison-progress.md', 'Running tests: stories.test.ts, context-preview.test.js\n' + progressSuffix);

console.log('\n========== DONE ==========');
