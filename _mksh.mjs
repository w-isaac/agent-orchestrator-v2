import { symlinkSync, existsSync } from 'fs';
if (!existsSync('/bin/sh')) {
  symlinkSync('/bin/busybox', '/bin/sh');
  console.log('created /bin/sh');
}
