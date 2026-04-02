-- Migration 007: Payment QR codes
-- Admin uploads QR code images (GCash, Maya, bank, etc.)
-- Tenants see active QR codes when submitting payment

CREATE TABLE IF NOT EXISTS payment_qr_codes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  label       VARCHAR(100) NOT NULL,       -- e.g. "GCash - Juan Dela Cruz (+63 912 345 6789)"
  image_url   VARCHAR(1000) NOT NULL,      -- Supabase public URL
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  uploaded_by INT NOT NULL,                -- FK → users.id (admin)
  created_at  DATETIME NOT NULL DEFAULT NOW(),
  updated_at  DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),

  CONSTRAINT fk_qr_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT
);
