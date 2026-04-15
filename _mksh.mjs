import { symlinkSync, existsSync } from 'fs';
import { execSync } from 'child_process';
if (!existsSync('/bin/sh')) {
  symlinkSync('/bin/busybox', '/bin/sh');
  console.log('created /bin/sh');
}
// Now run run.sh
try {
  const out = execSync('/bin/sh /tmp/worktree-aov-11/run.sh', { encoding: 'utf8', timeout: 180000, stdio: 'pipe' });
  console.log(out);
} catch (e) {
  if (e.stdout) console.log(e.stdout);
  if (e.stderr) console.error(e.stderr);
  console.error('Exit code:', e.status);
}
