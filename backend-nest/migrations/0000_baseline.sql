-- Baseline equivalent to the legacy Alembic migrations 0001..0005 (FastAPI V1).
-- Applied ONLY to an empty database. Existing databases created by Alembic
-- are detected (alembic_version = 0005) and this file is skipped, preserving data.
-- Column order mirrors Alembic so pg_dump output is identical (verified in CI).

CREATE TABLE alembic_version (
    version_num character varying(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

CREATE TABLE technicians (
    id SERIAL PRIMARY KEY,
    username character varying(80) NOT NULL UNIQUE,
    name character varying(120) NOT NULL,
    password_hash character varying(255) NOT NULL
);

CREATE TABLE sessions (
    token_hash character varying(64) NOT NULL PRIMARY KEY,
    technician_id integer NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    expires_at timestamp with time zone NOT NULL
);

CREATE TABLE tickets (
    id SERIAL PRIMARY KEY,
    access_hash character varying(64) NOT NULL,
    name character varying(120) NOT NULL,
    department character varying(80) NOT NULL,
    category character varying(80) NOT NULL,
    title character varying(160) NOT NULL,
    description text NOT NULL,
    status character varying(30) NOT NULL,
    priority character varying(15) NOT NULL,
    technician_id integer REFERENCES technicians(id),
    created_at timestamp with time zone NOT NULL,
    assigned_at timestamp with time zone,
    resolved_at timestamp with time zone,
    solution text,
    location character varying(160) DEFAULT ''::character varying NOT NULL,
    affected_system character varying(80) DEFAULT ''::character varying NOT NULL,
    state character varying(2) DEFAULT ''::character varying NOT NULL,
    CONSTRAINT ticket_status CHECK (status IN ('NOVO','EM_ATENDIMENTO','AGUARDANDO_USUARIO','AGUARDANDO_TERCEIRO','RESOLVIDO','CANCELADO')),
    CONSTRAINT ticket_priority CHECK (priority IN ('BAIXA','NORMAL','ALTA','URGENTE'))
);
CREATE INDEX ix_tickets_department ON tickets (department);
CREATE INDEX ix_tickets_status ON tickets (status);
CREATE INDEX ix_tickets_affected_system ON tickets (affected_system);
CREATE INDEX ix_tickets_state ON tickets (state);

CREATE TABLE ticket_history (
    id SERIAL PRIMARY KEY,
    ticket_id integer NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    message text NOT NULL,
    created_at timestamp with time zone NOT NULL
);
CREATE INDEX ix_ticket_history_ticket_id ON ticket_history (ticket_id);

CREATE TABLE attachments (
    id SERIAL PRIMARY KEY,
    ticket_id integer NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    mime character varying(40) NOT NULL,
    data bytea NOT NULL
);

CREATE TABLE push_subscriptions (
    id SERIAL PRIMARY KEY,
    technician_id integer NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    endpoint character varying(2048) NOT NULL UNIQUE,
    p256dh character varying(256) NOT NULL,
    auth character varying(128) NOT NULL,
    created_at timestamp with time zone NOT NULL
);
CREATE INDEX ix_push_subscriptions_technician_id ON push_subscriptions (technician_id);

INSERT INTO alembic_version (version_num) VALUES ('0005');
