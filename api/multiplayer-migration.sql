BEGIN;
CREATE TABLE IF NOT EXISTS race_results (
  id UUID PRIMARY KEY,
  course_id TEXT NOT NULL,
  course_version INTEGER NOT NULL CHECK (course_version > 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('finish','draw','forfeit','abandoned')),
  reason TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS race_participants (
  match_id UUID NOT NULL REFERENCES race_results(id) ON DELETE CASCADE,
  lane SMALLINT NOT NULL CHECK (lane IN (0,1)),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  placement SMALLINT CHECK (placement IN (1,2)),
  elapsed_ms INTEGER CHECK (elapsed_ms >= 0),
  points SMALLINT NOT NULL CHECK (points IN (0,1,3)),
  PRIMARY KEY (match_id, lane),
  UNIQUE (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS race_participants_user_idx ON race_participants(user_id,match_id);
CREATE INDEX IF NOT EXISTS race_results_completed_idx ON race_results(completed_at DESC);
-- Deleted accounts leave anonymous sporting facts. No names, emails, avatars or input logs are stored here.
COMMIT;
