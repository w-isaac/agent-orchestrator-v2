const { execFileSync } = require('child_process');
const fs = require('fs');

const cwd = '/tmp/worktree-aov-79';
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
    return { ok: false, error: e, out: (e.stdout || '') + (e.stderr || '') };
  }
}

const progress = `${cwd}/.edison-progress.md`;
function log(msg) { fs.appendFileSync(progress, msg + '\n'); }

log('Installing zod + vitest deps');
const nodePath = process.execPath;
const npmPath = '/usr/local/bin/npm';
const npxPath = '/usr/local/bin/npx';

// Install zod (and any missing deps) so vitest can resolve it
run(npmPath, ['install', '--no-audit', '--no-fund', '--prefer-offline', '--ignore-scripts'], 'npm install');

log('Running server tests...');
const testResult = run(
  nodePath,
  [npxPath, '--yes', 'vitest', 'run', '--reporter', 'verbose',
    'src/lib/__tests__/portSchema.test.ts',
    'src/lib/__tests__/projectSchemas.test.ts',
    'src/lib/__tests__/pgErrorMapper.test.ts'],
  'vitest run',
);

log(`Server tests: ${testResult.ok ? 'PASSED' : 'FAILED'}`);

if (!testResult.ok) {
  console.error('Tests failed, aborting commit');
  process.exit(1);
}

log('Staging and committing files');
const filesToAdd = [
  'package.json',
  'src/lib/portSchema.ts',
  'src/lib/projectSchemas.ts',
  'src/lib/pgErrorMapper.ts',
  'src/lib/__tests__/portSchema.test.ts',
  'src/lib/__tests__/projectSchemas.test.ts',
  'src/lib/__tests__/pgErrorMapper.test.ts',
  '.edison-progress.md',
];
if (fs.existsSync(`${cwd}/package-lock.json`)) filesToAdd.splice(1, 0, 'package-lock.json');
run('/usr/bin/git', ['add', ...filesToAdd], 'git add');

run('/usr/bin/git', ['status'], 'git status');

run('/usr/bin/git', [
  'commit',
  '-m',
  'feat(AOV-79): pgErrorMapper + Zod port schemas (server lib)\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>',
], 'git commit');

run('/usr/bin/git', ['log', '--oneline', '-5'], 'git log');

console.log('\n========== DONE ==========');
