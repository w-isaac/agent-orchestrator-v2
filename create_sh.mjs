// This script creates /bin/sh as a symlink to /bin/busybox
// Run with: node /tmp/worktree-aov-16/create_sh.mjs
import { symlinkSync, existsSync, unlinkSync, lstatSync, readlinkSync } from 'fs';

try {
  const stats = lstatSync('/bin/sh');
  console.log('lstat /bin/sh:', { isSymlink: stats.isSymbolicLink(), isFile: stats.isFile(), mode: stats.mode.toString(8), size: stats.size });
  if (stats.isSymbolicLink()) {
    console.log('symlink target:', readlinkSync('/bin/sh'));
  }
} catch (e) {
  console.log('/bin/sh does not exist:', e.message);
  try {
    symlinkSync('/bin/busybox', '/bin/sh');
    console.log('Created /bin/sh -> /bin/busybox');
  } catch (e2) {
    console.error('Failed to create symlink:', e2.message);
  }
}
