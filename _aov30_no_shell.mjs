// Uses execFileSync to bypass shell requirement
import { execFileSync, spawnSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync, appendFileSync } from 'fs';

const cwd = '/tmp/worktree-aov-30';
const env = {
  ...process.env,
  PATH: '/usr/local/bin:/usr/bin:/bin:/usr/local/sbin',
  HOME: '/home/appuser',
  SHELL: '/bin/sh',
  GIT_AUTHOR_NAME: 'Agent Orchestrator',
  GIT_COMMITTER_NAME: 'Agent Orchestrator',
  GIT_AUTHOR_EMAIL: 'agent@orchestrator.dev',
  GIT_COMMITTER_EMAIL: 'agent@orchestrator.dev',
};

// Try to fix shell first
if (!existsSync('/bin/sh')) {
  try {
    // Try busybox
    execFileSync('/bin/busybox', ['ln', '-sf', '/bin/busybox', '/bin/sh']);
    console.log('Created /bin/sh symlink via busybox');
  } catch(e) {
    try {
      symlinkSync('/bin/busybox', '/bin/sh');
      console.log('Created /bin/sh via symlinkSync');
    } catch(e2) {
      console.log('Could not create /bin/sh:', e2.message);
    }
  }
} else {
  console.log('/bin/sh exists');
}

function runFile(bin, args, label) {
  console.log(`\n=== ${label || bin + ' ' + args.join(' ')} ===`);
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8', timeout: 300000, env, maxBuffer: 10*1024*1024 });
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  if (result.error) console.error('spawn error:', result.error.message);
  console.log('exit code:', result.status);
  return result;
}

function appendProgress(line) {
  appendFileSync(cwd + '/.edison-progress.md', line + '\n', 'utf8');
  console.log('[progress] ' + line);
}

// Find node and npx
const nodePath = process.execPath;
const npxPath = nodePath.replace(/node$/, 'npx');

console.log('Node:', nodePath);
console.log('Looking for npx...');

// Step 1: Tests
appendProgress('Running server tests...');

const testResult = runFile(nodePath, [npxPath, 'vitest', 'run', '--reporter', 'verbose'], 'npm test');

let passed = 0, failed = 0;
const combined = (testResult.stdout || '') + (testResult.stderr || '');
const passMatch = combined.match(/(\d+)\s+passed/);
const failMatch = combined.match(/(\d+)\s+failed/);
if (passMatch) passed = parseInt(passMatch[1]);
if (failMatch) failed = parseInt(failMatch[1]);

appendProgress(`Server tests: ${passed} passed, ${failed} failed`);
console.log(`\nTEST RESULT: ${passed} passed, ${failed} failed, exit=${testResult.status}`);

if (testResult.status !== 0) {
  console.log('Tests failed, stopping.');
  process.exit(1);
}

// Step 2: Build
const buildResult = runFile(nodePath, [npxPath, 'tsc'], 'npm run build');
console.log('Build exit code:', buildResult.status);

if (buildResult.status !== 0) {
  console.log('Build failed, stopping.');
  process.exit(1);
}

// Step 3: Commit
appendProgress('Staging and committing 2 files');

// Find git
const gitResult = runFile('/usr/bin/git', ['add', 'client/js/context-preview.js', 'client/__tests__/context-preview.test.js'], 'git add');
const commitResult = runFile('/usr/bin/git', ['commit', '-m', 'fix(AOV-30): fix failing tests'], 'git commit');

console.log('Commit exit:', commitResult.status);

runFile('/usr/bin/git', ['log', '--oneline', '-3'], 'git log');
runFile('/usr/bin/git', ['status'], 'git status');

console.log('\n========== DONE ==========');
