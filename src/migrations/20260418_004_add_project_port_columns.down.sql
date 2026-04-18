-- Migration 20260418_004 down: remove port configuration columns from projects
DROP INDEX IF EXISTS ux_projects_deploy_port;
DROP INDEX IF EXISTS ux_projects_frontend_port;
DROP INDEX IF EXISTS ux_projects_backend_port;
DROP INDEX IF EXISTS ux_projects_container_port;

ALTER TABLE projects
  DROP COLUMN IF EXISTS deploy_port,
  DROP COLUMN IF EXISTS frontend_port,
  DROP COLUMN IF EXISTS backend_port,
  DROP COLUMN IF EXISTS container_port;
