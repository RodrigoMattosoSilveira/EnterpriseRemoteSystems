-- Bite 30I.2 — Tenant Support Access Lease Domain / Backend
--
-- A Tenant Support Access Lease grants one existing GLOBAL Application
-- Administrator Actor temporary, explicitly approved authority in exactly one
-- Tenant. The lease never creates a Person, Membership, Tenant Actor,
-- Collaborator, or Role Grant.
--
-- Lifecycle:
--   PENDING -> APPROVED -> TERMINATED
-- Approval retains the request's fixed expires_at. An APPROVED lease whose
-- expires_at has passed is operationally EXPIRED without rewriting history.

DROP TRIGGER IF EXISTS trg_application_admin_control_plane_permission_update;
DROP TRIGGER IF EXISTS trg_application_admin_control_plane_permission_insert;

INSERT OR IGNORE INTO authz_permissions (code, label, description, created_at, updated_at) VALUES
('support_access_leases.read', 'Read Tenant support access leases', 'Read Tenant Support Access Lease requests and lifecycle state within the actor''s authorized scope.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('support_access_leases.request', 'Request Tenant support access', 'Request fixed-expiration, permission-scoped Tenant support access for the Application Administrator''s GLOBAL Actor.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('support_access_leases.approve', 'Approve Tenant support access', 'Approve a pending Tenant Support Access Lease for the Tenant administered by the actor.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('support_access_leases.terminate', 'Terminate Tenant support access', 'Immediately terminate an approved Tenant Support Access Lease for the Tenant administered by the actor.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO authz_role_permissions (role_id, permission_code, created_at) VALUES
('authz-role-application-admin', 'support_access_leases.read', CURRENT_TIMESTAMP),
('authz-role-application-admin', 'support_access_leases.request', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'support_access_leases.read', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'support_access_leases.approve', CURRENT_TIMESTAMP),
('authz-role-tenant-admin', 'support_access_leases.terminate', CURRENT_TIMESTAMP);

CREATE TRIGGER IF NOT EXISTS trg_application_admin_control_plane_permission_insert
BEFORE INSERT ON authz_role_permissions
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-application-admin'
  AND NEW.permission_code NOT IN (
    'authz.self.read',
    'authz.read',
    'authz.manage',
    'support_access_leases.read',
    'support_access_leases.request',
    'tenants.read',
    'tenants.create',
    'tenants.update'
  )
BEGIN
  SELECT RAISE(ABORT, 'application_admin_control_plane_permission_required');
END;

CREATE TRIGGER IF NOT EXISTS trg_application_admin_control_plane_permission_update
BEFORE UPDATE OF role_id, permission_code ON authz_role_permissions
FOR EACH ROW
WHEN NEW.role_id = 'authz-role-application-admin'
  AND NEW.permission_code NOT IN (
    'authz.self.read',
    'authz.read',
    'authz.manage',
    'support_access_leases.read',
    'support_access_leases.request',
    'tenants.read',
    'tenants.create',
    'tenants.update'
  )
BEGIN
  SELECT RAISE(ABORT, 'application_admin_control_plane_permission_required');
END;

CREATE TABLE tenant_support_access_leases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  application_actor_id TEXT NOT NULL,
  requested_by_actor_id TEXT NOT NULL,
  requested_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  approved_at DATETIME NULL,
  approved_by_actor_id TEXT NULL,
  terminated_at DATETIME NULL,
  terminated_by_actor_id TEXT NULL,
  termination_reason TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_support_lease_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_support_lease_application_actor FOREIGN KEY (application_actor_id) REFERENCES authz_actors(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_support_lease_request_actor FOREIGN KEY (requested_by_actor_id) REFERENCES authz_actors(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_support_lease_approve_actor FOREIGN KEY (approved_by_actor_id) REFERENCES authz_actors(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_support_lease_terminate_actor FOREIGN KEY (terminated_by_actor_id) REFERENCES authz_actors(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT ck_support_lease_tenant_specific CHECK (TRIM(tenant_id) <> '' AND tenant_id <> '*'),
  CONSTRAINT ck_support_lease_requester_same_actor CHECK (application_actor_id = requested_by_actor_id),
  CONSTRAINT ck_support_lease_expiration_after_request CHECK (julianday(expires_at) > julianday(requested_at)),
  CONSTRAINT ck_support_lease_reason_required CHECK (TRIM(reason) <> ''),
  CONSTRAINT ck_support_lease_status CHECK (status IN ('PENDING', 'APPROVED', 'TERMINATED')),
  CONSTRAINT ck_support_lease_pending_fields CHECK (
    status <> 'PENDING' OR (
      approved_at IS NULL AND approved_by_actor_id IS NULL AND
      terminated_at IS NULL AND terminated_by_actor_id IS NULL
    )
  ),
  CONSTRAINT ck_support_lease_approved_fields CHECK (
    status <> 'APPROVED' OR (
      approved_at IS NOT NULL AND approved_by_actor_id IS NOT NULL AND
      terminated_at IS NULL AND terminated_by_actor_id IS NULL
    )
  ),
  CONSTRAINT ck_support_lease_terminated_fields CHECK (
    status <> 'TERMINATED' OR (
      approved_at IS NOT NULL AND approved_by_actor_id IS NOT NULL AND
      terminated_at IS NOT NULL AND terminated_by_actor_id IS NOT NULL
    )
  )
);

CREATE INDEX idx_support_access_leases_tenant_status
  ON tenant_support_access_leases(tenant_id, status, expires_at);
CREATE INDEX idx_support_access_leases_application_actor
  ON tenant_support_access_leases(application_actor_id, tenant_id, status, expires_at);

CREATE TABLE tenant_support_access_lease_permissions (
  lease_id TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (lease_id, permission_code),
  CONSTRAINT fk_support_lease_permission_lease FOREIGN KEY (lease_id) REFERENCES tenant_support_access_leases(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_support_lease_permission_catalog FOREIGN KEY (permission_code) REFERENCES authz_permissions(code) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE tenant_support_access_lease_events (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  occurred_at DATETIME NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_support_lease_event_lease FOREIGN KEY (lease_id) REFERENCES tenant_support_access_leases(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_support_lease_event_actor FOREIGN KEY (actor_id) REFERENCES authz_actors(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT ck_support_lease_event_type CHECK (event_type IN ('REQUESTED', 'APPROVED', 'TERMINATED'))
);

CREATE INDEX idx_support_access_lease_events_lease
  ON tenant_support_access_lease_events(lease_id, occurred_at, id);

-- Lease requests must attach to the same existing GLOBAL Application
-- Administrator Actor that requested the lease.
CREATE TRIGGER trg_support_access_lease_request_global_application_actor
BEFORE INSERT ON tenant_support_access_leases
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM authz_actor_role_grants g
  JOIN authz_roles r
    ON r.id = g.role_id
   AND r.code = 'APPLICATION_ADMIN'
   AND r.scope_type = 'APPLICATION'
   AND r.active = 1
  JOIN authz_actors a
    ON a.id = g.actor_id
   AND a.active = 1
  JOIN auth_account_actors aa
    ON aa.actor_id = a.id
   AND aa.scope_type = 'GLOBAL'
  WHERE g.actor_id = NEW.application_actor_id
    AND g.tenant_id = '*'
    AND g.active = 1
    AND g.lifecycle_suspended = 0
    AND NEW.requested_by_actor_id = NEW.application_actor_id
)
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_application_administrator_required');
END;

-- At most one still-open request/effective lease may exist for one Application
-- Administrator Actor and one Tenant at a time. A PENDING request whose fixed
-- expiration has passed and expired APPROVED history do not block a new request.
CREATE TRIGGER trg_support_access_lease_open_conflict_insert
BEFORE INSERT ON tenant_support_access_leases
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM tenant_support_access_leases existing
  WHERE existing.application_actor_id = NEW.application_actor_id
    AND existing.tenant_id = NEW.tenant_id
    AND existing.status IN ('PENDING', 'APPROVED')
    AND julianday(existing.expires_at) > julianday(CURRENT_TIMESTAMP)
)
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_open_conflict');
END;

-- Request scope and expiration are fixed at creation and cannot be edited by an
-- approval or termination operation.
CREATE TRIGGER trg_support_access_lease_request_fields_immutable
BEFORE UPDATE OF tenant_id, application_actor_id, requested_by_actor_id, requested_at, expires_at, reason
ON tenant_support_access_leases
FOR EACH ROW
WHEN NEW.tenant_id IS NOT OLD.tenant_id
  OR NEW.application_actor_id IS NOT OLD.application_actor_id
  OR NEW.requested_by_actor_id IS NOT OLD.requested_by_actor_id
  OR NEW.requested_at IS NOT OLD.requested_at
  OR NEW.expires_at IS NOT OLD.expires_at
  OR NEW.reason IS NOT OLD.reason
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_request_immutable');
END;

CREATE TRIGGER trg_support_access_lease_status_transition
BEFORE UPDATE OF status ON tenant_support_access_leases
FOR EACH ROW
WHEN NEW.status <> OLD.status
  AND NOT (
    (OLD.status = 'PENDING' AND NEW.status = 'APPROVED')
    OR (OLD.status = 'APPROVED' AND NEW.status = 'TERMINATED')
  )
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_invalid_transition');
END;

-- Approval must be performed by a current canonical Tenant Administrator in
-- this exact Tenant and before the request's immutable expiration time.
CREATE TRIGGER trg_support_access_lease_approval_tenant_administrator
BEFORE UPDATE OF status ON tenant_support_access_leases
FOR EACH ROW
WHEN OLD.status = 'PENDING' AND NEW.status = 'APPROVED'
  AND (
    NEW.approved_at IS NULL
    OR NEW.approved_by_actor_id IS NULL
    OR julianday(NEW.expires_at) <= julianday(CURRENT_TIMESTAMP)
    OR NOT EXISTS (
      SELECT 1
      FROM tenant_support_access_lease_permissions p
      WHERE p.lease_id = NEW.id
    )
    OR NOT EXISTS (
      SELECT 1
      FROM authz_actor_role_grants g
      JOIN authz_roles r
        ON r.id = g.role_id
       AND r.code = 'TENANT_ADMIN'
       AND r.scope_type = 'TENANT'
       AND r.active = 1
      JOIN auth_account_actors aa
        ON aa.actor_id = g.actor_id
       AND aa.scope_type = 'TENANT'
       AND aa.tenant_id = g.tenant_id
      JOIN person_tenant_memberships m
        ON m.id = aa.membership_id
       AND m.tenant_id = aa.tenant_id
      JOIN reference_data status
        ON status.id = m.status_id
       AND status.tenant_id = m.tenant_id
       AND status.type = 'person_status'
       AND status.code = 'ACTIVE'
       AND status.active = 1
      WHERE g.actor_id = NEW.approved_by_actor_id
        AND g.tenant_id = NEW.tenant_id
        AND g.active = 1
        AND g.lifecycle_suspended = 0
        AND m.person_id IS NOT NULL
        AND TRIM(m.person_id) <> ''
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_tenant_administrator_required');
END;

CREATE TRIGGER trg_support_access_lease_termination_tenant_administrator
BEFORE UPDATE OF status ON tenant_support_access_leases
FOR EACH ROW
WHEN OLD.status = 'APPROVED' AND NEW.status = 'TERMINATED'
  AND (
    NEW.terminated_at IS NULL
    OR NEW.terminated_by_actor_id IS NULL
    OR julianday(NEW.expires_at) <= julianday(CURRENT_TIMESTAMP)
    OR NOT EXISTS (
      SELECT 1
      FROM authz_actor_role_grants g
      JOIN authz_roles r
        ON r.id = g.role_id
       AND r.code = 'TENANT_ADMIN'
       AND r.scope_type = 'TENANT'
       AND r.active = 1
      JOIN auth_account_actors aa
        ON aa.actor_id = g.actor_id
       AND aa.scope_type = 'TENANT'
       AND aa.tenant_id = g.tenant_id
      JOIN person_tenant_memberships m
        ON m.id = aa.membership_id
       AND m.tenant_id = aa.tenant_id
      JOIN reference_data status
        ON status.id = m.status_id
       AND status.tenant_id = m.tenant_id
       AND status.type = 'person_status'
       AND status.code = 'ACTIVE'
       AND status.active = 1
      WHERE g.actor_id = NEW.terminated_by_actor_id
        AND g.tenant_id = NEW.tenant_id
        AND g.active = 1
        AND g.lifecycle_suspended = 0
        AND m.person_id IS NOT NULL
        AND TRIM(m.person_id) <> ''
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_tenant_administrator_required');
END;

CREATE TRIGGER trg_support_access_lease_approval_history_immutable
BEFORE UPDATE OF approved_at, approved_by_actor_id ON tenant_support_access_leases
FOR EACH ROW
WHEN OLD.approved_at IS NOT NULL
  AND (NEW.approved_at IS NOT OLD.approved_at OR NEW.approved_by_actor_id IS NOT OLD.approved_by_actor_id)
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_approval_immutable');
END;

CREATE TRIGGER trg_support_access_lease_termination_history_immutable
BEFORE UPDATE OF terminated_at, terminated_by_actor_id, termination_reason ON tenant_support_access_leases
FOR EACH ROW
WHEN OLD.terminated_at IS NOT NULL
  AND (
    NEW.terminated_at IS NOT OLD.terminated_at
    OR NEW.terminated_by_actor_id IS NOT OLD.terminated_by_actor_id
    OR NEW.termination_reason IS NOT OLD.termination_reason
  )
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_termination_immutable');
END;

CREATE TRIGGER trg_support_access_lease_no_delete
BEFORE DELETE ON tenant_support_access_leases
BEGIN
  SELECT RAISE(ABORT, 'support_access_leases are retained; terminate an approved lease instead');
END;

CREATE TRIGGER trg_support_access_lease_permission_pending_insert
BEFORE INSERT ON tenant_support_access_lease_permissions
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM tenant_support_access_leases lease
  WHERE lease.id = NEW.lease_id
    AND lease.status = 'PENDING'
)
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_permissions_immutable');
END;

CREATE TRIGGER trg_support_access_lease_permission_allowlist
BEFORE INSERT ON tenant_support_access_lease_permissions
FOR EACH ROW
WHEN NEW.permission_code NOT IN (
  'people.read', 'people.create', 'people.update',
  'collaborators.read', 'collaborators.create', 'collaborators.update', 'collaborators.work_assignment.update',
  'planning.read', 'planning.create', 'planning.update',
  'earnings.read', 'earnings.create', 'earnings.update',
  'price_lists.read', 'price_lists.create', 'price_lists.update',
  'gold_prices.manage', 'gold_production.manage',
  'reference_data.read', 'reference_data.manage',
  'expenses.read', 'expenses.create', 'expenses.update',
  'current_accounts.summary.read', 'current_accounts.ledger.read', 'current_accounts.ledger.create',
  'current_accounts.settings.read', 'current_accounts.settings.update',
  'ledger.receipts.read', 'ledger.receipts.create', 'ledger.receipts.print', 'ledger.receipts.return',
  'ledger.receipts.backfill', 'ledger.receipts.tenant.accept',
  'ledger.corrections.create',
  'journey.settlements.preview', 'journey.settlements.zero_gold', 'journey.settlements.partial_payout',
  'journey.settlements.final_tenant_payment', 'journey.settlements.final_collaborator_payment', 'journey.settlements.close'
)
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_permission_not_allowed');
END;

CREATE TRIGGER trg_support_access_lease_permissions_no_update
BEFORE UPDATE ON tenant_support_access_lease_permissions
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_permissions are immutable');
END;

CREATE TRIGGER trg_support_access_lease_permissions_no_delete
BEFORE DELETE ON tenant_support_access_lease_permissions
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_permissions are immutable');
END;

CREATE TRIGGER trg_support_access_lease_events_no_update
BEFORE UPDATE ON tenant_support_access_lease_events
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_events are immutable');
END;

CREATE TRIGGER trg_support_access_lease_events_no_delete
BEFORE DELETE ON tenant_support_access_lease_events
BEGIN
  SELECT RAISE(ABORT, 'support_access_lease_events are immutable');
END;
