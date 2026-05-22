-- Runs once on first Postgres boot (when data dir is empty).
-- After `docker compose up -d`, the container will have:
--   auth    (default POSTGRES_DB — used by auth-api locally)
--   habits  (created here — used by habits-api locally)
--
-- To pick up changes on an existing volume: `docker compose down -v` (destroys
-- the volume), then `docker compose up -d` to re-run init.
CREATE DATABASE habits;
