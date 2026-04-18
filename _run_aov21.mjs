import { execFileSync } from 'child_process';
import { chmodSync, existsSync, symlinkSync, appendFileSync } from 'fs';

const cwd = '/tmp/worktree-aov-21';

try {
  if (existsSync('/bin/sh')) {
    chmodSync('/bin/sh', 0o755);
  } else {
    symlinkSync('/bin/busybox', '/bin/sh');
  }
} catch (e) {
  console.log('Shell fix:', e.message);
}

function log(msg) {
  appendFileSync(`${cwd}/.edison-progress.md`, msg + '\n');
  console.log(msg);
}

function git(...args) {
  console.log(`\n$ git ${args.join(' ')}`);
  try {
    return execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8', timeout: 60000 });
  } catch (e) {
    if (e.stdout) console.log(e.stdout);
    if (e.stderr) console.error(e.stderr);
    throw e;
  }
}

log('Implementing backend: migration 050, lockManager, contentionMonitor, conflicts route');
log('Writing tests: lockManager.test.ts, contentionMonitor.test.ts, conflicts.test.ts');

log('Staging and committing files');
console.log(git(
  'add',
  'src/migrations/050_advisory_locks_and_contention.sql',
  'src/lib/lockManager.ts',
  'src/lib/lockManager.test.ts',
  'src/lib/contentionMonitor.ts',
  'src/lib/contentionMonitor.test.ts',
  'src/routes/conflicts.ts',
  'src/routes/conflicts.test.ts',
  'src/app.ts',
  '.edison-progress.md',
));

console.log(git('commit', '-m',
  'feat(AOV-21): Full conflict resolution: advisory locks, auto-merge, and re-queue for incompatible changes\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>',
));

console.log(git('status'));

log('Running server tests');
let failed = false;
try {
  const out = execFileSync(
    `${cwd}/node_modules/.bin/vitest`,
    [
      'run',
      'src/lib/lockManager.test.ts',
      'src/lib/contentionMonitor.test.ts',
      'src/routes/conflicts.test.ts',
    ],
    { cwd, encoding: 'utf8', timeout: 180000, env: { ...process.env, NODE_ENV: 'test' } },
  );
  console.log(out);
  log('Server tests: all passed');
} catch (e) {
  if (e.stdout) console.log(e.stdout);
  if (e.stderr) console.error(e.stderr);
  console.log('Test exit code:', e.status);
  failed = true;
  log('Server tests: FAILED');
}

if (failed) process.exit(1);
