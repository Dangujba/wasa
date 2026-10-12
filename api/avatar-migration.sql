-- WASA Step 3 migration: persistent avatar appearance.
ALTER TABLE player_profiles
    ADD COLUMN IF NOT EXISTS avatar_config JSONB NOT NULL DEFAULT '{}'::jsonb;
