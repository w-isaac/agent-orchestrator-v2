import { symlinkSync, existsSync } from 'fs';
if (!existsSync('/bin/sh')) {
  symlinkSync('/bin/busybox', '/bin/sh');
  console.log('Created /bin/sh');
} else {
  console.log('/bin/sh already exists');
}
