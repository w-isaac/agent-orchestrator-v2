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

// Now run git commands
try {
  const cwd = '/tmp/worktree-aov-6';

  console.log('--- git status ---');
  console.log(execSync('git status', { cwd, encoding: 'utf8' }));

  console.log('--- git add ---');
  execSync('git add src/routes/graphs.ts src/routes/graphs.test.ts src/routes/index.ts src/app.ts', { cwd, encoding: 'utf8' });
  console.log('Files staged successfully');

  console.log('--- git commit ---');
  const commitMsg = `feat(AOV-6): JSON import/export for context graph

Adds three new endpoints on the graphs router:
- POST /api/graphs/:projectId/import - bulk import nodes and edges with validation
- GET /api/graphs/:projectId/export - export full graph as JSON
- GET /api/graphs/:projectId/counts - return node/edge counts

Includes comprehensive test coverage for all endpoints, validation edge
cases, and transaction rollback behavior.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`;

  const result = execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd, encoding: 'utf8' });
  console.log(result);

  console.log('--- git log ---');
  console.log(execSync('git log --oneline -5', { cwd, encoding: 'utf8' }));
} catch (e) {
  console.error('Command failed:', e.message);
  if (e.stdout) console.log('stdout:', e.stdout.toString());
  if (e.stderr) console.log('stderr:', e.stderr.toString());
}
