// This file exists to document the /bin/sh permission fix needed
const fs = require('fs');
fs.chmodSync('/bin/sh', 0o755);
console.log('done');
