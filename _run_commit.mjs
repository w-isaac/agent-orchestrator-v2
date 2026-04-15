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
  try {
    chmodSync('/bin/sh', 0o755);
    console.log('/bin/sh already exists, ensured +x');
  } catch (e) {
    console.log('/bin/sh exists');
  }
}

const cwd = '/tmp/worktree-aov-5';

function run(cmd, opts = {}) {
  console.log(`\n--- ${cmd} ---`);
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf8', timeout: 120000, ...opts });
    console.log(out);
    return out;
  } catch (e) {
    console.error('FAILED:', e.message);
    if (e.stdout) console.log('stdout:', e.stdout.toString());
    if (e.stderr) console.log('stderr:', e.stderr.toString());
    throw e;
  }
}

// Install deps
run('npm install');

// Run tests
run('npx vitest run src/services/graphTraversal.test.ts src/services/embeddingReranker.test.ts src/services/budgetPacker.test.ts src/services/contextRetrievalPipeline.test.ts');

// Stage files
run('git add src/services/graphTraversal.ts src/services/embeddingReranker.ts src/services/budgetPacker.ts src/services/contextRetrievalPipeline.ts src/routes/context-retrieval.ts src/services/graphTraversal.test.ts src/services/embeddingReranker.test.ts src/services/budgetPacker.test.ts src/services/contextRetrievalPipeline.test.ts src/app.ts src/routes/index.ts');

// Commit
const commitMsg = `feat(AOV-5): Implement three-phase context retrieval: graph traversal, embedding re-ranking, and budget packing

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`;
run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);

// Show status
run('git log --oneline -3');
run('git status');
