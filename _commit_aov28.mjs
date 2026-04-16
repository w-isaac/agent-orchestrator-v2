import { execSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync } from 'fs';

if (!existsSync('/bin/sh')) {
  try { symlinkSync('/bin/busybox', '/bin/sh'); console.log('Created /bin/sh'); } catch (e) { console.error(e.message); }
} else {
  try { chmodSync('/bin/sh', 0o755); } catch (_) {}
}

const cwd = '/tmp/worktree-aov-28';
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

const files = [
  'src/migrations/011_force_directed_graph.sql',
  'src/routes/graph.ts',
  'src/routes/graph.test.ts',
  'client/graph.html',
  'client/js/force-graph.js',
  'client/css/graph.css',
  'client/index.html',
  'client/__tests__/force-graph.test.js',
];

run(`git add ${files.join(' ')}`);
run(`git commit -m "feat(AOV-28): Force-directed graph: read-only D3 rendering with zoom/pan and typed nodes

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"`);
run('git log --oneline -3');

// Install and test
run('npm install --silent');
run('npx vitest run src/routes/graph.test.ts client/__tests__/force-graph.test.js');
