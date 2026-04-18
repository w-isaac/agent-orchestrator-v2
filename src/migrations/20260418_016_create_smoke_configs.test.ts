import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIG_DIR = path.resolve(__dirname);
const UP = fs.readFileSync(path.join(MIG_DIR, '20260418_016_create_smoke_configs.up.sql'), 'utf-8');
const DOWN = fs.readFileSync(path.join(MIG_DIR, '20260418_016_create_smoke_configs.down.sql'), 'utf-8');

describe('AOV-194 smoke_configs migration (SQL contents)', () => {
  it('up creates smoke_configs with all required columns', () => {
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS smoke_configs/i);
    expect(UP).toMatch(/id\s+UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
    expect(UP).toMatch(/project_id\s+UUID NOT NULL UNIQUE REFERENCES projects\(id\) ON DELETE CASCADE/i);
    expect(UP).toMatch(/base_url\s+TEXT NOT NULL/i);
    expect(UP).toMatch(/routes\s+JSONB NOT NULL DEFAULT '\[\]'::jsonb/i);
    expect(UP).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
    expect(UP).toMatch(/updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
  });

  it('up creates BEFORE UPDATE trigger using set_updated_at', () => {
    expect(UP).toMatch(/CREATE TRIGGER trg_smoke_configs_updated_at/i);
    expect(UP).toMatch(/BEFORE UPDATE ON smoke_configs/i);
    expect(UP).toMatch(/EXECUTE FUNCTION set_updated_at\(\)/i);
  });

  it('down drops trigger and table with IF EXISTS guards', () => {
    expect(DOWN).toMatch(/DROP TRIGGER IF EXISTS trg_smoke_configs_updated_at ON smoke_configs/i);
    expect(DOWN).toMatch(/DROP TABLE IF EXISTS smoke_configs/i);
  });
});
