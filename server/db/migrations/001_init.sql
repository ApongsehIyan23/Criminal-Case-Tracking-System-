-- CCTS v1.0 schema: 13 tables. Safe to run more than once.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Reference: police stations, gendarmerie brigades, courts, chambers
CREATE TABLE IF NOT EXISTS organizational_units (
    unit_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_code   VARCHAR(20)  NOT NULL UNIQUE,
    unit_name   VARCHAR(150) NOT NULL,
    unit_type   VARCHAR(20)  NOT NULL
                CHECK (unit_type IN ('COMMISSARIAT','GENDARMERIE','COURT','CHAMBER')),
    division    VARCHAR(100) NOT NULL DEFAULT 'Mfoundi',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Reference: offense types, bilingual, with penal-code reference
CREATE TABLE IF NOT EXISTS offense_categories (
    offense_category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(40)  NOT NULL UNIQUE,
    label_en        VARCHAR(150) NOT NULL,
    label_fr        VARCHAR(150) NOT NULL,
    penal_code_ref  VARCHAR(60),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- System users: the 3 roles
CREATE TABLE IF NOT EXISTS users (
    user_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT,
    full_name    VARCHAR(150) NOT NULL,
    role         VARCHAR(30)  NOT NULL
                 CHECK (role IN ('SYSTEM_ADMINISTRATOR','JUDICIAL_POLICE_OFFICER','EXAMINING_MAGISTRATE')),
    organizational_unit_id UUID REFERENCES organizational_units(unit_id),
    status       VARCHAR(20)  NOT NULL DEFAULT 'INVITATION_PENDING'
                 CHECK (status IN ('INVITATION_PENDING','ACTIVE','SUSPENDED')),
    preferred_language CHAR(2) NOT NULL DEFAULT 'EN'
                 CHECK (preferred_language IN ('EN','FR')),
    last_activity_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Single-use, 24h invitation tokens (SHA-256 hashed)
CREATE TABLE IF NOT EXISTS account_invitations (
    invitation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash   CHAR(64) NOT NULL UNIQUE,
    invited_by   UUID REFERENCES users(user_id),
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Real people (suspects, victims, witnesses), identity stored once
CREATE TABLE IF NOT EXISTS persons (
    person_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    national_id  VARCHAR(30) UNIQUE,
    full_name    VARCHAR(150) NOT NULL,
    phone_number VARCHAR(25),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Digital case file; key is the printed case number
CREATE TABLE IF NOT EXISTS criminal_case_files (
    case_id         VARCHAR(20) PRIMARY KEY,
    incident_title  VARCHAR(200) NOT NULL,
    offense_category_id UUID NOT NULL REFERENCES offense_categories(offense_category_id),
    incident_datetime   TIMESTAMPTZ NOT NULL,
    originating_unit_id UUID NOT NULL REFERENCES organizational_units(unit_id),
    narrative       TEXT,
    status          VARCHAR(30) NOT NULL DEFAULT 'IN_INVESTIGATION'
                    CHECK (status IN ('IN_INVESTIGATION','TRANSMITTED_TO_MAGISTRATE','MANDATE_ISSUED')),
    created_by      UUID NOT NULL REFERENCES users(user_id),
    transmitted_at  TIMESTAMPTZ,
    transmitted_by  UUID REFERENCES users(user_id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A person's role on a case; is_detained only valid for a suspect
CREATE TABLE IF NOT EXISTS case_participants (
    participant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id      VARCHAR(20) NOT NULL REFERENCES criminal_case_files(case_id) ON DELETE CASCADE,
    person_id    UUID NOT NULL REFERENCES persons(person_id),
    role         VARCHAR(10) NOT NULL CHECK (role IN ('SUSPECT','VICTIM','WITNESS')),
    is_detained  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_case_person_role UNIQUE (case_id, person_id, role),
    CONSTRAINT chk_detained_only_suspect CHECK (is_detained = FALSE OR role = 'SUSPECT')
);

-- 48-hour garde a vue timer, one per detained participant
CREATE TABLE IF NOT EXISTS custody_countdown_timers (
    timer_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL UNIQUE
                 REFERENCES case_participants(participant_id) ON DELETE CASCADE,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    statutory_expires_at TIMESTAMPTZ NOT NULL,
    current_expires_at   TIMESTAMPTZ NOT NULL,
    status       VARCHAR(15) NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE','EXPIRED','RELEASED','EXTENDED','TRANSFERRED')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uploaded evidence metadata; bytes live in an encrypted bucket
CREATE TABLE IF NOT EXISTS digital_evidence (
    evidence_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id      VARCHAR(20) NOT NULL REFERENCES criminal_case_files(case_id) ON DELETE CASCADE,
    category     VARCHAR(20) NOT NULL
                 CHECK (category IN ('CRIME_SCENE_PHOTO','WITNESS_STATEMENT','MEDICAL_REPORT')),
    file_name    VARCHAR(255) NOT NULL,
    mime_type    VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes >= 0),
    storage_url  TEXT NOT NULL,
    sha256_hash  CHAR(64) NOT NULL,
    virus_scan_status VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                 CHECK (virus_scan_status IN ('PENDING','PASSED','FAILED')),
    is_locked    BOOLEAN NOT NULL DEFAULT FALSE,
    uploaded_by  UUID NOT NULL REFERENCES users(user_id),
    uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One binding ruling per case
CREATE TABLE IF NOT EXISTS judicial_mandates (
    mandate_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id      VARCHAR(20) NOT NULL UNIQUE REFERENCES criminal_case_files(case_id),
    decision     VARCHAR(25) NOT NULL
                 CHECK (decision IN ('RELEASE','EXTEND_CUSTODY','PRE_TRIAL_DETENTION')),
    ruling_notes TEXT NOT NULL,
    signed_document_name VARCHAR(255),
    signed_document_url  TEXT,
    issued_by    UUID NOT NULL REFERENCES users(user_id),
    issued_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Outbound notices: email or in-app (SMS reserved, not used in pilot)
CREATE TABLE IF NOT EXISTS notifications_log (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id      VARCHAR(20) REFERENCES criminal_case_files(case_id) ON DELETE SET NULL,
    channel      VARCHAR(10) NOT NULL CHECK (channel IN ('SMS','EMAIL','IN_APP')),
    notification_type VARCHAR(30) NOT NULL
                 CHECK (notification_type IN
                   ('CUSTODY_EXPIRY_WARNING','VICTIM_TRANSMISSION_SURVEY','ACCOUNT_INVITATION','ACCOUNT_ACTIVATION')),
    recipient_address VARCHAR(255) NOT NULL,
    gateway_provider  VARCHAR(50),
    payload      JSONB,
    delivery_status VARCHAR(15) NOT NULL DEFAULT 'QUEUED'
                 CHECK (delivery_status IN ('QUEUED','SENT','DELIVERED','FAILED')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at      TIMESTAMPTZ
);

-- Append-only audit trail; actor fields are a point-in-time snapshot
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id      VARCHAR(20) REFERENCES criminal_case_files(case_id) ON DELETE SET NULL,
    actor_id     UUID REFERENCES users(user_id) ON DELETE SET NULL,
    actor_email  VARCHAR(255) NOT NULL,
    actor_role   VARCHAR(30)  NOT NULL,
    action_type  VARCHAR(40)  NOT NULL,
    details      JSONB,
    ip_address   INET,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Admin-triggered backup history
CREATE TABLE IF NOT EXISTS database_backups (
    backup_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_by UUID REFERENCES users(user_id),
    status       VARCHAR(15) NOT NULL DEFAULT 'COMPLETED'
                 CHECK (status IN ('STARTED','COMPLETED','FAILED')),
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for the hot paths
CREATE INDEX IF NOT EXISTS idx_cases_status         ON criminal_case_files(status);
CREATE INDEX IF NOT EXISTS idx_cases_offense        ON criminal_case_files(offense_category_id);
CREATE INDEX IF NOT EXISTS idx_participants_case    ON case_participants(case_id);
CREATE INDEX IF NOT EXISTS idx_participants_person  ON case_participants(person_id);
CREATE INDEX IF NOT EXISTS idx_custody_sort         ON custody_countdown_timers(status, current_expires_at);
CREATE INDEX IF NOT EXISTS idx_evidence_case        ON digital_evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_notifications_case   ON notifications_log(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_case           ON audit_logs(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_created        ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action         ON audit_logs(action_type);

-- Bilingual-safe search (no language stemmer)
CREATE INDEX IF NOT EXISTS idx_cases_title_trgm     ON criminal_case_files USING gin (incident_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cases_narrative_trgm ON criminal_case_files USING gin (narrative gin_trgm_ops);
