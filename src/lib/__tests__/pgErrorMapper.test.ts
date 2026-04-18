import { describe, it, expect } from 'vitest';
import { mapPgError } from '../pgErrorMapper';

const PORT_FIELDS = ['deploy_port', 'frontend_port', 'backend_port', 'container_port'] as const;

function pgErr(code: string, constraint: string, message = 'pg error'): Error & { code: string; constraint: string } {
  const e = new Error(message) as Error & { code: string; constraint: string };
  e.code = code;
  e.constraint = constraint;
  return e;
}

describe('mapPgError — 23514 range check', () => {
  it.each(PORT_FIELDS)('maps projects_%s_port_range_check to 400 invalid_port_range', (field) => {
    const err = pgErr('23514', `projects_${field}_port_range_check`, 'violates check');
    const result = mapPgError(err, { [field]: 70000 });
    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error: 'invalid_port_range',
      field,
      message: 'violates check',
    });
  });
});

describe('mapPgError — 23505 port unique', () => {
  it.each(PORT_FIELDS)('maps projects_%s_port_unique to 409 port_conflict with payload value', (field) => {
    const payload = { [field]: 8080 };
    const err = pgErr('23505', `projects_${field}_port_unique`);
    const result = mapPgError(err, payload);
    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      error: 'port_conflict',
      field,
      value: 8080,
    });
  });

  it('returns undefined value when payload not provided', () => {
    const err = pgErr('23505', 'projects_deploy_port_unique');
    const result = mapPgError(err);
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      error: 'port_conflict',
      field: 'deploy_port',
      value: undefined,
    });
  });
});

describe('mapPgError — rethrow on unrecognised', () => {
  it('rethrows 23514 on non-matching constraint', () => {
    const err = pgErr('23514', 'projects_some_other_check');
    expect(() => mapPgError(err)).toThrow(err);
  });

  it('rethrows 23505 on non-matching constraint', () => {
    const err = pgErr('23505', 'ux_projects_name');
    expect(() => mapPgError(err)).toThrow(err);
  });

  it('rethrows unknown pg code (23502 NOT NULL)', () => {
    const err = pgErr('23502', 'projects_deploy_port_range_check');
    expect(() => mapPgError(err)).toThrow(err);
  });

  it('rethrows plain Error (no pg code)', () => {
    const err = new Error('boom');
    expect(() => mapPgError(err)).toThrow(err);
  });

  it('rethrows pg error with missing constraint', () => {
    const e = new Error('no constraint') as Error & { code: string };
    e.code = '23514';
    expect(() => mapPgError(e)).toThrow(e);
  });

  it('rethrows non-Error value', () => {
    expect(() => mapPgError('string error')).toThrow();
  });
});
