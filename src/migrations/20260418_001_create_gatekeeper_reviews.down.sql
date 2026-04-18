-- Migration 20260418_001 down: drop gatekeeper_reviews table
DROP INDEX IF EXISTS ix_gk_reviews_created_at_desc;
DROP INDEX IF EXISTS ux_gk_reviews_story_hash;
DROP TABLE IF EXISTS gatekeeper_reviews;
