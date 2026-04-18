const { execFileSync } = require('child_process');
const fs = require('fs');

const cwd = '/tmp/worktree-aov-83';
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

if (mode === 'all' || mode === 'commit') {
  log('Staging and committing files');
  run('/usr/bin/git', [
    'add',
    'src/migrations/20260418_006_create_stories.up.sql',
    'src/migrations/20260418_006_create_stories.down.sql',
    'src/migrations/20260418_006_create_stories.test.ts',
    'src/routes/stories.ts',
    'src/routes/stories.test.ts',
    '.edison-progress.md',
  ], 'git add');
  run('/usr/bin/git', ['status'], 'git status');
  run('/usr/bin/git', [
    'commit',
    '-m',
    'feat(AOV-83): Stories table and full CRUD API\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>',
  ], 'git commit');
}

if (mode === 'all' || mode === 'test') {
  log('Running tests (server only)');
  const nodePath = process.execPath;
  const npxPath = '/usr/local/bin/npx';
  run(nodePath, [
    npxPath,
    '--yes',
    'vitest',
    'run',
    '--reporter', 'verbose',
    'src/routes/stories.test.ts',
    'src/migrations/20260418_006_create_stories.test.ts',
  ], 'vitest run');
}

if (mode === 'all' || mode === 'log') {
  run('/usr/bin/git', ['log', '--oneline', '-3'], 'git log');
}
