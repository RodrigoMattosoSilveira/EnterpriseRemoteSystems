package db

import (
	"fmt"

	"gorm.io/gorm"
)

// EnsureGlobalPersonMembershipFoundation repairs the additive Bite 30B
// foundation for any legacy people rows that were written outside the People
// repository. During the staged 30B-30G cutover, legacy writers can still
// exist; every such row must nevertheless have one canonical global Person and
// one tenant Membership before global lookup is authoritative.
func EnsureGlobalPersonMembershipFoundation(database *gorm.DB) error {
	if database == nil {
		return nil
	}
	migrator := database.Migrator()
	if !migrator.HasTable("people") || !migrator.HasTable("global_people") || !migrator.HasTable("person_tenant_memberships") {
		return nil
	}

	lifecycleAware := migrator.HasColumn(&GlobalPerson{}, "OperationalActive") && migrator.HasTable("reference_data")
	return database.Transaction(func(tx *gorm.DB) error {
		globalInsert := `
INSERT OR IGNORE INTO global_people (
  id, first_name, last_name, nickname, cpf, rg, cellular, email,
  street1, street2, state, cep, city, country,
  bank_name, bank_number, checking_account, pix_key,
  emergency_name, emergency_cellular, emergency_email,
  profile_completion_status, can_create_collaborator,
  created_at, updated_at
)
SELECT
  p.id, p.first_name, p.last_name, p.nickname, p.cpf, p.rg, p.cellular, p.email,
  p.street1, p.street2, p.state, p.cep, p.city, p.country,
  p.bank_name, p.bank_number, p.checking_account, p.pix_key,
  p.emergency_name, p.emergency_cellular, p.emergency_email,
  p.profile_completion_status, p.can_create_collaborator,
  p.created_at, p.updated_at
FROM people p
WHERE NOT EXISTS (SELECT 1 FROM global_people gp WHERE gp.cpf = p.cpf)
  AND p.id = (
    SELECT p2.id
    FROM people p2
    WHERE p2.cpf = p.cpf
    ORDER BY p2.updated_at DESC, p2.created_at ASC, p2.id ASC
    LIMIT 1
  )`
		if lifecycleAware {
			globalInsert = `
INSERT OR IGNORE INTO global_people (
  id, first_name, last_name, nickname, cpf, rg, cellular, email,
  street1, street2, state, cep, city, country,
  bank_name, bank_number, checking_account, pix_key,
  emergency_name, emergency_cellular, emergency_email,
  profile_completion_status, can_create_collaborator, operational_active,
  created_at, updated_at
)
SELECT
  p.id, p.first_name, p.last_name, p.nickname, p.cpf, p.rg, p.cellular, p.email,
  p.street1, p.street2, p.state, p.cep, p.city, p.country,
  p.bank_name, p.bank_number, p.checking_account, p.pix_key,
  p.emergency_name, p.emergency_cellular, p.emergency_email,
  p.profile_completion_status, p.can_create_collaborator,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM people active_p
      JOIN reference_data active_s
        ON active_s.id = active_p.status_id
       AND active_s.tenant_id = active_p.tenant_id
       AND active_s.type = 'person_status'
       AND active_s.code = 'ACTIVE'
       AND active_s.active = 1
      WHERE active_p.cpf = p.cpf
    ) THEN 1
    WHEN EXISTS (
      SELECT 1
      FROM people inactive_p
      JOIN reference_data inactive_s
        ON inactive_s.id = inactive_p.status_id
       AND inactive_s.tenant_id = inactive_p.tenant_id
       AND inactive_s.type = 'person_status'
       AND inactive_s.code = 'INACTIVE'
       AND inactive_s.active = 1
      WHERE inactive_p.cpf = p.cpf
    ) THEN 0
    ELSE 1
  END,
  p.created_at, p.updated_at
FROM people p
WHERE NOT EXISTS (SELECT 1 FROM global_people gp WHERE gp.cpf = p.cpf)
  AND p.id = (
    SELECT p2.id
    FROM people p2
    WHERE p2.cpf = p.cpf
    ORDER BY p2.updated_at DESC, p2.created_at ASC, p2.id ASC
    LIMIT 1
  )`
		}
		if err := tx.Exec(globalInsert).Error; err != nil {
			return fmt.Errorf("repair global people foundation: %w", err)
		}

		membershipInsert := `
INSERT OR IGNORE INTO person_tenant_memberships (
  id, created_at, updated_at, tenant_id, person_id, status_id, notes, legacy_person_id
)
SELECT
  'person-membership-' || p.id,
  p.created_at,
  p.updated_at,
  p.tenant_id,
  gp.id,
  p.status_id,
  p.notes,
  p.id
FROM people p
JOIN global_people gp ON gp.cpf = p.cpf
WHERE NOT EXISTS (
  SELECT 1
  FROM person_tenant_memberships m
  WHERE m.tenant_id = p.tenant_id
    AND m.person_id = gp.id
)`
		if lifecycleAware {
			membershipInsert = `
INSERT OR IGNORE INTO person_tenant_memberships (
  id, created_at, updated_at, tenant_id, person_id, status_id, notes, legacy_person_id
)
SELECT
  'person-membership-' || p.id,
  p.created_at,
  p.updated_at,
  p.tenant_id,
  gp.id,
  CASE WHEN gp.operational_active = 0 THEN COALESCE((
    SELECT s.id
    FROM reference_data s
    WHERE s.tenant_id = p.tenant_id
      AND s.type = 'person_status'
      AND s.code = 'INACTIVE'
      AND s.active = 1
    ORDER BY s.sort_order ASC, s.id ASC
    LIMIT 1
  ), p.status_id) ELSE p.status_id END,
  p.notes,
  p.id
FROM people p
JOIN global_people gp ON gp.cpf = p.cpf
WHERE NOT EXISTS (
  SELECT 1
  FROM person_tenant_memberships m
  WHERE m.tenant_id = p.tenant_id
    AND m.person_id = gp.id
)`
		}
		if err := tx.Exec(membershipInsert).Error; err != nil {
			return fmt.Errorf("repair person tenant memberships: %w", err)
		}

		if lifecycleAware {
			// A compatibility writer must not be able to create an ACTIVE legacy
			// projection for a globally operationally inactive Person. Synchronize
			// the legacy projection back to the authoritative Membership selected
			// above; explicit Tenant reactivation is the only path that returns it
			// to ACTIVE.
			if err := tx.Exec(`
UPDATE people
SET status_id = (
  SELECT m.status_id
  FROM person_tenant_memberships m
  WHERE m.legacy_person_id = people.id
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM person_tenant_memberships m
  WHERE m.legacy_person_id = people.id
    AND m.status_id <> people.status_id
)`).Error; err != nil {
				return fmt.Errorf("synchronize legacy Person Membership lifecycle: %w", err)
			}
		}
		return nil
	})
}
