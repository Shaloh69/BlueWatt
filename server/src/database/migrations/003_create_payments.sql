-- Migration 003: Payments table
-- Each payment attempt linked to a billing period (via PayMongo)

CREATE TABLE IF NOT EXISTS payments (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  billing_period_id     INT NOT NULL,
  tenant_id             INT NOT NULL,
  amount                DECIMAL(10,2) NOT NULL,
  currency              CHAR(3) NOT NULL DEFAULT 'PHP',
  payment_method        VARCHAR(50) DEFAULT NULL,     -- 'gcash', 'paymaya', 'card', etc.
  status                ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  paymongo_payment_id   VARCHAR(150) DEFAULT NULL,    -- PayMongo payment intent / checkout session ID
  paymongo_source_id    VARCHAR(150) DEFAULT NULL,
  checkout_url          VARCHAR(1000) DEFAULT NULL,   -- redirect URL sent to tenant
  paid_at               DATETIME DEFAULT NULL,
  created_at            DATETIME NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_pay_bill   FOREIGN KEY (billing_period_id) REFERENCES billing_periods(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_tenant FOREIGN KEY (tenant_id)         REFERENCES users(id)           ON DELETE RESTRICT
);
