PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS collaborator_journeys (
  id TEXT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  person_id TEXT NOT NULL,
  journey_start_date DATE NOT NULL,
  default_end_date DATE NOT NULL,
  extension_days INTEGER NOT NULL DEFAULT 0,
  projected_end_date DATE NOT NULL,
  payment_method_id TEXT NOT NULL,
  payment_value REAL NOT NULL,
  sector_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status_id TEXT NOT NULL,
  notes TEXT NULL,
  closed_at DATETIME NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (payment_method_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (sector_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (location_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (task_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (status_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_collaborator_journeys_tenant_id ON collaborator_journeys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_collaborator_journeys_person_id ON collaborator_journeys(person_id);
CREATE INDEX IF NOT EXISTS idx_collaborator_journeys_projected_end_date ON collaborator_journeys(projected_end_date);
CREATE INDEX IF NOT EXISTS idx_collaborator_journeys_payment_method_id ON collaborator_journeys(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_collaborator_journeys_sector_id ON collaborator_journeys(sector_id);
CREATE INDEX IF NOT EXISTS idx_collaborator_journeys_location_id ON collaborator_journeys(location_id);
CREATE INDEX IF NOT EXISTS idx_collaborator_journeys_task_id ON collaborator_journeys(task_id);
CREATE INDEX IF NOT EXISTS idx_collaborator_journeys_status_id ON collaborator_journeys(status_id);
CREATE INDEX IF NOT EXISTS idx_collaborator_journeys_tenant_person_closed ON collaborator_journeys(tenant_id, person_id, closed_at);

PRAGMA foreign_keys = ON;
