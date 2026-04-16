// Bootstrap: make /bin/sh executable
const fs = require('fs');

// Check current state
try {
  const stat = fs.statSync('/bin/sh');
  const mode = (stat.mode & 0o7777).toString(8);
  console.log('/bin/sh current mode: 0' + mode, 'size:', stat.size, 'isSymlink:', fs.lstatSync('/bin/sh').isSymbolicLink());
} catch(e) {
  console.log('/bin/sh stat error:', e.message);
}

// Try to chmod
try {
  fs.chmodSync('/bin/sh', 0o755);
  console.log('chmod /bin/sh to 755: SUCCESS');
} catch(e) {
  console.log('chmod error:', e.message);
  // Try alternative: create symlink in a writable location
  try {
    fs.symlinkSync('/bin/busybox', '/tmp/sh');
    fs.chmodSync('/tmp/sh', 0o755);
    console.log('Created /tmp/sh -> /bin/busybox');
  } catch(e2) {
    console.log('symlink error:', e2.message);
  }
}

// Verify
try {
  const stat2 = fs.statSync('/bin/sh');
  console.log('/bin/sh new mode: 0' + (stat2.mode & 0o7777).toString(8));
} catch(e) {
  console.log('verify error:', e.message);
}
