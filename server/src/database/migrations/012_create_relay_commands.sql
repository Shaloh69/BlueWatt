-- Migration 012: Relay commands table
-- Server-side relay command queue, ESP polls and ACKs commands

CREATE TABLE IF NOT EXISTS relay_commands (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id   INT UNSIGNED NOT NULL,
  command     ENUM('on','off','reset') NOT NULL,
  issued_by   INT UNSIGNED NOT NULL,
  status      ENUM('pending','acked','failed') NOT NULL DEFAULT 'pending',
  issued_at   DATETIME NOT NULL DEFAULT NOW(),
  acked_at    DATETIME DEFAULT NULL,

  CONSTRAINT fk_rcmd_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  CONSTRAINT fk_rcmd_user   FOREIGN KEY (issued_by) REFERENCES users(id)   ON DELETE RESTRICT,

  INDEX idx_device_pending (device_id, status, issued_at)
);
