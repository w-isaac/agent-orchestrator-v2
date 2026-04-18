-- Migration 20260418_004 up: add port configuration columns to projects
ALTER TABLE projects
  ADD COLUMN deploy_port    INTEGER CHECK (deploy_port    BETWEEN 1 AND 65535),
  ADD COLUMN frontend_port  INTEGER CHECK (frontend_port  BETWEEN 1 AND 65535),
  ADD COLUMN backend_port   INTEGER CHECK (backend_port   BETWEEN 1 AND 65535),
  ADD COLUMN container_port INTEGER CHECK (container_port BETWEEN 1 AND 65535);

CREATE UNIQUE INDEX ux_projects_deploy_port    ON projects(deploy_port)    WHERE deploy_port    IS NOT NULL;
CREATE UNIQUE INDEX ux_projects_frontend_port  ON projects(frontend_port)  WHERE frontend_port  IS NOT NULL;
CREATE UNIQUE INDEX ux_projects_backend_port   ON projects(backend_port)   WHERE backend_port   IS NOT NULL;
CREATE UNIQUE INDEX ux_projects_container_port ON projects(container_port) WHERE container_port IS NOT NULL;
