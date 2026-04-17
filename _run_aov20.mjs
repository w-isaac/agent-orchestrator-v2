import { execFileSync, execSync } from 'child_process';
import { chmodSync, existsSync, symlinkSync } from 'fs';

try {
  if (!existsSync('/bin/sh') && existsSync('/bin/busybox')) {
    symlinkSync('/bin/busybox', '/bin/sh');
    console.log('Created /bin/sh -> /bin/busybox');
  } else if (existsSync('/bin/sh')) {
    chmodSync('/bin/sh', 0o755);
  }
} catch (e) {
  console.log('Shell prep:', e.message);
}

const cwd = '/tmp/worktree-aov-20';
const env = {
  ...process.env,
  PATH: '/usr/local/bin:/usr/bin:/bin',
  HOME: '/home/appuser',
  GIT_AUTHOR_NAME: 'Agent Orchestrator',
  GIT_COMMITTER_NAME: 'Agent Orchestrator',
  GIT_AUTHOR_EMAIL: 'agent@orchestrator.dev',
  GIT_COMMITTER_EMAIL: 'agent@orchestrator.dev',
};

function git(...args) {
  console.log(`$ git ${args.join(' ')}`);
  try {
    const out = execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8', timeout: 60000, env });
    if (out.trim()) console.log(out.trim());
    return out;
  } catch (e) {
    if (e.stdout) console.log(e.stdout);
    if (e.stderr) console.error(e.stderr);
    throw e;
  }
}

const files = [
  'src/migrations/047_sub_tasks.sql',
  'src/lib/subTaskDecomposer.ts',
  'src/lib/subTaskDecomposer.test.ts',
  'src/routes/sub-tasks.ts',
  'src/routes/sub-tasks.test.ts',
  'src/app.ts',
  '.edison-progress.md',
];

git('add', ...files);

try {
  git('commit', '-m',
    'feat(AOV-20): Auto task decomposition: complexity analysis, sub-task creation, and independent retry\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>'
  );
} catch (e) {
  console.log('Commit failed (maybe nothing staged):', e.message);
}

git('log', '--oneline', '-5');
git('status');

console.log('\n=== Running new tests ===');
try {
  if (!existsSync(cwd + '/node_modules')) {
    console.log('Installing dependencies...');
    execFileSync('/usr/local/bin/npm', ['install'], { cwd, encoding: 'utf8', timeout: 300000, env });
  }
  const vitestBin = cwd + '/node_modules/.bin/vitest';
  const testFiles = [
    'src/lib/subTaskDecomposer.test.ts',
    'src/routes/sub-tasks.test.ts',
  ];
  if (existsSync(vitestBin)) {
    const out = execFileSync(vitestBin, ['run', ...testFiles], {
      cwd, encoding: 'utf8', timeout: 180000, env: { ...env, NODE_ENV: 'test' },
    });
    console.log(out);
  }
} catch (e) {
  if (e.stdout) console.log(e.stdout);
  if (e.stderr) console.error(e.stderr);
  console.log('Test exit code:', e.status);
}

console.log('\n=== DONE ===');
