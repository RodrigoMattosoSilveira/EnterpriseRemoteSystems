CREATE TABLE IF NOT EXISTS work_periods (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    work_date DATE NOT NULL,
    period_code TEXT NOT NULL,
    name TEXT NOT NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'PLANNING',
    informed_at DATETIME NULL,
    accrual_opened_at DATETIME NULL,
    closed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_work_periods_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ux_work_period_tenant_date_code UNIQUE (tenant_id, work_date, period_code),
    CONSTRAINT ck_work_period_status CHECK (status IN ('PLANNING', 'INFORMED', 'ACCRUAL_OPEN', 'PARTIALLY_POSTED', 'FULLY_POSTED', 'CLOSED')),
    CONSTRAINT ck_work_period_time_order CHECK (starts_at < ends_at)
);

CREATE INDEX IF NOT EXISTS idx_work_periods_tenant_work_date ON work_periods (tenant_id, work_date);
CREATE INDEX IF NOT EXISTS idx_work_periods_tenant_status ON work_periods (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_work_periods_tenant_starts_at ON work_periods (tenant_id, starts_at);
