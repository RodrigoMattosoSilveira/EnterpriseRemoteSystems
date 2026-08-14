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

	return database.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec(`
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
  )`).Error; err != nil {
			return fmt.Errorf("repair global people foundation: %w", err)
		}

		if err := tx.Exec(`
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
)`).Error; err != nil {
			return fmt.Errorf("repair person tenant memberships: %w", err)
		}
		return nil
	})
}
