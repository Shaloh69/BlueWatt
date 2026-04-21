ALTER TABLE relay_commands
  MODIFY COLUMN status ENUM('pending','acked','failed','expired') NOT NULL DEFAULT 'pending',
  ADD COLUMN expires_at DATETIME NULL DEFAULT NULL AFTER issued_at;
