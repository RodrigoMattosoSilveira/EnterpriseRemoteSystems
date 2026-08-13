PRAGMA foreign_keys = ON;

DROP TRIGGER IF EXISTS trg_person_membership_legacy_projection_update;
DROP TRIGGER IF EXISTS trg_person_membership_legacy_projection_insert;
DROP TRIGGER IF EXISTS trg_person_membership_identity_immutable;
DROP TRIGGER IF EXISTS trg_person_membership_tenant_status_update;
DROP TRIGGER IF EXISTS trg_person_membership_tenant_status_insert;

DROP INDEX IF EXISTS idx_person_tenant_memberships_status;
DROP INDEX IF EXISTS idx_person_tenant_memberships_person;
DROP INDEX IF EXISTS idx_person_tenant_memberships_tenant;
DROP INDEX IF EXISTS ux_person_tenant_membership_legacy_person;
DROP INDEX IF EXISTS ux_person_tenant_membership;
DROP TABLE IF EXISTS person_tenant_memberships;

DROP INDEX IF EXISTS idx_global_people_name;
DROP INDEX IF EXISTS idx_global_people_pix_key;
DROP INDEX IF EXISTS idx_global_people_email;
DROP INDEX IF EXISTS idx_global_people_cellular;
DROP INDEX IF EXISTS idx_global_people_rg;
DROP INDEX IF EXISTS ux_global_people_cpf;
DROP TABLE IF EXISTS global_people;
