package people

import (
	"context"
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

func (s *service) List(ctx context.Context, filter PersonListFilter) ([]PersonDTO, int64, error) {
	rows, total, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	return ToDTOList(rows), total, nil
}

func (s *service) Create(ctx context.Context, req CreatePersonRequest, actorUserID string) (*PersonDTO, error) {
	if err := ValidateCreatePerson(req); err != nil {
		return nil, err
	}

	if err := s.validatePersonStatus(ctx, req.StatusID); err != nil {
		return nil, err
	}

	exists, err := s.repo.ExistsByUniqueFields(
		ctx,
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
	if exists {
		return nil, ValidationError{
			Fields: map[string]string{
				"person": "CPF, RG, cellular, email, or PIX already exists",
			},
		}
	}

	completion := ComputeCompletion(completionInput{})

	now := time.Now().UTC()

	person := &db.Person{
		BaseModel: db.BaseModel{
			ID:        ids.New(),
			CreatedAt: now,
			UpdatedAt: now,
		},

		FirstName: strings.TrimSpace(req.FirstName),
		LastName:  strings.TrimSpace(req.LastName),
		Nickname:  strings.TrimSpace(req.Nickname),

		CPF:      NormalizeDigits(req.CPF),
		RG:       strings.TrimSpace(req.RG),
		Cellular: NormalizeDigits(req.Cellular),
		Email:    strings.TrimSpace(strings.ToLower(req.Email)),

		Country: "Brasil",

		ProfileCompletionStatus: completion.Status,
		CanCreateCollaborator:   completion.CanCreateCollaborator,

		StatusID: req.StatusID,
		Notes:    strings.TrimSpace(req.Notes),
	}

	if err := s.repo.Create(ctx, person); err != nil {
		return nil, err
	}

	created, err := s.repo.FindByID(ctx, person.ID)
	if err != nil {
		return nil, err
	}

	return ptr(ToDTO(*created)), nil
}

func (s *service) GetByID(ctx context.Context, id string) (*PersonDTO, error) {
	person, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	return ptr(ToDTO(*person)), nil
}

func (s *service) Update(ctx context.Context, id string, req UpdatePersonRequest, actorUserID string) (*PersonDTO, error) {
	if err := ValidateUpdatePerson(req); err != nil {
		return nil, err
	}

	if err := s.validatePersonStatus(ctx, req.StatusID); err != nil {
		return nil, err
	}

	person, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

	pixKey := NormalizeDigits(req.PIXKey)
	if strings.TrimSpace(req.PIXKey) == "" {
		pixKey = ""
	}

	exists, err := s.repo.ExistsByUniqueFields(
		ctx,
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
	if exists {
		return nil, ValidationError{
			Fields: map[string]string{
				"person": "CPF, RG, cellular, email, or PIX already exists",
			},
		}
	}

	country := defaultCountry(req.Country)

	completion := ComputeCompletion(completionInput{
		Street1:           req.Street1,
		State:             req.State,
		CEP:               NormalizeDigits(req.CEP),
		City:              req.City,
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
	person.State = strings.TrimSpace(req.State)
	person.CEP = NormalizeDigits(req.CEP)
	person.City = strings.TrimSpace(req.City)
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

	person.StatusID = req.StatusID
	person.Notes = strings.TrimSpace(req.Notes)
	person.UpdatedAt = time.Now().UTC()

	if err := s.repo.Update(ctx, person); err != nil {
		return nil, err
	}

	updated, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}

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
func (s *service) validatePersonStatus(ctx context.Context, statusID string) error {
	exists, err := s.repo.ExistsActivePersonStatus(ctx, strings.TrimSpace(statusID))
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
