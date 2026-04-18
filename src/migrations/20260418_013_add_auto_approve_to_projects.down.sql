-- Migration 20260418_013 down: remove auto_approve flag from projects
ALTER TABLE projects
  DROP COLUMN auto_approve;
