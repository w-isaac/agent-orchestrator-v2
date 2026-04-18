-- Migration 20260418_013 up: add auto_approve flag to projects
ALTER TABLE projects
  ADD COLUMN auto_approve BOOLEAN NOT NULL DEFAULT FALSE;
