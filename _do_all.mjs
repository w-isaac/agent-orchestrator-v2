import { execSync } from 'child_process';
import { symlinkSync, existsSync, chmodSync } from 'fs';

// Ensure /bin/sh exists
if (!existsSync('/bin/sh')) {
  try {
    symlinkSync('/bin/busybox', '/bin/sh');
    console.log('Created /bin/sh -> /bin/busybox');
  } catch (e) {
    console.error('Failed to create /bin/sh:', e.message);
  }
} else {
  try { chmodSync('/bin/sh', 0o755); } catch (_) {}
  console.log('/bin/sh already exists');
}

const cwd = '/tmp/worktree-aov-15';

function run(cmd, opts = {}) {
  console.log(`\n=== ${cmd} ===`);
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      timeout: 300000,
      env: { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/home/appuser', GIT_AUTHOR_NAME: 'Agent Orchestrator', GIT_COMMITTER_NAME: 'Agent Orchestrator', GIT_AUTHOR_EMAIL: 'agent@orchestrator.dev', GIT_COMMITTER_EMAIL: 'agent@orchestrator.dev' },
      ...opts
    });
    if (out) console.log(out);
    return out;
  } catch (e) {
    console.error('FAILED:', e.message);
    if (e.stdout) console.log('stdout:', e.stdout);
    if (e.stderr) console.log('stderr:', e.stderr);
    return null;
  }
}

// Step 1: git add
const files = [
  'src/migrations/009_parsed_units.sql',
  'src/migrations/004_create_ingested_files_and_ingestion_chunks.sql',
  'src/services/ingestion/fileTypeDetector.ts',
  'src/services/ingestion/pdfParser.ts',
  'src/services/ingestion/pdfParser.test.ts',
  'src/services/ingestion/spreadsheetParser.ts',
  'src/services/ingestion/spreadsheetParser.test.ts',
  'src/services/ingestion/designFileParser.ts',
  'src/services/ingestion/designFileParser.test.ts',
  'src/services/ingestion/ingestionPipeline.ts',
  'src/services/ingestion/ingestionPipeline.test.ts',
  'src/routes/ingestion.ts',
  'src/routes/ingestion.test.ts',
  'src/routes/index.ts',
  'src/app.ts'
];

run(`git add ${files.join(' ')}`);

// Step 2: git commit
const commitMsg = `feat(AOV-15): Extend ingestion with section-based PDF, per-sheet spreadsheet, and per-component design file parsing

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`;

run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);

// Step 3: Show commit hash
run('git log --oneline -3');
run('git status');

// Step 4: Install deps
console.log('\n\n========== INSTALLING DEPENDENCIES ==========');
run('npm install');

// Step 5: Run tests
console.log('\n\n========== RUNNING TESTS ==========');
const testFiles = [
  'src/services/ingestion/pdfParser.test.ts',
  'src/services/ingestion/spreadsheetParser.test.ts',
  'src/services/ingestion/designFileParser.test.ts',
  'src/services/ingestion/ingestionPipeline.test.ts',
  'src/routes/ingestion.test.ts'
];
run(`npx vitest run ${testFiles.join(' ')}`);
