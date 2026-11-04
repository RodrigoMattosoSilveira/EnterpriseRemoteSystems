// Package tenantonboarding provisions a new Tenant's first Tenant
// Administrator. It composes People and Authentication inside the Tenant
// creation transaction, which the tenants package cannot do directly because
// People already depends on it.
package tenantonboarding

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/people"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/tenants"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const provisioningActorUserID = "tenant-onboarding"

type Provisioner struct {
	passwordHashCost int
	clock            func() time.Time
}

var _ tenants.FirstAdministratorProvisioner = (*Provisioner)(nil)

func NewProvisioner(passwordHashCost int) *Provisioner {
	if passwordHashCost < bcrypt.MinCost || passwordHashCost > bcrypt.MaxCost {
		passwordHashCost = bcrypt.DefaultCost
	}
	return &Provisioner{passwordHashCost: passwordHashCost, clock: time.Now}
}

func (p *Provisioner) ValidateFirstAdministrator(req tenants.FirstAdministratorRequest) map[string]string {
	fields := map[string]string{}
	if err := people.ValidateCreatePerson(personRequest(req, "")); err != nil {
		if validationErr, ok := people.IsValidationError(err); ok {
			for field, message := range validationErr.Fields {
				fields[field] = message
			}
		} else {
			fields["email"] = err.Error()
		}
	}
	// The Membership status is chosen by provisioning, not by the caller.
	delete(fields, "statusId")
	for field, message := range authentication.ValidateTemporaryPassword(req.TemporaryPassword, "temporaryPassword") {
		fields[field] = message
	}
	return fields
}

func (p *Provisioner) ProvisionFirstAdministrator(ctx context.Context, tx *gorm.DB, tenantID string, req tenants.FirstAdministratorRequest) (string, error) {
	var status db.ReferenceData
	if err := tx.WithContext(ctx).
		Where("tenant_id = ? AND type = ? AND code = ? AND active = ?", tenantID, "person_status", "ACTIVE", true).
		First(&status).Error; err != nil {
		return "", fmt.Errorf("find new Tenant ACTIVE Person status: %w", err)
	}

	// The People service owns Person validation, global uniqueness and the
	// Person/Membership pair; running it on tx keeps it inside this Tenant's
	// creation transaction.
	person, err := people.NewService(people.NewRepository(tx)).Create(ctx, tenantID, personRequest(req, status.ID), provisioningActorUserID)
	if err != nil {
		if validationErr, ok := people.IsValidationError(err); ok {
			return "", tenants.ValidationError{Fields: validationErr.Fields}
		}
		return "", fmt.Errorf("create first Tenant Administrator Person: %w", err)
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.TemporaryPassword), p.passwordHashCost)
	if err != nil {
		return "", fmt.Errorf("hash first Tenant Administrator password: %w", err)
	}
	now := p.clock().UTC()
	account := authentication.Account{
		ID:                 ids.New(),
		Login:              strings.ToLower(strings.TrimSpace(req.Email)),
		PasswordHash:       string(passwordHash),
		Active:             true,
		MustChangePassword: true,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	if _, err := authentication.NewRepository(tx).CreatePersonAccount(ctx, tenantID, person.GlobalPersonID, account); err != nil {
		if errors.Is(err, authentication.ErrLoginAlreadyExists) {
			return "", tenants.ValidationError{Fields: map[string]string{
				"email": "An Authentication Account already uses this email",
			}}
		}
		return "", fmt.Errorf("create first Tenant Administrator Account: %w", err)
	}

	var binding authentication.AccountActor
	if err := tx.WithContext(ctx).
		Where("account_id = ? AND scope_type = ? AND tenant_id = ?", account.ID, authentication.AccountActorScopeTenant, tenantID).
		First(&binding).Error; err != nil {
		return "", fmt.Errorf("find first Tenant Administrator Actor: %w", err)
	}
	return binding.ActorID, nil
}

func personRequest(req tenants.FirstAdministratorRequest, statusID string) people.CreatePersonRequest {
	nickname := strings.TrimSpace(req.Nickname)
	if nickname == "" {
		nickname = strings.TrimSpace(req.FirstName)
	}
	return people.CreatePersonRequest{
		FirstName: req.FirstName,
		LastName:  req.LastName,
		Nickname:  nickname,
		CPF:       req.CPF,
		RG:        req.RG,
		Cellular:  req.Cellular,
		Email:     req.Email,
		StatusID:  statusID,
	}
}
