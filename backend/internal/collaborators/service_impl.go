package collaborators

import (
	"context"
	"math"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/db"
	peoplepkg "enterpriseremotesystems/backend/internal/people"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
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

func (s *service) ListForMembership(ctx context.Context, membershipID string) ([]CollaboratorDTO, error) {
	rows, err := s.repo.ListForMembership(ctx, strings.TrimSpace(membershipID))
	if err != nil {
		return nil, err
	}
	return ToDTOList(rows), nil
}

func (s *service) ListSelf(ctx context.Context, membershipID string) ([]CollaboratorDTO, error) {
	return s.ListForMembership(ctx, membershipID)
}

func (s *service) ListCandidates(ctx context.Context) ([]peoplepkg.PersonDTO, error) {
	rows, err := s.repo.ListCandidateMemberships(ctx)
	if err != nil {
		return nil, err
	}

	items := make([]peoplepkg.PersonDTO, 0, len(rows))
	for _, membership := range rows {
		items = append(items, membershipCandidateToPersonDTO(membership))
	}
	return items, nil
}

func (s *service) Create(ctx context.Context, req CreateCollaboratorRequest, actorUserID string) (*CollaboratorDTO, error) {
	if err := ValidateCreateCollaborator(req); err != nil {
		return nil, err
	}

	startDate, err := parseDate(req.JourneyStartDate)
	if err != nil {
		return nil, ValidationError{Fields: map[string]string{"journeyStartDate": "Journey start date must be YYYY-MM-DD"}}
	}

	membership, err := s.repo.FindActiveMembershipByID(ctx, strings.TrimSpace(req.MembershipID))
	if err != nil {
		return nil, ValidationError{Fields: map[string]string{"membershipId": "An active Person–Tenant Membership in this tenant is required"}}
	}
	if !membership.Person.CanCreateCollaborator {
		return nil, ValidationError{Fields: map[string]string{"membershipId": "Person profile must be complete before creating a Collaborator"}}
	}

	activeExists, err := s.repo.ExistsOpenJourneyForMembership(ctx, membership.ID)
	if err != nil {
		return nil, err
	}
	if activeExists {
		return nil, ValidationError{Fields: map[string]string{"membershipId": "Membership already has an open Collaborator Journey"}}
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

	membershipID := membership.ID
	collaborator := &db.CollaboratorJourney{
		BaseModel:                      db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:                       tenantctx.TenantID(ctx),
		MembershipID:                   &membershipID,
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
		BonusBRLAmount:                 req.BonusBRLAmount,
		BonusDescription:               strings.TrimSpace(req.BonusDescription),
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
	row.PaymentMethodID = strings.TrimSpace(req.PaymentMethodID)
	row.PaymentValue = paymentConfig.compatibilityValue()
	row.FixedMonthlyBRLAmount = paymentConfig.FixedMonthlyBRLAmount
	row.DailyBRLAmount = paymentConfig.DailyBRLAmount
	row.GoldCommissionPercent = paymentConfig.GoldCommissionPercent
	row.TimeOffGoldSplitPercent = paymentConfig.TimeOffGoldSplitPercent
	row.SickDayOffReplacementGoldGrams = paymentConfig.SickDayOffReplacementGoldGrams
	if row.ClosedAt != nil && !bonusConfigEqual(row.BonusBRLAmount, req.BonusBRLAmount, row.BonusDescription, req.BonusDescription) {
		return nil, ValidationError{Fields: map[string]string{"bonusBrlAmount": "Closed Journey bonus compensation is immutable"}}
	}
	if row.BonusPostedAt != nil {
		if !bonusConfigEqual(row.BonusBRLAmount, req.BonusBRLAmount, row.BonusDescription, req.BonusDescription) {
			return nil, ValidationError{Fields: map[string]string{"bonusBrlAmount": "Posted Journey bonus compensation is immutable"}}
		}
	} else {
		row.BonusBRLAmount = req.BonusBRLAmount
		row.BonusDescription = strings.TrimSpace(req.BonusDescription)
	}
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

func (s *service) UpdateWorkAssignment(ctx context.Context, id string, req UpdateCollaboratorWorkAssignmentRequest, actorUserID string) (*CollaboratorDTO, error) {
	_ = actorUserID
	if err := ValidateUpdateCollaboratorWorkAssignment(req); err != nil {
		return nil, err
	}

	row, err := s.repo.FindByID(ctx, strings.TrimSpace(id))
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
	row.SectorID = strings.TrimSpace(req.SectorID)
	row.LocationID = strings.TrimSpace(req.LocationID)
	row.TaskID = strings.TrimSpace(req.TaskID)

	if err := s.repo.UpdateWorkAssignment(ctx, row); err != nil {
		return nil, err
	}

	updated, err := s.repo.FindByID(ctx, row.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*updated)), nil
}

func (s *service) ExtendJourney(ctx context.Context, id string, req ExtendCollaboratorJourneyRequest, actorUserID string) (*JourneyExtensionRequestDTO, error) {
	if err := ValidateExtendCollaboratorJourney(req); err != nil {
		return nil, err
	}
	row, err := s.repo.FindByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	if row.ClosedAt != nil || strings.EqualFold(strings.TrimSpace(row.Status.Code), "FINISHED") {
		return nil, ValidationError{Fields: map[string]string{"additionalDays": "Closed Journeys cannot be extended"}}
	}
	existing, err := s.repo.ListExtensionRequests(ctx, row.ID)
	if err != nil {
		return nil, err
	}
	for _, candidate := range existing {
		if candidate.Status == "PENDING" {
			return nil, ValidationError{Fields: map[string]string{"additionalDays": "Resolve the pending Journey extension request before creating another"}}
		}
	}
	now := time.Now().UTC()
	requestID := ids.New()
	request := &db.JourneyExtensionRequest{
		BaseModel: db.BaseModel{ID: requestID, CreatedAt: now, UpdatedAt: now},
		TenantID:  tenantctx.TenantID(ctx), CollaboratorJourneyID: row.ID,
		ReceiptNumber: journeyExtensionReceiptNumber(requestID), PreviousEndDate: row.ProjectedEndDate,
		ProposedEndDate: row.ProjectedEndDate.AddDate(0, 0, req.AdditionalDays), AdditionalDays: req.AdditionalDays,
		Reason: strings.TrimSpace(req.Reason), Status: "PENDING", RequestedBy: strings.TrimSpace(actorUserID), RequestedAt: now,
	}
	if err := s.repo.CreateExtensionRequest(ctx, request); err != nil {
		return nil, err
	}
	dto := journeyExtensionRequestDTO(*request)
	return &dto, nil
}

func (s *service) ListExtensionRequests(ctx context.Context, id string) ([]JourneyExtensionRequestDTO, error) {
	if _, err := s.repo.FindByID(ctx, strings.TrimSpace(id)); err != nil {
		return nil, err
	}
	rows, err := s.repo.ListExtensionRequests(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	out := make([]JourneyExtensionRequestDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, journeyExtensionRequestDTO(row))
	}
	return out, nil
}

func (s *service) ListSelfExtensionRequests(ctx context.Context, id, membershipID string) ([]JourneyExtensionRequestDTO, error) {
	if _, err := s.repo.FindByIDForMembership(ctx, strings.TrimSpace(id), strings.TrimSpace(membershipID)); err != nil {
		return nil, err
	}
	rows, err := s.repo.ListExtensionRequests(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	out := make([]JourneyExtensionRequestDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, journeyExtensionRequestDTO(row))
	}
	return out, nil
}

func (s *service) AcceptExtensionRequest(ctx context.Context, id, requestID, actorCollaboratorID, actorUserID string) (*JourneyExtensionRequestDTO, error) {
	if strings.TrimSpace(actorCollaboratorID) == "" || strings.TrimSpace(actorCollaboratorID) != strings.TrimSpace(id) {
		return nil, authz.ErrForbidden
	}
	journey, err := s.repo.FindByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	request, err := s.repo.FindExtensionRequest(ctx, journey.ID, strings.TrimSpace(requestID))
	if err != nil {
		return nil, err
	}
	if request.Status != "PENDING" {
		return nil, ValidationError{Fields: map[string]string{"status": "Only pending Journey extension requests can be accepted"}}
	}
	if journey.ClosedAt != nil || strings.EqualFold(strings.TrimSpace(journey.Status.Code), "FINISHED") {
		return nil, ValidationError{Fields: map[string]string{"status": "Closed Journeys cannot accept extensions"}}
	}
	now := time.Now().UTC()
	request.Status = "ACCEPTED"
	request.AcceptedBy = strings.TrimSpace(actorUserID)
	request.AcceptedAt = &now
	request.UpdatedAt = now
	journey.ExtensionDays += request.AdditionalDays
	journey.ProjectedEndDate = request.ProposedEndDate
	journey.UpdatedAt = now
	if err := s.repo.AcceptExtensionRequest(ctx, journey, request); err != nil {
		return nil, err
	}
	dto := journeyExtensionRequestDTO(*request)
	return &dto, nil
}

func (s *service) RejectExtensionRequest(ctx context.Context, id, requestID, actorCollaboratorID, actorUserID string) (*JourneyExtensionRequestDTO, error) {
	if strings.TrimSpace(actorCollaboratorID) == "" || strings.TrimSpace(actorCollaboratorID) != strings.TrimSpace(id) {
		return nil, authz.ErrForbidden
	}
	request, err := s.repo.FindExtensionRequest(ctx, strings.TrimSpace(id), strings.TrimSpace(requestID))
	if err != nil {
		return nil, err
	}
	if request.Status != "PENDING" {
		return nil, ValidationError{Fields: map[string]string{"status": "Only pending Journey extension requests can be rejected"}}
	}
	now := time.Now().UTC()
	request.Status = "REJECTED"
	request.RejectedBy = strings.TrimSpace(actorUserID)
	request.RejectedAt = &now
	request.UpdatedAt = now
	if err := s.repo.UpdateExtensionRequest(ctx, request); err != nil {
		return nil, err
	}
	dto := journeyExtensionRequestDTO(*request)
	return &dto, nil
}

func (s *service) CancelExtensionRequest(ctx context.Context, id, requestID, actorUserID string) (*JourneyExtensionRequestDTO, error) {
	request, err := s.repo.FindExtensionRequest(ctx, strings.TrimSpace(id), strings.TrimSpace(requestID))
	if err != nil {
		return nil, err
	}
	if request.Status != "PENDING" {
		return nil, ValidationError{Fields: map[string]string{"status": "Only pending Journey extension requests can be cancelled"}}
	}
	now := time.Now().UTC()
	request.Status = "CANCELLED"
	request.CancelledBy = strings.TrimSpace(actorUserID)
	request.CancelledAt = &now
	request.UpdatedAt = now
	if err := s.repo.UpdateExtensionRequest(ctx, request); err != nil {
		return nil, err
	}
	dto := journeyExtensionRequestDTO(*request)
	return &dto, nil
}

func journeyExtensionRequestDTO(row db.JourneyExtensionRequest) JourneyExtensionRequestDTO {
	return JourneyExtensionRequestDTO{ID: row.ID, CollaboratorJourneyID: row.CollaboratorJourneyID, ReceiptNumber: row.ReceiptNumber, PreviousEndDate: formatDate(row.PreviousEndDate), ProposedEndDate: formatDate(row.ProposedEndDate), AdditionalDays: row.AdditionalDays, Reason: row.Reason, Status: row.Status, RequestedBy: row.RequestedBy, RequestedAt: row.RequestedAt.Format(time.RFC3339), AcceptedBy: row.AcceptedBy, AcceptedAt: formatDateTimePtr(row.AcceptedAt), RejectedBy: row.RejectedBy, RejectedAt: formatDateTimePtr(row.RejectedAt), CancelledBy: row.CancelledBy, CancelledAt: formatDateTimePtr(row.CancelledAt)}
}

func journeyExtensionReceiptNumber(id string) string {
	clean := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(id), "-", ""))
	if len(clean) > 12 {
		clean = clean[:12]
	}
	return "JER-" + clean
}

func (s *service) GetByID(ctx context.Context, id string) (*CollaboratorDTO, error) {
	row, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*row)), nil
}

func (s *service) GetSelfByID(ctx context.Context, id string, membershipID string) (*CollaboratorDTO, error) {
	row, err := s.repo.FindByIDForMembership(ctx, strings.TrimSpace(id), strings.TrimSpace(membershipID))
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*row)), nil
}

func (s *service) GetSelfWorkCreditEvidence(ctx context.Context, id string, membershipID string) (*WorkCreditEvidenceDTO, error) {
	record, err := s.repo.LoadWorkCreditEvidence(ctx, strings.TrimSpace(id), strings.TrimSpace(membershipID))
	if err != nil {
		return nil, err
	}
	dto := ToWorkCreditEvidenceDTO(*record)
	return &dto, nil
}

func membershipCandidateToPersonDTO(membership db.PersonTenantMembership) peoplepkg.PersonDTO {
	person := membership.Person
	return peoplepkg.PersonDTO{
		ID:                      membership.PersonID,
		GlobalPersonID:          membership.PersonID,
		MembershipID:            membership.ID,
		TenantID:                membership.TenantID,
		FirstName:               person.FirstName,
		LastName:                person.LastName,
		Nickname:                person.Nickname,
		CPF:                     person.CPF,
		RG:                      person.RG,
		Cellular:                person.Cellular,
		Email:                   person.Email,
		Street1:                 person.Street1,
		Street2:                 person.Street2,
		State:                   person.State,
		City:                    person.City,
		CEP:                     person.CEP,
		Country:                 person.Country,
		BankName:                person.BankName,
		BankNumber:              person.BankNumber,
		CheckingAccount:         person.CheckingAccount,
		EmergencyName:           person.EmergencyName,
		EmergencyCellular:       person.EmergencyCellular,
		EmergencyEmail:          person.EmergencyEmail,
		ProfileCompletionStatus: person.ProfileCompletionStatus,
		CanCreateCollaborator:   person.CanCreateCollaborator,
		StatusID:                membership.StatusID,
		StatusLabel:             membership.Status.Label,
		Notes:                   membership.Notes,
		CreatedAt:               membership.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:               membership.UpdatedAt.UTC().Format(time.RFC3339),
	}
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

func (s *service) PostJourneyBonus(ctx context.Context, id string, req PostJourneyBonusRequest, actorUserID string) (*CollaboratorDTO, error) {
	row, err := s.repo.FindByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return nil, err
	}
	if row.ClosedAt != nil {
		return nil, ValidationError{Fields: map[string]string{"bonusBrlAmount": "Journey bonus can only be posted while the Journey is open"}}
	}
	if row.BonusBRLAmount == nil || *row.BonusBRLAmount <= 0 {
		return nil, ValidationError{Fields: map[string]string{"bonusBrlAmount": "Configure a Journey bonus before posting it"}}
	}
	if row.BonusPostedAt != nil || strings.TrimSpace(row.BonusLedgerEntryID) != "" {
		return nil, ValidationError{Fields: map[string]string{"bonusBrlAmount": "Journey bonus has already been posted"}}
	}
	effectiveDate, err := parseDate(req.EffectiveDate)
	if err != nil {
		return nil, ValidationError{Fields: map[string]string{"effectiveDate": "Effective date must be YYYY-MM-DD"}}
	}
	today := time.Now().UTC().Truncate(24 * time.Hour)
	if effectiveDate.Before(row.JourneyStartDate) || effectiveDate.After(today) {
		return nil, ValidationError{Fields: map[string]string{"effectiveDate": "Bonus effective date must be on or after the Journey start date and not in the future"}}
	}
	brl, err := s.repo.FindValueUnitByCode(ctx, "BRL")
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	description := strings.TrimSpace(row.BonusDescription)
	if description == "" {
		description = "Journey bonus compensation"
	}
	entry := &db.LedgerEntry{
		BaseModel: db.BaseModel{ID: "ledger-journey-bonus-" + row.ID, CreatedAt: now, UpdatedAt: now},
		TenantID:  row.TenantID, PersonID: row.Membership.PersonID, CollaboratorID: row.ID, ValueUnitID: brl.ID,
		EntryType: "EARNING_CREDIT", Direction: "CREDIT", Amount: *row.BonusBRLAmount, EffectiveDate: effectiveDate,
		SourceType: "JOURNEY_BONUS", SourceID: row.ID, Description: description, Active: true, CorrectionType: "ORIGINAL",
		AuthorizedBy: strings.TrimSpace(actorUserID), AuthorizedAt: &now,
	}
	row.UpdatedAt = now
	row.BonusPostedAt = &now
	row.BonusLedgerEntryID = entry.ID
	if err := s.repo.PostJourneyBonus(ctx, row, entry); err != nil {
		return nil, err
	}
	updated, err := s.repo.FindByID(ctx, row.ID)
	if err != nil {
		return nil, err
	}
	return ptr(ToDTO(*updated)), nil
}

func bonusConfigEqual(current, requested *float64, currentDescription, requestedDescription string) bool {
	if (current == nil) != (requested == nil) {
		return false
	}
	if current != nil && requested != nil && math.Abs(*current-*requested) > 0.000001 {
		return false
	}
	return strings.TrimSpace(currentDescription) == strings.TrimSpace(requestedDescription)
}
