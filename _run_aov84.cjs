const { execFileSync } = require('child_process');
const fs = require('fs');

const cwd = '/tmp/worktree-aov-84';
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
    const out = execFileSync(bin, args, { cwd, encoding: 'utf8', timeout: 600000, env, maxBuffer: 20 * 1024 * 1024 });
    console.log(out);
    return { ok: true, out };
  } catch (e) {
    console.log('STDOUT:', e.stdout || '');
    console.error('STDERR:', e.stderr || '');
    console.error('Exit code:', e.status);
    return { ok: false, error: e };
  }
}

function log(msg) {
  fs.appendFileSync(cwd + '/.edison-progress.md', msg + '\n');
}

const mode = process.argv[2] || 'all';

const files = [
  'src/migrations/20260418_007_create_story_gates.up.sql',
  'src/migrations/20260418_007_create_story_gates.down.sql',
  'src/migrations/20260418_008_create_story_history.up.sql',
  'src/migrations/20260418_008_create_story_history.down.sql',
  'src/migrations/20260418_009_add_position_to_stories.up.sql',
  'src/migrations/20260418_009_add_position_to_stories.down.sql',
  'src/services/storyBroadcaster.ts',
  'src/services/storyBroadcaster.test.ts',
  'src/services/dependencyGraph.ts',
  'src/services/dependencyGraph.test.ts',
  'src/routes/story-lifecycle.ts',
  'src/routes/story-lifecycle.test.ts',
  'src/app.ts',
  '.edison-progress.md',
  '_run_aov84.cjs',
];

if (mode === 'all' || mode === 'commit') {
  log('Staging and committing files');
  run('/usr/bin/git', ['add', ...files], 'git add');
  run('/usr/bin/git', ['status'], 'git status');
  run('/usr/bin/git', [
    'commit',
    '-m',
    'feat(AOV-84): Story lifecycle: advance/retreat stages, gate approval, dependency management, and prioritization\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>',
  ], 'git commit');
}

if (mode === 'all' || mode === 'test') {
  log('Running server tests...');
  const nodePath = process.execPath;
  const npxPath = '/usr/local/bin/npx';
  const res = run(nodePath, [
    npxPath,
    '--yes',
    'vitest',
    'run',
    '--reporter', 'verbose',
    'src/routes/story-lifecycle.test.ts',
    'src/services/dependencyGraph.test.ts',
    'src/services/storyBroadcaster.test.ts',
  ], 'vitest run');
  if (res.ok) {
    log('All tests passed');
  } else {
    log('Server tests had failures; see CI output');
  }
}

if (mode === 'all' || mode === 'log') {
  run('/usr/bin/git', ['log', '--oneline', '-3'], 'git log');
}
