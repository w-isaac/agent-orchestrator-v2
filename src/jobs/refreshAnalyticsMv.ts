import type { Pool } from 'pg';

export const REFRESH_SQL = 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_run_metrics';
export const CRON_EXPRESSION = '0 * * * *';
const HOURLY_MS = 60 * 60 * 1000;

export interface RefreshLogger {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface Scheduler {
  (intervalMs: number, handler: () => void): { cancel: () => void };
}

export const defaultScheduler: Scheduler = (intervalMs, handler) => {
  const h = setInterval(handler, intervalMs);
  if (typeof (h as NodeJS.Timeout).unref === 'function') {
    (h as NodeJS.Timeout).unref();
  }
  return { cancel: () => clearInterval(h) };
};

export function createRefresher(pool: Pool, logger: RefreshLogger = console) {
  let running = false;
  const tick = async (): Promise<boolean> => {
    if (running) {
      logger.info('[analytics] refresh already in progress; skipping tick');
      return false;
    }
    running = true;
    try {
      await pool.query(REFRESH_SQL);
      logger.info('[analytics] mv_daily_run_metrics refreshed');
      return true;
    } catch (err) {
      logger.error('[analytics] mv_daily_run_metrics refresh failed', err);
      return false;
    } finally {
      running = false;
    }
  };
  return tick;
}

export interface RegisterOptions {
  pool: Pool;
  logger?: RefreshLogger;
  scheduler?: Scheduler;
  intervalMs?: number;
}

export function register(opts: RegisterOptions): { cancel: () => void; tick: () => Promise<boolean> } {
  const logger = opts.logger ?? console;
  if (process.env.NODE_ENV === 'test' && process.env.ENABLE_ANALYTICS_CRON !== '1') {
    logger.info('[analytics] skipping cron registration in test env');
    return { cancel: () => {}, tick: async () => false };
  }
  const scheduler = opts.scheduler ?? defaultScheduler;
  const interval = opts.intervalMs ?? HOURLY_MS;
  const tick = createRefresher(opts.pool, logger);
  const handle = scheduler(interval, () => {
    void tick();
  });
  logger.info(`[analytics] hourly refresh registered (cron ${CRON_EXPRESSION})`);
  return { cancel: handle.cancel, tick };
}

export default { register, createRefresher, REFRESH_SQL, CRON_EXPRESSION };
