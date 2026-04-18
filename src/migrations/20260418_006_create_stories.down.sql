-- AOV-83 down: drop stories table and its indexes
DROP INDEX IF EXISTS uniq_stories_project_github_issue;
DROP INDEX IF EXISTS idx_stories_status;
DROP INDEX IF EXISTS idx_stories_project_id;
DROP TABLE IF EXISTS stories;
