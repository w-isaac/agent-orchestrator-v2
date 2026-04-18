import { describe, it, expect } from 'vitest';
import { createProjectSchema, patchProjectSchema, PORT_FIELDS } from '../projectSchemas';

describe('createProjectSchema', () => {
  it('accepts minimal valid payload (name only)', () => {
    const r = createProjectSchema.safeParse({ name: 'My Project' });
    expect(r.success).toBe(true);
  });

  it('requires name', () => {
    const r = createProjectSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it.each(PORT_FIELDS)('accepts valid integer for %s', (field) => {
    const r = createProjectSchema.safeParse({ name: 'P', [field]: 3000 });
    expect(r.success).toBe(true);
  });

  it.each(PORT_FIELDS)('accepts null for %s', (field) => {
    const r = createProjectSchema.safeParse({ name: 'P', [field]: null });
    expect(r.success).toBe(true);
  });

  it.each(PORT_FIELDS)('accepts omission of %s', (field) => {
    const payload: Record<string, unknown> = { name: 'P' };
    for (const f of PORT_FIELDS) if (f !== field) payload[f] = 80;
    const r = createProjectSchema.safeParse(payload);
    expect(r.success).toBe(true);
  });

  it.each(PORT_FIELDS)('rejects out-of-range port for %s', (field) => {
    const r = createProjectSchema.safeParse({ name: 'P', [field]: 70000 });
    expect(r.success).toBe(false);
  });

  it.each(PORT_FIELDS)('rejects non-integer port for %s', (field) => {
    const r = createProjectSchema.safeParse({ name: 'P', [field]: 3.5 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toContain(field);
    }
  });
});

describe('patchProjectSchema', () => {
  it('accepts empty object (fully partial)', () => {
    const r = patchProjectSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('accepts partial name update', () => {
    const r = patchProjectSchema.safeParse({ name: 'New Name' });
    expect(r.success).toBe(true);
  });

  it.each(PORT_FIELDS)('accepts partial %s update', (field) => {
    const r = patchProjectSchema.safeParse({ [field]: 8080 });
    expect(r.success).toBe(true);
  });

  it.each(PORT_FIELDS)('accepts null %s clear', (field) => {
    const r = patchProjectSchema.safeParse({ [field]: null });
    expect(r.success).toBe(true);
  });

  it.each(PORT_FIELDS)('rejects invalid %s', (field) => {
    const r = patchProjectSchema.safeParse({ [field]: 'not-a-number' });
    expect(r.success).toBe(false);
  });
});
