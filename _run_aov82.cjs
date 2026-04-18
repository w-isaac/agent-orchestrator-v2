const { execFileSync } = require('child_process');
const fs = require('fs');

const cwd = '/tmp/worktree-aov-82';
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
  fs.appendFileSync('/tmp/worktree-aov-82/.edison-progress.md', msg + '\n');
}

const mode = process.argv[2] || 'all';

if (mode === 'all' || mode === 'commit') {
  log('Staging and committing files');
  run('/usr/bin/git', [
    'add',
    'src/migrations/20260418_005_create_pipeline_stages.up.sql',
    'src/migrations/20260418_005_create_pipeline_stages.down.sql',
    'src/migrations/20260418_005_pipeline_stages.test.ts',
    'src/constants/defaultPipelineStages.ts',
    'src/constants/defaultPipelineStages.test.ts',
    'src/repositories/pipelineStagesRepository.ts',
    'src/repositories/pipelineStagesRepository.test.ts',
    'src/routes/projects.ts',
    'src/routes/projects.test.ts',
    '.edison-progress.md',
  ], 'git add');
  run('/usr/bin/git', ['status'], 'git status');
  run('/usr/bin/git', [
    'commit',
    '-m',
    'feat(AOV-82): pipeline_stages table: DDL migration, default stage seeding, and project API inclusion\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>',
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
    'src/migrations/20260418_005_pipeline_stages.test.ts',
    'src/constants/defaultPipelineStages.test.ts',
    'src/repositories/pipelineStagesRepository.test.ts',
    'src/routes/projects.test.ts',
  ], 'vitest run');
}

if (mode === 'all' || mode === 'log') {
  run('/usr/bin/git', ['log', '--oneline', '-3'], 'git log');
}
