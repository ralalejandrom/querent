-- Audit events are append-only: the history of labels, reviews and moderation can never be rewritten.
CREATE OR REPLACE FUNCTION audit_events_block_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events FOR EACH ROW EXECUTE FUNCTION audit_events_block_change();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION audit_events_block_change();
--> statement-breakpoint
-- Full-text search over posts and questions.
CREATE INDEX IF NOT EXISTS posts_search_idx ON posts USING gin (to_tsvector('english', title || ' ' || body));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS questions_search_idx ON questions USING gin (to_tsvector('english', text));
