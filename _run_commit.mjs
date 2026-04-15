import { execSync } from 'child_process';
import { symlinkSync, existsSync } from 'fs';

// Create /bin/sh symlink to busybox so shell commands work
if (!existsSync('/bin/sh')) {
  try {
    symlinkSync('/bin/busybox', '/bin/sh');
    console.log('Created /bin/sh -> /bin/busybox symlink');
  } catch (e) {
    console.error('Failed to create symlink:', e.message);
  }
}

const cwd = '/tmp/worktree-aov-23';

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
run('npx vitest run src/routes/static-serve.test.ts client/__tests__/utils.test.js');

// Stage files
run('git add client/index.html client/css/base.css client/css/components.css client/js/utils.js client/assets/.gitkeep client/__tests__/utils.test.js src/app.ts src/routes/static-serve.test.ts package.json vitest.config.ts');

// Commit
const commitMsg = `feat(AOV-23): Frontend scaffold: extract v1 static assets and serve via Docker

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`;
run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);

// Show status
run('git log --oneline -3');
run('git status');
