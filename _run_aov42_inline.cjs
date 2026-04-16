const { spawnSync } = require('child_process');
const { writeFileSync, appendFileSync, existsSync, symlinkSync, chmodSync } = require('fs');

const cwd = '/tmp/worktree-aov-42';
const env = {
  ...process.env,
  PATH: '/usr/local/lib/node_modules/.bin:/usr/local/bin:/usr/bin:/bin',
  HOME: '/home/appuser',
  GIT_AUTHOR_NAME: 'Agent Orchestrator',
  GIT_COMMITTER_NAME: 'Agent Orchestrator',
  GIT_AUTHOR_EMAIL: 'agent@orchestrator.dev',
  GIT_COMMITTER_EMAIL: 'agent@orchestrator.dev',
};

function run(bin, args, label) {
  console.log('\n=== ' + (label || bin) + ' ===');
  const r = spawnSync(bin, args, { cwd, encoding: 'utf8', timeout: 300000, env, maxBuffer: 10*1024*1024 });
  if (r.stdout) console.log(r.stdout);
  if (r.stderr) console.error(r.stderr);
  console.log('exit:', r.status);
  return r;
}

writeFileSync(cwd + '/.edison-progress.md',
  'Reading spec and AGENTS.md\nPlanning implementation approach\nImplementing backend: stories.ts, 042_budget_usage_bar.sql\nImplementing frontend: context-preview.html, context-preview.css, context-preview.js\nWriting tests: stories.test.ts, context-preview.test.js\nStaging and committing 7 files\n');

run('/usr/bin/git', ['add',
  'src/migrations/042_budget_usage_bar.sql', 'src/routes/stories.ts', 'src/routes/stories.test.ts',
  'client/js/context-preview.js', 'client/context-preview.html', 'client/css/context-preview.css',
  'client/__tests__/context-preview.test.js', '.edison-progress.md'], 'git add');

run('/usr/bin/git', ['status'], 'git status');

run('/usr/bin/git', ['commit', '-m',
  'feat(AOV-42): Context preview: budget usage bar with over-budget warning\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>'], 'git commit');

appendFileSync(cwd + '/.edison-progress.md', 'Running tests...\n');

const t = run(process.execPath, ['/usr/local/lib/node_modules/.bin/vitest', 'run', '--reporter', 'verbose',
  'src/routes/stories.test.ts', 'client/__tests__/context-preview.test.js'], 'vitest');

const out = (t.stdout||'') + (t.stderr||'');
const p = out.match(/(\d+)\s+passed/);
const f = out.match(/(\d+)\s+failed/);
appendFileSync(cwd + '/.edison-progress.md', 'Tests: ' + (p?p[1]:'?') + ' passed, ' + (f?f[1]:'0') + ' failed\n');

run('/usr/bin/git', ['log', '--oneline', '-5'], 'git log');
console.log('\nDONE');
