CREATE TABLE IF NOT EXISTS work_period_assignments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    work_period_id TEXT NOT NULL,
    collaborator_id TEXT NOT NULL,
    planned_status TEXT NOT NULL,
    actual_status TEXT NULL,
    replacement_for_assignment_id TEXT NULL,
    sector_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_work_period_assignments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_work_period_assignments_work_period FOREIGN KEY (work_period_id) REFERENCES work_periods(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_work_period_assignments_collaborator FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_work_period_assignments_replacement_for FOREIGN KEY (replacement_for_assignment_id) REFERENCES work_period_assignments(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_work_period_assignments_sector FOREIGN KEY (sector_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_work_period_assignments_location FOREIGN KEY (location_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_work_period_assignments_task FOREIGN KEY (task_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT ck_work_period_assignments_planned_status CHECK (planned_status IN ('INCLUDED', 'EXCLUDED')),
    CONSTRAINT ck_work_period_assignments_actual_status CHECK (actual_status IS NULL OR actual_status IN ('WORKED', 'ABSENT', 'SICK_DAY_OFF', 'TIME_OFF', 'REPLACED', 'CANCELLED')),
    CONSTRAINT ck_work_period_assignments_not_self_replacement CHECK (replacement_for_assignment_id IS NULL OR replacement_for_assignment_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_work_period_assignments_tenant_period ON work_period_assignments (tenant_id, work_period_id);
CREATE INDEX IF NOT EXISTS idx_work_period_assignments_tenant_collaborator ON work_period_assignments (tenant_id, collaborator_id);
CREATE INDEX IF NOT EXISTS idx_work_period_assignments_tenant_active ON work_period_assignments (tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_work_period_assignments_replacement_for ON work_period_assignments (replacement_for_assignment_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_work_period_assignments_active_collaborator
    ON work_period_assignments (tenant_id, work_period_id, collaborator_id)
    WHERE active = 1;
