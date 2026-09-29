CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    job_description TEXT NOT NULL,
    resume TEXT,
    self_description TEXT,
    company TEXT,
    job_profile TEXT,
    years_of_experience NUMERIC(4,1),
    interview_window TEXT,
    company_research JSONB,
    match_score NUMERIC(5,2),
    technical_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    behavioral_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    skill_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
    preparation_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
    validation JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mock_interview_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    interview_report_id UUID NOT NULL REFERENCES interview_reports(id) ON DELETE CASCADE,
    questions JSONB NOT NULL DEFAULT '{"technical":[],"behavioral":[]}'::jsonb,
    answers JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_section TEXT,
    current_question_index INTEGER NOT NULL DEFAULT 0,
    completed_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    overall_score INTEGER NOT NULL DEFAULT 0,
    overall_feedback TEXT NOT NULL DEFAULT '',
    presentation_summary JSONB,
    status TEXT NOT NULL DEFAULT 'in-progress'
        CHECK (status IN ('in-progress', 'completed')),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE interview_reports
    ALTER COLUMN match_score TYPE NUMERIC(5,2)
    USING match_score::numeric;

ALTER TABLE interview_reports
    ADD COLUMN IF NOT EXISTS company TEXT,
    ADD COLUMN IF NOT EXISTS job_profile TEXT,
    ADD COLUMN IF NOT EXISTS years_of_experience NUMERIC(4,1),
    ADD COLUMN IF NOT EXISTS interview_window TEXT,
    ADD COLUMN IF NOT EXISTS company_research JSONB;

CREATE INDEX IF NOT EXISTS idx_interview_reports_user
    ON interview_reports (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mock_reports_user
    ON mock_interview_reports (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mock_reports_interview
    ON mock_interview_reports (interview_report_id, created_at DESC);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone VARCHAR(32);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS report_limit_monthly INTEGER;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS mock_limit_monthly INTEGER;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

UPDATE users
SET last_login_at = COALESCE(last_login_at, updated_at, created_at)
WHERE last_login_at IS NULL;

UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN ('user', 'admin');

CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    report_limit_monthly INTEGER NOT NULL DEFAULT 5,
    mock_limit_monthly INTEGER NOT NULL DEFAULT 3,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (id, report_limit_monthly, mock_limit_monthly)
VALUES (1, 5, 3)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS quota_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('report', 'mock')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    period TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quota_grants_user_period
    ON quota_grants (user_id, kind, period);

CREATE TABLE IF NOT EXISTS quota_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('report', 'mock', 'pdf')),
    status TEXT NOT NULL CHECK (status IN ('reserved', 'completed', 'refunded')),
    idempotency_key TEXT,
    job_id UUID,
    result_id UUID,
    error_class TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalized_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quota_events_idempotency
    ON quota_usage_events (user_id, kind, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quota_events_user_period
    ON quota_usage_events (user_id, kind, period, status);

CREATE INDEX IF NOT EXISTS idx_quota_events_reserved
    ON quota_usage_events (status, created_at)
    WHERE status = 'reserved';

CREATE TABLE IF NOT EXISTS generation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('report', 'mock', 'pdf', 'score')),
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    request JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_id UUID,
    error TEXT,
    error_class TEXT,
    quota_event_id UUID REFERENCES quota_usage_events(id) ON DELETE SET NULL,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency
    ON generation_jobs (user_id, kind, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_queue
    ON generation_jobs (status, created_at);

CREATE TABLE IF NOT EXISTS feedback_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(80) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(32),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created
    ON feedback_messages (created_at DESC);

CREATE TABLE IF NOT EXISTS company_research_cache (
    company_key TEXT PRIMARY KEY,
    company_label TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO quota_usage_events (user_id, period, kind, status, result_id, finalized_at, created_at)
SELECT
    ir.user_id,
    to_char(ir.created_at AT TIME ZONE 'UTC', 'YYYY-MM'),
    'report',
    'completed',
    ir.id,
    ir.created_at,
    ir.created_at
FROM interview_reports ir
WHERE NOT EXISTS (
    SELECT 1 FROM quota_usage_events e
    WHERE e.result_id = ir.id AND e.kind = 'report'
);

INSERT INTO quota_usage_events (user_id, period, kind, status, result_id, finalized_at, created_at)
SELECT
    mr.user_id,
    to_char(mr.created_at AT TIME ZONE 'UTC', 'YYYY-MM'),
    'mock',
    'completed',
    mr.id,
    mr.created_at,
    mr.created_at
FROM mock_interview_reports mr
WHERE NOT EXISTS (
    SELECT 1 FROM quota_usage_events e
    WHERE e.result_id = mr.id AND e.kind = 'mock'
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS interview_reports_set_updated_at ON interview_reports;
CREATE TRIGGER interview_reports_set_updated_at
    BEFORE UPDATE ON interview_reports
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS mock_interview_reports_set_updated_at ON mock_interview_reports;
CREATE TRIGGER mock_interview_reports_set_updated_at
    BEFORE UPDATE ON mock_interview_reports
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
