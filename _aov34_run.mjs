import { execSync } from 'child_process';
import { existsSync, chmodSync } from 'fs';

// Ensure /bin/sh is executable
if (existsSync('/bin/sh')) {
  try { chmodSync('/bin/sh', 0o755); } catch (_) {}
  console.log('/bin/sh exists');
} else {
  console.error('/bin/sh does not exist!');
  process.exit(1);
}

const cwd = '/tmp/worktree-aov-34';

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

// Step 1: Show current status
run('git status');

// Step 2: git add the three files
run('git add src/agents/claude-code-adapter.ts src/agents/claude-code-adapter.test.ts src/agents/index.ts');

// Step 3: git commit
const commitMsg = 'feat(AOV-34): ClaudeCodeAdapter: unit tests for submit, checkStatus, and cancel\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>';
run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);

// Step 4: Show commit
run('git log --oneline -3');
run('git status');

// Step 5: Install deps
console.log('\n\n========== INSTALLING DEPENDENCIES ==========');
run('npm install --silent');

// Step 6: Run tests
console.log('\n\n========== RUNNING TESTS ==========');
run('npx vitest run src/agents/claude-code-adapter.test.ts');
