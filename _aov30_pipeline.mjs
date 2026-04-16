import { execSync, execFileSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync, appendFileSync } from 'fs';

// Ensure /bin/sh exists
if (!existsSync('/bin/sh')) {
  try {
    symlinkSync('/bin/busybox', '/bin/sh');
    console.log('Created /bin/sh -> /bin/busybox');
  } catch (e) {
    console.error('Failed to create /bin/sh:', e.message);
  }
} else {
  try { chmodSync('/bin/sh', 0o755); } catch (_) {}
  console.log('/bin/sh already exists');
}

const cwd = '/tmp/worktree-aov-30';
const env = {
  ...process.env,
  PATH: '/usr/local/bin:/usr/bin:/bin',
  HOME: '/home/appuser',
  SHELL: '/bin/sh',
  GIT_AUTHOR_NAME: 'Agent Orchestrator',
  GIT_COMMITTER_NAME: 'Agent Orchestrator',
  GIT_AUTHOR_EMAIL: 'agent@orchestrator.dev',
  GIT_COMMITTER_EMAIL: 'agent@orchestrator.dev',
};

function run(cmd, throwOnError = false) {
  console.log(`\n=== ${cmd} ===`);
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf8', timeout: 300000, env });
    if (out) console.log(out);
    return { success: true, output: out };
  } catch (e) {
    console.error('FAILED:', e.message?.slice(0, 300));
    if (e.stdout) console.log('stdout:', e.stdout.slice(-3000));
    if (e.stderr) console.log('stderr:', e.stderr.slice(-2000));
    if (throwOnError) throw e;
    return { success: false, output: e.stdout || '', stderr: e.stderr || '', error: e };
  }
}

function appendProgress(line) {
  try {
    appendFileSync(cwd + '/.edison-progress.md', line + '\n', 'utf8');
    console.log('[progress] ' + line);
  } catch(e) {
    console.error('Failed to append progress:', e.message);
  }
}

// Step 1: Run tests
console.log('\n========== STEP 1: npm test ==========');
appendProgress('Running server tests...');

const testResult = run('npx vitest run 2>&1');

// Parse test results
let passed = 0, failed = 0;
if (testResult.output) {
  const passMatch = testResult.output.match(/(\d+)\s+passed/);
  const failMatch = testResult.output.match(/(\d+)\s+failed/);
  if (passMatch) passed = parseInt(passMatch[1]);
  if (failMatch) failed = parseInt(failMatch[1]);
}

appendProgress(`Server tests: ${passed} passed, ${failed} failed`);
console.log(`\nTEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log('Tests success:', testResult.success);

if (!testResult.success) {
  console.log('\n========== TESTS FAILED — STOPPING ==========');
  process.exit(1);
}

// Step 2: Build
console.log('\n========== STEP 2: npm run build ==========');
const buildResult = run('npx tsc 2>&1');
console.log('Build success:', buildResult.success);

if (!buildResult.success) {
  console.log('\n========== BUILD FAILED — STOPPING ==========');
  process.exit(1);
}

// Step 3: Git commit
console.log('\n========== STEP 3: git commit ==========');
appendProgress('Staging and committing 2 files');

run('git add client/js/context-preview.js client/__tests__/context-preview.test.js');
const commitResult = run('git commit -m "fix(AOV-30): fix failing tests"');

console.log('\nCommit success:', commitResult.success);
run('git log --oneline -3');
run('git status');

console.log('\n========== PIPELINE COMPLETE ==========');
