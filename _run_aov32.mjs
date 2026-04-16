import { execSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync } from 'fs';

if (!existsSync('/bin/sh')) {
  try { symlinkSync('/bin/busybox', '/bin/sh'); console.log('Created /bin/sh'); } catch (e) { console.error(e.message); }
} else {
  try { chmodSync('/bin/sh', 0o755); } catch (_) {}
}

const cwd = '/tmp/worktree-aov-32';
const env = { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/appuser', GIT_AUTHOR_NAME: 'Agent Orchestrator', GIT_COMMITTER_NAME: 'Agent Orchestrator', GIT_AUTHOR_EMAIL: 'agent@orchestrator.dev', GIT_COMMITTER_EMAIL: 'agent@orchestrator.dev' };

function run(cmd) {
  console.log(`\n=== ${cmd} ===`);
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf8', timeout: 300000, env });
    if (out) console.log(out);
    return out;
  } catch (e) {
    if (e.stdout) console.log(e.stdout);
    if (e.stderr) console.log(e.stderr);
    return null;
  }
}

// Git add and commit
const files = [
  'src/api/v2/projects.ts',
  'src/api/v2/index.ts',
  'src/api/v2/projects.test.ts',
  'src/app.ts',
  'client/dashboard.html',
  'client/css/dashboard.css',
  'client/js/dashboard.js',
  'client/index.html',
];

run(`git add ${files.join(' ')}`);
run(`git commit -m "feat(AOV-32): Project dashboard page with v2 API integration

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"`);
run('git log --oneline -3');
run('git status');

// Install deps and run tests
run('npm install --silent');
run('npx vitest run src/api/v2/projects.test.ts');
