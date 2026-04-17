const { execFileSync } = require('child_process');
const fs = require('fs');

// Create /bin/sh symlink from busybox
try {
  execFileSync('/bin/busybox', ['ln', '-sf', '/bin/busybox', '/bin/sh']);
  console.log('Created /bin/sh -> /bin/busybox');
} catch(e) {
  try {
    fs.symlinkSync('/bin/busybox', '/bin/sh');
    console.log('Created symlink via fs');
  } catch(e2) {
    console.log('Error:', e2.message);
  }
}

// Verify
try {
  const out = execFileSync('/bin/sh', ['-c', 'echo shell_ok'], { encoding: 'utf8' });
  console.log('Verify:', out.trim());
} catch(e) {
  console.log('Verify failed:', e.message);
}
