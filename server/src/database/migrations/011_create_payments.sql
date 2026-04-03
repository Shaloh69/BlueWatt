-- Migration 011: Payments table

CREATE TABLE IF NOT EXISTS payments (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  billing_period_id     INT UNSIGNED NOT NULL,
  tenant_id             INT UNSIGNED NOT NULL,
  amount                DECIMAL(10,2) NOT NULL,
  currency              CHAR(3) NOT NULL DEFAULT 'PHP',
  payment_method        VARCHAR(50) DEFAULT NULL,
  status                ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  paymongo_payment_id   VARCHAR(150) DEFAULT NULL,
  paymongo_source_id    VARCHAR(150) DEFAULT NULL,
  checkout_url          VARCHAR(1000) DEFAULT NULL,
  paid_at               DATETIME DEFAULT NULL,
  created_at            DATETIME NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_pay_bill   FOREIGN KEY (billing_period_id) REFERENCES billing_periods(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_tenant FOREIGN KEY (tenant_id)         REFERENCES users(id)           ON DELETE RESTRICT
);
