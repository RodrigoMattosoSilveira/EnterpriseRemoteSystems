-- Bite 33.6.3 operational repair: ONLY the known unbound, legacy bootstrap
-- APPLICATION_ADMIN grant. Executed on a verified recovery clone, then on the
-- offline live DB, by server-migration-recovery-gate.sh. No general grant repair.
.bail on
PRAGMA foreign_keys=ON;
BEGIN IMMEDIATE;
-- Fail closed on unexpected actor/grant identity or binding, and require a
-- separate, canonical, active Application Administrator to remain in place.
CREATE TEMP TABLE _bootstrap_repair_gate (ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO _bootstrap_repair_gate(ok)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM authz_actors WHERE id='authz-actor-bootstrap-admin' AND actor_key='bootstrap-admin')=1
  AND (SELECT COUNT(*) FROM authz_actor_role_grants g JOIN authz_roles r ON r.id=g.role_id
       WHERE g.id='authz-grant-bootstrap-admin-application-admin'
         AND g.actor_id='authz-actor-bootstrap-admin' AND r.code='APPLICATION_ADMIN'
         AND g.tenant_id='*' AND g.lifecycle_suspended=0)=1
  AND NOT EXISTS(SELECT 1 FROM auth_account_actors WHERE actor_id='authz-actor-bootstrap-admin')
  AND EXISTS (
     SELECT 1 FROM authz_actor_role_grants g JOIN authz_roles r ON r.id=g.role_id
     JOIN authz_actors a ON a.id=g.actor_id
     JOIN auth_account_actors aa ON aa.actor_id=a.id
     JOIN auth_user_accounts u ON u.id=aa.account_id
     WHERE r.code='APPLICATION_ADMIN' AND g.tenant_id='*' AND g.active=1
       AND g.lifecycle_suspended=0 AND r.active=1 AND a.active=1
       AND a.id!='authz-actor-bootstrap-admin' AND u.active=1 AND u.security_suspended=0
       AND aa.scope_type='GLOBAL' AND aa.tenant_id IS NULL AND aa.membership_id IS NULL
       AND NOT EXISTS(SELECT 1 FROM auth_account_people ap WHERE ap.account_id=u.id)
       AND NOT EXISTS(SELECT 1 FROM auth_account_actors ta WHERE ta.actor_id=a.id AND ta.scope_type='TENANT')
  ) THEN 1 ELSE 0 END;
DROP TABLE _bootstrap_repair_gate;
-- Append audit only on the transition; reruns do not duplicate audit.
INSERT INTO authz_audit_logs
  (id,occurred_at,actor_id,actor_record_id,tenant_id,permission_code,operation,
   target_type,target_id,decision,reason,created_at,correlation_id,authorization_source)
SELECT 'ops-bootstrap-revoke-' || lower(hex(randomblob(16))),CURRENT_TIMESTAMP,
  NULL,NULL,'*',NULL,'production.bootstrap_admin_grant.revoke',
  'authz_actor_role_grant',g.id,'allowed',
  'Bite 33.6.3: revoke orphaned legacy bootstrap authority after canonical account validation',
  CURRENT_TIMESTAMP, 'ops-bootstrap-revoke-' || lower(hex(randomblob(16))), 'NONE'
FROM authz_actor_role_grants g
WHERE g.id='authz-grant-bootstrap-admin-application-admin' AND g.active=1;
UPDATE authz_actor_role_grants
SET active=0, updated_at=CURRENT_TIMESTAMP
WHERE id='authz-grant-bootstrap-admin-application-admin' AND active=1;
-- A second fail-closed assertion ensures this exact grant is no longer effective.
CREATE TEMP TABLE _bootstrap_repair_post (ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO _bootstrap_repair_post(ok)
SELECT CASE WHEN (SELECT active FROM authz_actor_role_grants
  WHERE id='authz-grant-bootstrap-admin-application-admin')=0 THEN 1 ELSE 0 END;
DROP TABLE _bootstrap_repair_post;
COMMIT;
