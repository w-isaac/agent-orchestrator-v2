import { execSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync } from 'fs';

// Create /bin/sh symlink to busybox so shell commands work
if (!existsSync('/bin/sh')) {
  try {
    symlinkSync('/bin/busybox', '/bin/sh');
    console.log('Created /bin/sh -> /bin/busybox symlink');
  } catch (e) {
    console.error('Failed to create symlink:', e.message);
  }
} else {
  try { chmodSync('/bin/sh', 0o755); } catch (_) {}
  console.log('/bin/sh already exists');
}

const cwd = '/tmp/worktree-aov-16';

function run(cmd, opts = {}) {
  console.log(`\n=== ${cmd} ===`);
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      timeout: 300000,
      env: {
        ...process.env,
        PATH: '/usr/local/bin:/usr/bin:/bin',
        HOME: '/home/appuser',
        GIT_AUTHOR_NAME: 'Agent Orchestrator',
        GIT_COMMITTER_NAME: 'Agent Orchestrator',
        GIT_AUTHOR_EMAIL: 'agent@orchestrator.dev',
        GIT_COMMITTER_EMAIL: 'agent@orchestrator.dev',
      },
      ...opts,
    });
    if (out) console.log(out);
    return out;
  } catch (e) {
    console.error('FAILED:', e.message);
    if (e.stdout) console.log('stdout:', e.stdout);
    if (e.stderr) console.log('stderr:', e.stderr);
    return null;
  }
}

// Step 1: Install deps
console.log('\n========== INSTALLING DEPENDENCIES ==========');
run('npm install');

// Step 2: Run tests
console.log('\n========== RUNNING TESTS ==========');
const testResult = run('npx vitest run src/lib/importParser.test.ts src/lib/wikiLinkParser.test.ts src/lib/embeddingSimilarity.test.ts src/lib/directoryResolver.test.ts src/services/edgeDerivation.test.ts src/routes/graph.test.ts');

// Step 3: Stage and commit
console.log('\n========== STAGING AND COMMITTING ==========');
const files = [
  'src/migrations/010_context_graph_edges.sql',
  'src/lib/importParser.ts',
  'src/lib/importParser.test.ts',
  'src/lib/wikiLinkParser.ts',
  'src/lib/wikiLinkParser.test.ts',
  'src/lib/embeddingSimilarity.ts',
  'src/lib/embeddingSimilarity.test.ts',
  'src/lib/directoryResolver.ts',
  'src/lib/directoryResolver.test.ts',
  'src/services/edgeDerivation.ts',
  'src/services/edgeDerivation.test.ts',
  'src/routes/graph.ts',
  'src/routes/graph.test.ts',
  'src/routes/index.ts',
  'src/app.ts',
];

run(`git add ${files.join(' ')}`);

const commitMsg = `feat(AOV-16): Auto edge creation for context graph on ingestion

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`;

run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);

// Step 4: Verify
run('git log --oneline -3');
run('git status');
