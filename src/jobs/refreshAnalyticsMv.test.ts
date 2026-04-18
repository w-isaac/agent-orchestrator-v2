import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRefresher,
  register,
  REFRESH_SQL,
  CRON_EXPRESSION,
} from './refreshAnalyticsMv';

const silentLogger = { info: () => {}, error: () => {} };

function makePool(queryImpl: (sql: string) => Promise<unknown>) {
  return { query: vi.fn(queryImpl) } as unknown as {
    query: ReturnType<typeof vi.fn>;
  };
}

describe('refreshAnalyticsMv', () => {
  const prevEnv = process.env.NODE_ENV;
  const prevFlag = process.env.ENABLE_ANALYTICS_CRON;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.ENABLE_ANALYTICS_CRON;
  });

  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
    if (prevFlag === undefined) delete process.env.ENABLE_ANALYTICS_CRON;
    else process.env.ENABLE_ANALYTICS_CRON = prevFlag;
  });

  describe('createRefresher', () => {
    it('issues the REFRESH MATERIALIZED VIEW CONCURRENTLY query', async () => {
      const pool = makePool(async () => ({ rows: [] }));
      const tick = createRefresher(pool as any, silentLogger);
      const ok = await tick();
      expect(ok).toBe(true);
      expect(pool.query).toHaveBeenCalledTimes(1);
      expect(pool.query).toHaveBeenCalledWith(REFRESH_SQL);
      expect(REFRESH_SQL).toMatch(/REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_run_metrics/);
    });

    it('skips overlapping ticks via in-memory lock', async () => {
      let resolveFirst: (v: unknown) => void = () => {};
      const firstPromise = new Promise((r) => {
        resolveFirst = r;
      });
      const pool = makePool(async () => firstPromise);
      const tick = createRefresher(pool as any, silentLogger);
      const a = tick();
      const b = await tick();
      expect(b).toBe(false);
      expect(pool.query).toHaveBeenCalledTimes(1);
      resolveFirst({ rows: [] });
      await a;
    });

    it('logs and swallows errors so the scheduled tick does not throw', async () => {
      const err = new Error('boom');
      const pool = makePool(async () => {
        throw err;
      });
      const errorLog = vi.fn();
      const tick = createRefresher(pool as any, { info: () => {}, error: errorLog });
      await expect(tick()).resolves.toBe(false);
      expect(errorLog).toHaveBeenCalled();
    });

    it('releases the lock after an error so later ticks can run', async () => {
      let call = 0;
      const pool = makePool(async () => {
        call += 1;
        if (call === 1) throw new Error('first');
        return { rows: [] };
      });
      const tick = createRefresher(pool as any, silentLogger);
      await tick();
      const ok = await tick();
      expect(ok).toBe(true);
      expect(pool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('register', () => {
    it('skips cron registration when NODE_ENV is test and flag is not set', () => {
      const scheduler = vi.fn();
      const pool = makePool(async () => ({ rows: [] }));
      const { cancel } = register({ pool: pool as any, logger: silentLogger, scheduler });
      expect(scheduler).not.toHaveBeenCalled();
      expect(typeof cancel).toBe('function');
    });

    it('schedules an hourly tick when enabled', () => {
      process.env.ENABLE_ANALYTICS_CRON = '1';
      const cancel = vi.fn();
      const scheduler = vi.fn(() => ({ cancel }));
      const pool = makePool(async () => ({ rows: [] }));
      register({ pool: pool as any, logger: silentLogger, scheduler });
      expect(scheduler).toHaveBeenCalledTimes(1);
      expect(scheduler.mock.calls[0][0]).toBe(60 * 60 * 1000);
      expect(typeof scheduler.mock.calls[0][1]).toBe('function');
    });

    it('runs the tick on each scheduler fire and tolerates DB errors', async () => {
      process.env.ENABLE_ANALYTICS_CRON = '1';
      let fire: () => void = () => {};
      const scheduler: any = vi.fn((_ms: number, handler: () => void) => {
        fire = handler;
        return { cancel: () => {} };
      });
      const pool = makePool(async () => {
        throw new Error('empty mv');
      });
      const errorLog = vi.fn();
      register({
        pool: pool as any,
        logger: { info: () => {}, error: errorLog },
        scheduler,
      });
      fire();
      await new Promise((r) => setImmediate(r));
      expect(pool.query).toHaveBeenCalledWith(REFRESH_SQL);
      expect(errorLog).toHaveBeenCalled();
    });

    it('exports the hourly cron expression', () => {
      expect(CRON_EXPRESSION).toBe('0 * * * *');
    });
  });
});
