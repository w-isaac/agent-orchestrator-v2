import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

export interface MigrateOptions {
  sqlitePath: string;
  pgUrl: string;
  dryRun: boolean;
  verbose: boolean;
}

export function parseArgs(argv?: string[]): MigrateOptions {
  const parsed = yargs(argv ?? hideBin(process.argv))
    .usage('migrate-v1 [OPTIONS]')
    .option('sqlite-path', {
      type: 'string',
      demandOption: true,
      describe: 'Path to v1 SQLite database file (required)',
    })
    .option('pg-url', {
      type: 'string',
      describe: 'Postgres connection string (required unless --dry-run)',
    })
    .option('dry-run', {
      type: 'boolean',
      default: false,
      describe: 'Print summary without writing to Postgres',
    })
    .option('verbose', {
      type: 'boolean',
      default: false,
      describe: 'Log each record as it is processed',
    })
    .check((args) => {
      if (!args['dry-run'] && !args['pg-url']) {
        throw new Error('--pg-url is required when not using --dry-run');
      }
      return true;
    })
    .strict()
    .help()
    .parseSync();

  return {
    sqlitePath: parsed['sqlite-path'] as string,
    pgUrl: (parsed['pg-url'] as string) || '',
    dryRun: parsed['dry-run'] as boolean,
    verbose: parsed.verbose as boolean,
  };
}
