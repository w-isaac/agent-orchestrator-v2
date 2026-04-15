import { execSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync } from 'fs';

// Create /bin/sh symlink to busybox so shell commands work
if (!existsSync('/bin/sh')) {
  try {
    symlinkSync('/bin/busybox', '/bin/sh');
    console.log('Created /bin/sh -> /bin/busybox symlink');
  } catch (e) {
    console.error('Failed to create symlink:', e.message);
  }
} else {
  try {
    chmodSync('/bin/sh', 0o755);
    console.log('/bin/sh already exists, ensured +x');
  } catch (e) {
    console.log('/bin/sh exists');
  }
}

const cwd = '/tmp/worktree-aov-15';

function run(cmd, opts = {}) {
  console.log(`\n--- ${cmd} ---`);
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf8', timeout: 120000, ...opts });
    console.log(out);
    return out;
  } catch (e) {
    console.error('FAILED:', e.message);
    if (e.stdout) console.log('stdout:', e.stdout.toString());
    if (e.stderr) console.log('stderr:', e.stderr.toString());
    throw e;
  }
}

// Install deps
run('npm install');

// Run tests
try {
  run('npx vitest run src/services/ingestion/pdfParser.test.ts src/services/ingestion/spreadsheetParser.test.ts src/services/ingestion/designFileParser.test.ts src/services/ingestion/ingestionPipeline.test.ts src/routes/ingestion.test.ts');
} catch (e) {
  console.error('Tests failed, see output above');
  process.exit(1);
}

// Stage files
run('git add src/migrations/009_parsed_units.sql src/migrations/004_create_ingested_files_and_ingestion_chunks.sql src/services/ingestion/fileTypeDetector.ts src/services/ingestion/pdfParser.ts src/services/ingestion/pdfParser.test.ts src/services/ingestion/spreadsheetParser.ts src/services/ingestion/spreadsheetParser.test.ts src/services/ingestion/designFileParser.ts src/services/ingestion/designFileParser.test.ts src/services/ingestion/ingestionPipeline.ts src/services/ingestion/ingestionPipeline.test.ts src/routes/ingestion.ts src/routes/ingestion.test.ts src/routes/index.ts src/app.ts');

// Commit
const commitMsg = 'feat(AOV-15): Extend ingestion with section-based PDF, per-sheet spreadsheet, and per-component design file parsing';
run(`git commit -m "${commitMsg}"`);

// Show status
run('git log --oneline -3');
run('git status');
