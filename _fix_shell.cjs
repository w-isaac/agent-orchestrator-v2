const fs = require('fs');
const { execFileSync } = require('child_process');

// Use busybox to create the symlink
try {
  execFileSync('/bin/busybox', ['ln', '-sf', '/bin/busybox', '/bin/sh']);
  console.log('Created /bin/sh -> /bin/busybox symlink');
} catch(e) {
  console.log('ln error:', e.message);
}

// Verify
try {
  const result = execFileSync('/bin/sh', ['-c', 'echo shell works']).toString().trim();
  console.log('Test:', result);
} catch(e) {
  console.log('Shell test error:', e.message);
}
