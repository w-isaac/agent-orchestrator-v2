import { validateEnv, connectWithRetry, runMigrations } from './lib';
import app from './app';

async function main() {
  const config = validateEnv();

  const pool = await connectWithRetry();

  await runMigrations(pool, config.migrationsDir);

  app.listen(config.port, () => {
    console.log(`Server listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
