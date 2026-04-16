import { execSync, execFileSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync } from 'fs';

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
const env = { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/appuser', SHELL: '/bin/sh' };

function run(cmd, args) {
  console.log(`\n=== ${cmd} ${args.join(' ')} ===`);
  try {
    const out = execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout: 300000, env });
    if (out) console.log(out);
    return out;
  } catch (e) {
    console.error('FAILED:', e.message?.slice(0, 200));
    if (e.stdout) console.log('stdout:', e.stdout.slice(-3000));
    if (e.stderr) console.log('stderr:', e.stderr.slice(-1000));
    return null;
  }
}

run('npm', ['install', '--silent']);
run('npx', ['vitest', 'run', 'src/routes/stories.test.ts', 'client/__tests__/context-preview.test.js']);
