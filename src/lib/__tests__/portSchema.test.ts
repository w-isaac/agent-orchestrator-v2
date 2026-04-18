import { describe, it, expect } from 'vitest';
import { portSchema } from '../portSchema';

describe('portSchema', () => {
  describe('accepts', () => {
    it.each([1, 80, 443, 3000, 65535, null])('accepts %s', (v) => {
      const r = portSchema.safeParse(v);
      expect(r.success).toBe(true);
    });
  });

  describe('rejects', () => {
    it.each([0, 65536, -1, -1000, 3.5, NaN])('rejects number %s', (v) => {
      const r = portSchema.safeParse(v);
      expect(r.success).toBe(false);
    });

    it.each(['80', '1', 'abc'])('rejects string %s', (v) => {
      const r = portSchema.safeParse(v);
      expect(r.success).toBe(false);
    });

    it('rejects undefined', () => {
      expect(portSchema.safeParse(undefined).success).toBe(false);
    });

    it('rejects object', () => {
      expect(portSchema.safeParse({}).success).toBe(false);
    });

    it('rejects boolean', () => {
      expect(portSchema.safeParse(true).success).toBe(false);
    });
  });
});
