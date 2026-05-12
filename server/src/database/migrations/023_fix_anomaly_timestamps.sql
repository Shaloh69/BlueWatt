-- Fix anomaly events that were stored with ESP uptime seconds instead of Unix epoch.
-- Those rows landed in 1970 because the ESP had not yet synced its clock.
-- Use created_at (set by the DB at INSERT time) as the authoritative timestamp.
UPDATE anomaly_events
SET timestamp = created_at
WHERE YEAR(timestamp) < 2020;
