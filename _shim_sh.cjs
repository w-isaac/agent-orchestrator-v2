#!/usr/local/bin/node
// Minimal /bin/sh shim - passes commands to busybox sh
const { execFileSync } = require('child_process');
const args = process.argv.slice(2);
try {
  const result = execFileSync('/bin/busybox', ['sh', ...args], {
    encoding: 'utf8',
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd()
  });
} catch(e) {
  process.exit(e.status || 1);
}
