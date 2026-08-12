package people

import (
	"context"
	"log"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
)

type service struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &service{repo: repo}
}

func (s *service) List(ctx context.Context, tenantID string, filter PersonListFilter) ([]PersonDTO, int64, error) {
	rows, total, err := s.repo.List(ctx, tenantID, filter)
	if err != nil {
		return nil, 0, err
	}

	return ToDTOList(rows), total, nil
}

func (s *service) Create(ctx context.Context, tenantID string, req CreatePersonRequest, actorUserID string) (*PersonDTO, error) {
	if err := ValidateCreatePerson(req); err != nil {
		return nil, err
	}

	if err := s.validatePersonStatus(ctx, tenantID, req.StatusID); err != nil {
		return nil, err
	}

	conflicts, err := s.repo.UniqueConflicts(
		ctx,
		tenantID,
		NormalizeDigits(req.CPF),
		strings.TrimSpace(req.RG),
		NormalizeDigits(req.Cellular),
		strings.TrimSpace(strings.ToLower(req.Email)),
		nil,
		nil,
	)
	if err != nil {
		return nil, err
	}
	if len(conflicts) > 0 {
		return nil, uniqueConflictValidationError(conflicts)
	}

	now := time.Now().UTC()

	person := &db.Person{
		BaseModel: db.BaseModel{
			ID:        ids.New(),
			CreatedAt: now,
			UpdatedAt: now,
		},
		TenantID: tenantID,

		FirstName: strings.TrimSpace(req.FirstName),
		LastName:  strings.TrimSpace(req.LastName),
		Nickname:  strings.TrimSpace(req.Nickname),

		CPF:      NormalizeDigits(req.CPF),
		RG:       strings.TrimSpace(req.RG),
		Cellular: NormalizeDigits(req.Cellular),
		Email:    strings.TrimSpace(strings.ToLower(req.Email)),

		Street1: strings.TrimSpace(req.Street1),
		Street2: strings.TrimSpace(req.Street2),
		City:    strings.TrimSpace(req.City),
		State:   strings.TrimSpace(req.State),
		CEP:     NormalizeCEP(req.CEP),
		Country: defaultCountry(req.Country),

		BankName:        strings.TrimSpace(req.BankName),
		BankNumber:      strings.TrimSpace(req.BankNumber),
		CheckingAccount: strings.TrimSpace(req.CheckingAccount),
		PIXKey:          stringPtrOrNil(req.PIXKey),

		EmergencyName:     strings.TrimSpace(req.EmergencyName),
		EmergencyCellular: NormalizeDigits(req.EmergencyCellular),
		EmergencyEmail:    strings.TrimSpace(strings.ToLower(req.EmergencyEmail)),

		StatusID: strings.TrimSpace(req.StatusID),
		Notes:    strings.TrimSpace(req.Notes),
	}

	completion := ComputeCompletion(completionInput{
		Street1:           person.Street1,
		Street2:           person.Street2,
		City:              person.City,
		State:             person.State,
		CEP:               person.CEP,
		Country:           person.Country,
		BankName:          person.BankName,
		BankNumber:        person.BankNumber,
		CheckingAccount:   person.CheckingAccount,
		PIXKey:            stringValue(person.PIXKey),
		EmergencyName:     person.EmergencyName,
		EmergencyCellular: person.EmergencyCellular,
		EmergencyEmail:    person.EmergencyEmail,
	})

	person.ProfileCompletionStatus = completion.Status
	person.CanCreateCollaborator = completion.CanCreateCollaborator

	if err := s.repo.Create(ctx, person); err != nil {
		return nil, err
	}

	created, err := s.repo.FindByID(ctx, tenantID, person.ID)
	if err != nil {
		return nil, err
	}

	return ptr(ToDTO(*created)), nil
}

func (s *service) GetByID(ctx context.Context, tenantID string, id string) (*PersonDTO, error) {
	person, err := s.repo.FindByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}

	return ptr(ToDTO(*person)), nil
}

func (s *service) Update(ctx context.Context, tenantID string, id string, req UpdatePersonRequest, actorUserID string) (*PersonDTO, error) {
	if err := ValidateUpdatePerson(req); err != nil {
		return nil, err
	}

	person, err := s.repo.FindByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}

	if err := s.validatePersonStatus(ctx, person.TenantID, req.StatusID); err != nil {
		return nil, err
	}

	pixKey := strings.TrimSpace(req.PIXKey)

	conflicts, err := s.repo.UniqueConflicts(
		ctx,
		person.TenantID,
		NormalizeDigits(req.CPF),
		strings.TrimSpace(req.RG),
		NormalizeDigits(req.Cellular),
		strings.TrimSpace(strings.ToLower(req.Email)),
		emptyToNil(pixKey),
		&id,
	)
	if err != nil {
		return nil, err
	}
	if len(conflicts) > 0 {
		return nil, uniqueConflictValidationError(conflicts)
	}

	country := defaultCountry(req.Country)

	completion := ComputeCompletion(completionInput{
		Street1:           req.Street1,
		Street2:           req.Street2,
		City:              req.City,
		State:             req.State,
		CEP:               NormalizeCEP(req.CEP),
		Country:           country,
		BankName:          req.BankName,
		BankNumber:        req.BankNumber,
		CheckingAccount:   req.CheckingAccount,
		PIXKey:            pixKey,
		EmergencyName:     req.EmergencyName,
		EmergencyCellular: NormalizeDigits(req.EmergencyCellular),
		EmergencyEmail:    strings.TrimSpace(strings.ToLower(req.EmergencyEmail)),
	})

	person.FirstName = strings.TrimSpace(req.FirstName)
	person.LastName = strings.TrimSpace(req.LastName)
	person.Nickname = strings.TrimSpace(req.Nickname)

	person.CPF = NormalizeDigits(req.CPF)
	person.RG = strings.TrimSpace(req.RG)
	person.Cellular = NormalizeDigits(req.Cellular)
	person.Email = strings.TrimSpace(strings.ToLower(req.Email))

	person.Street1 = strings.TrimSpace(req.Street1)
	person.Street2 = strings.TrimSpace(req.Street2)
	person.City = strings.TrimSpace(req.City)
	person.State = strings.TrimSpace(req.State)
	person.CEP = NormalizeCEP(req.CEP)
	person.Country = country

	person.BankName = strings.TrimSpace(req.BankName)
	person.BankNumber = strings.TrimSpace(req.BankNumber)
	person.CheckingAccount = strings.TrimSpace(req.CheckingAccount)
	person.PIXKey = emptyToNil(pixKey)

	person.EmergencyName = strings.TrimSpace(req.EmergencyName)
	person.EmergencyCellular = NormalizeDigits(req.EmergencyCellular)
	person.EmergencyEmail = strings.TrimSpace(strings.ToLower(req.EmergencyEmail))

	person.ProfileCompletionStatus = completion.Status
	person.CanCreateCollaborator = completion.CanCreateCollaborator

	person.StatusID = strings.TrimSpace(req.StatusID)
	person.Notes = strings.TrimSpace(req.Notes)
	person.UpdatedAt = time.Now().UTC()

	log.Printf("UpdatePerson %s: requested statusId=%q", id, req.StatusID)
	log.Printf("UpdatePerson %s: saving statusId=%q", id, person.StatusID)

	if err := s.repo.Update(ctx, tenantID, person); err != nil {
		return nil, err
	}

	updated, err := s.repo.FindByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}
	log.Printf("UpdatePerson %s: returned statusId=%q", id, updated.StatusID)

	return ptr(ToDTO(*updated)), nil
}

// func (s *service) ListJourneys(ctx context.Context, personID string) ([]CollaboratorDTO, error) {
// 	return []CollaboratorDTO{}, nil
// }

func defaultCountry(value string) string {
	if strings.TrimSpace(value) == "" {
		return "Brasil"
	}
	return strings.TrimSpace(value)
}

func emptyToNil(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func ptr[T any](value T) *T {
	return &value
}
func (s *service) validatePersonStatus(ctx context.Context, tenantID string, statusID string) error {
	exists, err := s.repo.ExistsActivePersonStatus(ctx, tenantID, strings.TrimSpace(statusID))
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	return ValidationError{
		Fields: map[string]string{
			"statusId": "Status must be an active person status",
		},
	}
}

func uniqueConflictValidationError(conflicts map[string]bool) ValidationError {
	fields := map[string]string{}

	messages := map[string]string{
		"cpf":      "CPF already exists",
		"rg":       "RG already exists",
		"cellular": "Cellular already exists",
		"email":    "Email already exists",
		"pixKey":   "PIX key already exists",
	}

	for field, message := range messages {
		if conflicts[field] {
			fields[field] = message
		}
	}

	return ValidationError{Fields: fields}
}

func stringPtrOrNil(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}
