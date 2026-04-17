const { execFileSync, execSync } = require('child_process');
const { chmodSync, existsSync, symlinkSync, statSync, unlinkSync } = require('fs');

// First, try to fix or create /bin/sh
try {
  // Check if /bin/sh exists at all
  try {
    const stats = statSync('/bin/sh');
    console.log('/bin/sh exists, mode:', '0' + (stats.mode & 0o7777).toString(8));
    chmodSync('/bin/sh', 0o755);
    console.log('Fixed /bin/sh permissions to 755');
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log('/bin/sh does not exist, creating symlink to busybox...');
      symlinkSync('/bin/busybox', '/bin/sh');
      chmodSync('/bin/busybox', 0o755);
      console.log('Created /bin/sh -> /bin/busybox');
    } else {
      console.log('Error checking /bin/sh:', e.message);
      // Try chmod anyway
      try { chmodSync('/bin/sh', 0o755); } catch(e2) { console.log('chmod failed too:', e2.message); }
    }
  }
} catch (e) {
  console.log('Shell fix failed:', e.message);
}

// Verify shell works
try {
  const out = execFileSync('/bin/sh', ['-c', 'echo shell_works'], { encoding: 'utf8', timeout: 5000 });
  console.log('Shell test:', out.trim());
} catch(e) {
  console.log('Shell test failed:', e.message);
  // Try busybox sh directly
  try {
    const out = execFileSync('/bin/busybox', ['sh', '-c', 'echo busybox_shell_works'], { encoding: 'utf8', timeout: 5000 });
    console.log('Busybox shell test:', out.trim());
  } catch(e2) {
    console.log('Busybox shell test also failed:', e2.message);
  }
}

console.log('DONE_FIX');
