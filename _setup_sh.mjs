#!/usr/local/bin/node
import { symlinkSync, existsSync, lstatSync, readlinkSync } from 'fs';
import { execFileSync } from 'child_process';

try {
  const stats = lstatSync('/bin/sh');
  console.log('/bin/sh exists already');
  if (stats.isSymbolicLink()) {
    console.log('symlink target:', readlinkSync('/bin/sh'));
  }
} catch (e) {
  console.log('/bin/sh does not exist, creating symlink...');
  try {
    symlinkSync('/bin/busybox', '/bin/sh');
    console.log('Created /bin/sh -> /bin/busybox');
  } catch (e2) {
    console.error('Failed to create symlink:', e2.message);
    process.exit(1);
  }
}

// Verify it works
try {
  const result = execFileSync('/bin/sh', ['-c', 'echo shell_works'], { encoding: 'utf8' });
  console.log('Verification:', result.trim());
} catch (e) {
  console.error('Shell verification failed:', e.message);
  process.exit(1);
}
