import { validateEnv, connectWithRetry, runMigrations } from './lib';
import app from './app';
import { register as registerAnalyticsRefresh } from './jobs/refreshAnalyticsMv';

async function main() {
  const config = validateEnv();

  const pool = await connectWithRetry();

  await runMigrations(pool, config.migrationsDir);

  registerAnalyticsRefresh({ pool });

  app.listen(config.port, () => {
    console.log(`Server listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
