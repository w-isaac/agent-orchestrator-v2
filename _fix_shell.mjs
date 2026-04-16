import { symlinkSync, existsSync, chmodSync, statSync } from 'fs';
import { execSync } from 'child_process';

// Create /bin/sh symlink to busybox if it doesn't exist
if (!existsSync('/bin/sh')) {
  console.log('Creating /bin/sh -> /bin/busybox symlink');
  symlinkSync('/bin/busybox', '/bin/sh');
} else {
  // It exists but may not be executable - try chmod
  try {
    chmodSync('/bin/sh', 0o755);
    console.log('chmod done on /bin/sh');
  } catch(e) {
    console.log('chmod error:', e.message);
  }
}

// Verify
const stat = statSync('/bin/sh');
console.log('/bin/sh mode:', '0' + (stat.mode & 0o7777).toString(8));
console.log('/bin/sh size:', stat.size);

// Test it works
try {
  const result = execSync('/bin/sh -c "echo shell works"').toString().trim();
  console.log('Test result:', result);
} catch(e) {
  console.log('Shell test failed:', e.message);
}
