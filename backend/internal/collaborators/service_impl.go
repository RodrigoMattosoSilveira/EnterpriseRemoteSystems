package collaborators

import (
	"context"
	"math"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/tenants"
)

const defaultTenantID = tenants.DefaultTenantID

const (
	defaultTimeOffGoldSplitPercent        = 50.0
	defaultSickDayOffReplacementGoldGrams = 1.0
	brlPaymentDecimalPlaces               = 2
	goldCommissionDecimalPlaces           = 8
)

type service struct{ repo Repository }

func NewService(repo Repository) Service { return &service{repo: repo} }

func (s *service) List(ctx context.Context, filter CollaboratorListFilter) ([]CollaboratorDTO, int64, error) {
	rows, total, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	return ToDTOList(rows), total, nil
}

func (s *service) Create(ctx context.Context, req CreateCollaboratorRequest, actorUserID string) (*CollaboratorDTO, error) {
	if err := ValidateCreateCollaborator(req); err != nil {
		return nil, err
	}

	startDate, err := parseDate(req.JourneyStartDate)
	if err != nil {
		return nil, ValidationError{Fields: map[string]string{"journeyStartDate": "Journey start date must be YYYY-MM-DD"}}
	}

	person, err := s.repo.FindPersonByID(ctx, strings.TrimSpace(req.PersonID))
	if err != nil {
		return nil, err
	}
	if !person.CanCreateCollaborator {
		return nil, ValidationError{Fields: map[string]string{"personId": "Person profile must be complete before creating a collaborator"}}
	}

	activeExists, err := s.repo.ExistsActiveJourneyForPerson(ctx, person.ID)
	if err != nil {
		return nil, err
	}
	if activeExists {
		return nil, ValidationError{Fields: map[string]string{"personId": "Person already has an active collaborator journey"}}
	}

	paymentMethod, err := s.validatePaymentMethod(ctx, req.PaymentMethodID)
	if err != nil {
		return nil, err
	}
	paymentConfig, err := paymentConfigFromRequest(req, paymentMethod.Code)
	if err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "sectorId", req.SectorID, "sector", "Sector must be active reference data of type sector"); err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "locationId", req.LocationID, "location", "Location must be active reference data of type location"); err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "taskId", req.TaskID, "task", "Task must be active reference data of type task"); err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "statusId", req.StatusID, "collaborator_status", "Status must be active reference data of type collaborator_status"); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	defaultEnd := startDate.AddDate(0, 0, 90)

	collaborator := &db.CollaboratorJourney{
		BaseModel:                      db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:                       defaultTenantID,
		PersonID:                       strings.TrimSpace(req.PersonID),
		JourneyStartDate:               startDate,
		DefaultEndDate:                 defaultEnd,
		ExtensionDays:                  0,
		ProjectedEndDate:               defaultEnd,
		PaymentMethodID:                strings.TrimSpace(req.PaymentMethodID),
		PaymentValue:                   paymentConfig.compatibilityValue(),
		FixedMonthlyBRLAmount:          paymentConfig.FixedMonthlyBRLAmount,
		DailyBRLAmount:                 paymentConfig.DailyBRLAmount,
		GoldCommissionPercent:          paymentConfig.GoldCommissionPercent,
		TimeOffGoldSplitPercent:        paymentConfig.TimeOffGoldSplitPercent,
		SickDayOffReplacementGoldGrams: paymentConfig.SickDayOffReplacementGoldGrams,
		PlanningAvailability:           normalizePlanningAvailability(req.PlanningAvailability),
		SectorID:                       strings.TrimSpace(req.SectorID),
		LocationID:                     strings.TrimSpace(req.LocationID),
		TaskID:                         strings.TrimSpace(req.TaskID),
		StatusID:                       strings.TrimSpace(req.StatusID),
		Notes:                          strings.TrimSpace(req.Notes),
	}

	if err := s.repo.Create(ctx, collaborator); err != nil {
		return nil, err
	}

	created, err := s.repo.FindByID(ctx, collaborator.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*created)), nil
}

func (s *service) Update(ctx context.Context, id string, req UpdateCollaboratorRequest, actorUserID string) (*CollaboratorDTO, error) {
	_ = actorUserID
	if err := ValidateUpdateCollaborator(req); err != nil {
		return nil, err
	}

	row, err := s.repo.FindByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}

	paymentMethod, err := s.validatePaymentMethod(ctx, req.PaymentMethodID)
	if err != nil {
		return nil, err
	}
	paymentConfig, err := paymentConfigFromRequest(CreateCollaboratorRequest{
		PaymentMethodID:                req.PaymentMethodID,
		PaymentValue:                   req.PaymentValue,
		FixedMonthlyBRLAmount:          req.FixedMonthlyBRLAmount,
		DailyBRLAmount:                 req.DailyBRLAmount,
		GoldCommissionPercent:          req.GoldCommissionPercent,
		TimeOffGoldSplitPercent:        req.TimeOffGoldSplitPercent,
		SickDayOffReplacementGoldGrams: req.SickDayOffReplacementGoldGrams,
	}, paymentMethod.Code)
	if err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "sectorId", req.SectorID, "sector", "Sector must be active reference data of type sector"); err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "locationId", req.LocationID, "location", "Location must be active reference data of type location"); err != nil {
		return nil, err
	}
	if err := s.validateReference(ctx, "taskId", req.TaskID, "task", "Task must be active reference data of type task"); err != nil {
		return nil, err
	}

	row.UpdatedAt = time.Now().UTC()
	row.ExtensionDays = req.ExtensionDays
	row.ProjectedEndDate = row.DefaultEndDate.AddDate(0, 0, req.ExtensionDays)
	row.PaymentMethodID = strings.TrimSpace(req.PaymentMethodID)
	row.PaymentValue = paymentConfig.compatibilityValue()
	row.FixedMonthlyBRLAmount = paymentConfig.FixedMonthlyBRLAmount
	row.DailyBRLAmount = paymentConfig.DailyBRLAmount
	row.GoldCommissionPercent = paymentConfig.GoldCommissionPercent
	row.TimeOffGoldSplitPercent = paymentConfig.TimeOffGoldSplitPercent
	row.SickDayOffReplacementGoldGrams = paymentConfig.SickDayOffReplacementGoldGrams
	if strings.TrimSpace(req.PlanningAvailability) != "" {
		row.PlanningAvailability = normalizePlanningAvailability(req.PlanningAvailability)
	}
	row.SectorID = strings.TrimSpace(req.SectorID)
	row.LocationID = strings.TrimSpace(req.LocationID)
	row.TaskID = strings.TrimSpace(req.TaskID)

	if err := s.repo.Update(ctx, row); err != nil {
		return nil, err
	}

	updated, err := s.repo.FindByID(ctx, row.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*updated)), nil
}

func (s *service) GetByID(ctx context.Context, id string) (*CollaboratorDTO, error) {
	row, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*row)), nil
}

func (s *service) validatePaymentMethod(ctx context.Context, id string) (*db.ReferenceData, error) {
	row, err := s.repo.FindActiveReference(ctx, strings.TrimSpace(id), "method")
	if err == nil {
		return row, nil
	}
	return nil, ValidationError{Fields: map[string]string{"paymentMethodId": "Payment method must be active reference data of type method"}}
}

func (s *service) validateReference(ctx context.Context, field string, id string, typ string, message string) error {
	exists, err := s.repo.ExistsActiveReference(ctx, strings.TrimSpace(id), typ)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	return ValidationError{Fields: map[string]string{field: message}}
}

type paymentConfig struct {
	FixedMonthlyBRLAmount          *float64
	DailyBRLAmount                 *float64
	GoldCommissionPercent          *float64
	TimeOffGoldSplitPercent        *float64
	SickDayOffReplacementGoldGrams *float64
}

func (c paymentConfig) compatibilityValue() float64 {
	if c.DailyBRLAmount != nil {
		return *c.DailyBRLAmount
	}
	if c.FixedMonthlyBRLAmount != nil {
		return *c.FixedMonthlyBRLAmount
	}
	if c.GoldCommissionPercent != nil {
		return *c.GoldCommissionPercent
	}
	return 0
}

func paymentConfigFromRequest(req CreateCollaboratorRequest, paymentMethodCode string) (paymentConfig, error) {
	fields := map[string]string{}
	method := normalizePaymentMethodCode(paymentMethodCode)
	cfg := paymentConfig{}

	switch method {
	case "DAILY_BRL":
		amount, field := paymentAmountFromRequest(req.DailyBRLAmount, req.PaymentValue, "dailyBrlAmount")
		if amount == nil {
			fields[field] = "Daily BRL amount is required for DAILY_BRL payment method"
		} else if *amount <= 0 {
			fields[field] = "Daily BRL amount must be greater than zero"
		} else if !hasAtMostDecimalPlaces(*amount, brlPaymentDecimalPlaces) {
			fields[field] = "Daily BRL amount can have at most two decimal places"
		} else {
			cfg.DailyBRLAmount = amount
		}
	case "FIXED_BRL":
		amount, field := paymentAmountFromRequest(req.FixedMonthlyBRLAmount, req.PaymentValue, "fixedMonthlyBrlAmount")
		if amount == nil {
			fields[field] = "Fixed monthly BRL amount is required for FIXED_BRL payment method"
		} else if *amount <= 0 {
			fields[field] = "Fixed monthly BRL amount must be greater than zero"
		} else if !hasAtMostDecimalPlaces(*amount, brlPaymentDecimalPlaces) {
			fields[field] = "Fixed monthly BRL amount can have at most two decimal places"
		} else {
			cfg.FixedMonthlyBRLAmount = amount
		}
	case "GOLD_COMMISSION":
		percent, field := paymentAmountFromRequest(req.GoldCommissionPercent, req.PaymentValue, "goldCommissionPercent")
		if percent == nil {
			fields[field] = "Gold commission percent is required for GOLD_COMMISSION payment method"
		} else if *percent <= 0 || *percent > 100 {
			fields[field] = "Gold commission percent must be greater than zero and at most 100"
		} else if !hasAtMostDecimalPlaces(*percent, goldCommissionDecimalPlaces) {
			fields[field] = "Gold commission percent can have at most eight decimal places"
		} else {
			cfg.GoldCommissionPercent = percent
		}

		split := req.TimeOffGoldSplitPercent
		if split == nil {
			value := defaultTimeOffGoldSplitPercent
			split = &value
		}
		if *split <= 0 || *split >= 100 {
			fields["timeOffGoldSplitPercent"] = "Time-off gold split percent must be greater than zero and less than 100"
		} else {
			cfg.TimeOffGoldSplitPercent = split
		}

		sickDayOffGold := req.SickDayOffReplacementGoldGrams
		if sickDayOffGold == nil {
			value := defaultSickDayOffReplacementGoldGrams
			sickDayOffGold = &value
		}
		if *sickDayOffGold <= 0 {
			fields["sickDayOffReplacementGoldGrams"] = "Sick day off replacement gold grams must be greater than zero"
		} else {
			cfg.SickDayOffReplacementGoldGrams = sickDayOffGold
		}
	default:
		fields["paymentMethodId"] = "Payment method code must be DAILY, SALARY, or COMMISSION"
	}

	if len(fields) > 0 {
		return paymentConfig{}, ValidationError{Fields: fields}
	}
	return cfg, nil
}

func paymentAmountFromRequest(specific *float64, paymentValue float64, specificField string) (*float64, string) {
	if specific != nil {
		return specific, specificField
	}
	if paymentValue > 0 {
		return &paymentValue, "paymentValue"
	}
	return nil, specificField
}

func hasAtMostDecimalPlaces(value float64, places int) bool {
	factor := math.Pow10(places)
	return math.Abs(value*factor-math.Round(value*factor)) < 0.000001
}

func normalizePaymentMethodCode(code string) string {
	switch strings.ToUpper(strings.TrimSpace(code)) {
	case "DAILY", "DAILY_WAGES", "DAILY_BRL":
		return "DAILY_BRL"
	case "SALARY", "FIXED_BRL":
		return "FIXED_BRL"
	case "COMMISSION", "GOLD_COMMISSION":
		return "GOLD_COMMISSION"
	default:
		return strings.ToUpper(strings.TrimSpace(code))
	}
}

func ptr[T any](value T) *T { return &value }
