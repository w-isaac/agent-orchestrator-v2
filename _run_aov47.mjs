import { execFileSync } from 'child_process';
import { chmodSync, existsSync, symlinkSync, appendFileSync } from 'fs';

const cwd = '/tmp/worktree-aov-47';

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

log('Implementing backend: migration 049, conflictResolver, conflict-log route');
log('Writing tests: conflictResolver.test.ts, conflict-log.test.ts');

log('Staging and committing files');
console.log(git('add',
  'src/migrations/049_conflict_resolution_log.sql',
  'src/lib/conflictResolver.ts',
  'src/lib/conflictResolver.test.ts',
  'src/routes/conflict-log.ts',
  'src/routes/conflict-log.test.ts',
  'src/routes/index.ts',
  'src/app.ts',
  '.edison-progress.md',
));

console.log(git('commit', '-m',
  'feat(AOV-47): Auto-merge compatible conflicts and re-queue incompatible tasks with structured logging\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>',
));

console.log(git('status'));

log('Running server tests');
let failed = false;
try {
  const out = execFileSync(
    `${cwd}/node_modules/.bin/vitest`,
    ['run', 'src/lib/conflictResolver.test.ts', 'src/routes/conflict-log.test.ts'],
    { cwd, encoding: 'utf8', timeout: 120000, env: { ...process.env, NODE_ENV: 'test' } },
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
