-- 0006: additive, backward-compatible changes (no data is removed or rewritten).
-- * ticket_history.kind / author_name distinguish technician messages to the
--   employee from automatic events. Legacy FastAPI inserts omit these columns
--   and receive the defaults, so a rollback keeps working.
-- * Indexes for the queue ordering, "my tickets", dashboard metrics and
--   session cleanup. Tables are small; plain CREATE INDEX holds a brief lock.

ALTER TABLE ticket_history ADD COLUMN IF NOT EXISTS kind character varying(20) DEFAULT 'event' NOT NULL;
ALTER TABLE ticket_history ADD COLUMN IF NOT EXISTS author_name character varying(120);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_history_kind') THEN
        ALTER TABLE ticket_history ADD CONSTRAINT ticket_history_kind CHECK (kind IN ('event', 'note'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_tickets_created_at_id ON tickets (created_at, id);
CREATE INDEX IF NOT EXISTS ix_tickets_technician_id ON tickets (technician_id);
CREATE INDEX IF NOT EXISTS ix_tickets_resolved_at ON tickets (resolved_at) WHERE resolved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_sessions_technician_id ON sessions (technician_id);
CREATE INDEX IF NOT EXISTS ix_sessions_expires_at ON sessions (expires_at);
