const { execFileSync } = require('child_process');
const fs = require('fs');

const cwd = '/tmp/worktree-aov-73';
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
    const out = execFileSync(bin, args, { cwd, encoding: 'utf8', timeout: 300000, env, maxBuffer: 10 * 1024 * 1024 });
    console.log(out);
    return { ok: true, out };
  } catch (e) {
    console.log('STDOUT:', e.stdout || '');
    console.error('STDERR:', e.stderr || '');
    console.error('Exit code:', e.status);
    return { ok: false, error: e };
  }
}

fs.appendFileSync(`${cwd}/.edison-progress.md`, 'Running server tests...\n');

const nodePath = process.execPath;
const npxPath = '/usr/local/bin/npx';
const testResult = run(
  nodePath,
  [npxPath, '--yes', 'vitest', 'run', '--reporter', 'verbose', 'src/migrations/20260418_004_port_columns.test.ts'],
  'vitest run',
);

fs.appendFileSync(
  `${cwd}/.edison-progress.md`,
  `Server tests result: ${testResult.ok ? 'PASSED' : 'FAILED'}\n`,
);

if (testResult.ok) {
  fs.appendFileSync(`${cwd}/.edison-progress.md`, 'Staging and committing files\n');
  run('/usr/bin/git', [
    'add',
    'src/migrations/20260418_004_add_project_port_columns.up.sql',
    'src/migrations/20260418_004_add_project_port_columns.down.sql',
    'src/migrations/20260418_004_port_columns.test.ts',
    '.edison-progress.md',
  ], 'git add');

  run('/usr/bin/git', ['status'], 'git status');

  run('/usr/bin/git', [
    'commit',
    '-m',
    'feat(AOV-73): DDL migration: port columns with CHECK constraints, partial unique indexes, and integration tests\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>',
  ], 'git commit');

  run('/usr/bin/git', ['log', '--oneline', '-5'], 'git log');
}

console.log('\n========== DONE ==========');
