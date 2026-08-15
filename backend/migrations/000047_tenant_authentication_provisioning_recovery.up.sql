PRAGMA foreign_keys = ON;

-- Bite 30C.2 persists Account-level reactivation requests separately from
-- tenant Actor ownership. A request may originate from the verified user or a
-- Tenant Administrator, but only Application Administration may resolve it.
CREATE TABLE IF NOT EXISTS auth_account_reactivation_requests (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by_type TEXT NOT NULL CHECK (requested_by_type IN ('SELF', 'TENANT_ADMIN')),
  requested_by_actor_id TEXT NULL,
  requested_tenant_id TEXT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  first_requested_at DATETIME NOT NULL,
  last_requested_at DATETIME NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count >= 1),
  reviewed_by_actor_id TEXT NULL,
  reviewed_at DATETIME NULL,
  review_reason TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (account_id) REFERENCES auth_user_accounts(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (requested_by_actor_id) REFERENCES authz_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (requested_tenant_id) REFERENCES tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by_actor_id) REFERENCES authz_actors(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_auth_reactivation_account
ON auth_account_reactivation_requests(account_id);
CREATE INDEX IF NOT EXISTS idx_auth_reactivation_status_last_requested
ON auth_account_reactivation_requests(status, last_requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_reactivation_requested_tenant
ON auth_account_reactivation_requests(requested_tenant_id);
CREATE INDEX IF NOT EXISTS idx_auth_reactivation_requested_actor
ON auth_account_reactivation_requests(requested_by_actor_id);
CREATE INDEX IF NOT EXISTS idx_auth_reactivation_reviewed_actor
ON auth_account_reactivation_requests(reviewed_by_actor_id);

-- At most one open request per global Account. Repeated requests refresh that
-- row's count/timestamp and therefore do not create duplicate review work.
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_reactivation_one_pending_per_account
ON auth_account_reactivation_requests(account_id)
WHERE status = 'PENDING';
