import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIG_DIR = path.resolve(__dirname);
const UP = fs.readFileSync(
  path.join(MIG_DIR, '20260418_013_add_auto_approve_to_projects.up.sql'),
  'utf-8',
);
const DOWN = fs.readFileSync(
  path.join(MIG_DIR, '20260418_013_add_auto_approve_to_projects.down.sql'),
  'utf-8',
);

describe('AOV-177 add auto_approve to projects migration (SQL contents)', () => {
  it('up adds auto_approve column as BOOLEAN NOT NULL DEFAULT FALSE', () => {
    expect(UP).toMatch(/ALTER TABLE projects/i);
    expect(UP).toMatch(/ADD COLUMN auto_approve/i);
    expect(UP).toMatch(/BOOLEAN/i);
    expect(UP).toMatch(/NOT NULL/i);
    expect(UP).toMatch(/DEFAULT FALSE/i);
  });

  it('down drops the auto_approve column', () => {
    expect(DOWN).toMatch(/ALTER TABLE projects/i);
    expect(DOWN).toMatch(/DROP COLUMN auto_approve/i);
  });
});
