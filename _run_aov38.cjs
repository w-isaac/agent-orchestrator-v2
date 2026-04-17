const fs = require('fs');
const { execFileSync } = require('child_process');

const cwd = '/tmp/worktree-aov-38';
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
    const out = execFileSync(bin, args, { cwd, encoding: 'utf8', timeout: 300000, env, maxBuffer: 10*1024*1024 });
    console.log(out);
    return { ok: true, out };
  } catch(e) {
    console.log('STDOUT:', e.stdout || '');
    console.error('STDERR:', e.stderr || '');
    console.error('Exit code:', e.status);
    return { ok: false, error: e };
  }
}

// Fix shell if needed
try {
  execFileSync('/bin/sh', ['-c', 'echo ok'], { encoding: 'utf8' });
} catch(e) {
  try {
    fs.symlinkSync('/bin/busybox', '/bin/sh');
    console.log('Created /bin/sh symlink');
  } catch(e2) {
    try {
      execFileSync('/bin/busybox', ['ln', '-sf', '/bin/busybox', '/bin/sh']);
      console.log('Created /bin/sh via busybox');
    } catch(e3) { console.log('Shell fix failed:', e3.message); }
  }
}

// Run tests
console.log('\n========= TESTS =========');
const nodePath = process.execPath;
const npxPath = '/usr/local/bin/npx';
const testResult = run(nodePath, [npxPath, '--yes', 'vitest', 'run', '--reporter', 'verbose',
  'src/routes/context-nodes-crud.test.ts',
  'src/lib/contextGraph.test.ts',
  'src/lib/resultNormalizer.test.ts',
  'src/lib/outputValidator.test.ts',
], 'vitest run');

// Git operations
console.log('\n========= GIT =========');
run('/usr/bin/git', ['status'], 'git status');

run('/usr/bin/git', ['add',
  'src/migrations/044_context_graph.sql',
  'src/routes/context-nodes-crud.ts',
  'src/routes/context-nodes-crud.test.ts',
  'src/lib/contextGraph.ts',
  'src/lib/contextGraph.test.ts',
  'src/lib/resultNormalizer.ts',
  'src/lib/resultNormalizer.test.ts',
  'src/lib/outputValidator.ts',
  'src/lib/outputValidator.test.ts',
  'src/routes/index.ts',
  'src/app.ts',
  '.edison-progress.md',
], 'git add');

run('/usr/bin/git', ['commit', '-m',
  'feat(AOV-38): Context node endpoints, result normalizer, and output validator\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>'
], 'git commit');

run('/usr/bin/git', ['log', '--oneline', '-5'], 'git log');

console.log('\n========== DONE ==========');
