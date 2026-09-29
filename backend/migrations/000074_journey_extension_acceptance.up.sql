
INSERT OR IGNORE INTO authz_permissions(code, label, description, created_at, updated_at) VALUES
('journey.extensions.self.respond', 'Respond to own Journey extensions', 'Accept or reject pending Journey extension requests for the actor''s own active Journey.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS journey_extension_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  collaborator_journey_id TEXT NOT NULL,
  receipt_number TEXT NOT NULL UNIQUE,
  previous_end_date DATE NOT NULL,
  proposed_end_date DATE NOT NULL,
  additional_days INTEGER NOT NULL CHECK (additional_days > 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  status TEXT NOT NULL CHECK (status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
  requested_by TEXT NOT NULL,
  requested_at DATETIME NOT NULL,
  accepted_by TEXT,
  accepted_at DATETIME,
  rejected_by TEXT,
  rejected_at DATETIME,
  cancelled_by TEXT,
  cancelled_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (collaborator_journey_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_journey_extension_requests_journey ON journey_extension_requests(collaborator_journey_id, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_journey_extension_requests_pending ON journey_extension_requests(collaborator_journey_id) WHERE status = 'PENDING';

CREATE TRIGGER IF NOT EXISTS trg_journey_extension_terminal_immutable
BEFORE UPDATE ON journey_extension_requests
FOR EACH ROW WHEN OLD.status <> 'PENDING'
BEGIN
  SELECT RAISE(ABORT, 'terminal Journey extension evidence is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_journey_extension_no_delete
BEFORE DELETE ON journey_extension_requests
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'Journey extension evidence is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_journey_close_requires_extension_resolution
BEFORE UPDATE OF closed_at ON collaborator_journeys
FOR EACH ROW WHEN NEW.closed_at IS NOT NULL AND EXISTS (
  SELECT 1 FROM journey_extension_requests r WHERE r.collaborator_journey_id = OLD.id AND r.status = 'PENDING'
)
BEGIN
  SELECT RAISE(ABORT, 'pending Journey extension request must be resolved before closure');
END;
