-- One binding ruling per suspect instead of one per case. Safe to run more than once.
-- The table holds no rows before this feature exists, so the column can be required.
ALTER TABLE judicial_mandates
    ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES case_participants(participant_id);

ALTER TABLE judicial_mandates ALTER COLUMN participant_id SET NOT NULL;

ALTER TABLE judicial_mandates DROP CONSTRAINT IF EXISTS judicial_mandates_case_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mandate_participant ON judicial_mandates(participant_id);
CREATE INDEX IF NOT EXISTS idx_mandates_case ON judicial_mandates(case_id);
