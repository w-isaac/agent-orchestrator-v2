-- Migration 20260418_002 down: drop story_dependencies table
DROP INDEX IF EXISTS ix_story_dep_depends_on;
DROP TABLE IF EXISTS story_dependencies;
