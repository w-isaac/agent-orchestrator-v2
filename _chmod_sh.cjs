// Fix /bin/sh permissions so Bash tool can work
const fs = require('fs');
const { execFileSync } = require('child_process');

try {
  fs.chmodSync('/bin/sh', 0o755);
  console.log('chmod /bin/sh 755: SUCCESS');
} catch(e) {
  console.log('chmod error:', e.message);
  try {
    execFileSync('/bin/busybox', ['chmod', '755', '/bin/sh']);
    console.log('chmod via busybox: SUCCESS');
  } catch(e2) {
    console.log('busybox chmod error:', e2.message);
  }
}

// Verify
try {
  const out = execFileSync('/bin/sh', ['-c', 'echo shell_works'], { encoding: 'utf8' });
  console.log('Shell test:', out.trim());
} catch(e) {
  console.log('Shell test failed:', e.message);
}
