const fs = require('fs');
const { execFileSync } = require('child_process');

const cwd = '/tmp/worktree-aov-151';
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

// Ensure /bin/sh exists
try {
  fs.statSync('/bin/sh');
} catch {
  try { fs.symlinkSync('/bin/busybox', '/bin/sh'); fs.chmodSync('/bin/sh', 0o755); } catch {}
}

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

const npxPath = '/usr/local/bin/npx';

// Append progress
fs.appendFileSync(cwd + '/.edison-progress.md',
  'Reading spec and AGENTS.md\nPlanning implementation approach\nImplementing migration: 20260418_012_architect_agent_schema.up.sql, 20260418_012_architect_agent_schema.down.sql\nWriting tests: 20260418_012_architect_agent_schema.test.ts\nRunning server tests...\n');

// Run tests first
const testRes = run(process.execPath, [npxPath, '--yes', 'vitest', 'run', '--reporter', 'verbose',
  'src/migrations/20260418_012_architect_agent_schema.test.ts'
], 'vitest run');

fs.appendFileSync(cwd + '/.edison-progress.md',
  (testRes.ok ? 'Server tests: all passed\nStaging and committing files\n'
              : 'Server tests: FAILED\n'));

if (!testRes.ok) process.exit(1);

run('/usr/bin/git', ['add',
  'src/migrations/20260418_012_architect_agent_schema.up.sql',
  'src/migrations/20260418_012_architect_agent_schema.down.sql',
  'src/migrations/20260418_012_architect_agent_schema.test.ts',
  '.edison-progress.md',
], 'git add');

run('/usr/bin/git', ['status'], 'git status');

run('/usr/bin/git', ['commit', '-m',
  'feat(AOV-151): DDL migration: complexity/file_count columns, architecture artifact type, architect agent type, and indexes\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>'
], 'git commit');

run('/usr/bin/git', ['log', '--oneline', '-3'], 'git log');
console.log('\n========== DONE ==========');
