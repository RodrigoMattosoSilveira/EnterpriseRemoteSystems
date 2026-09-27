package collaborators

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"gorm.io/gorm"
)

func TestGetSelfWorkCreditEvidenceProjectsCanonicalJourneyEvidenceAndEnforcesMembership(t *testing.T) {
	database, err := db.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	if err := db.SeedReferenceData(database); err != nil {
		t.Fatalf("seed reference data: %v", err)
	}

	now := time.Date(2026, 6, 10, 12, 0, 0, 0, time.UTC)
	workDate := time.Date(2026, 6, 10, 0, 0, 0, 0, time.UTC)
	person := db.GlobalPerson{
		BaseModel:               db.BaseModel{ID: "person-a", CreatedAt: now, UpdatedAt: now},
		FirstName:               "Ana",
		LastName:                "Silva",
		Nickname:                "Ana",
		CPF:                     "39053344705",
		RG:                      "RG-100001",
		Cellular:                "11998765432",
		Email:                   "ana@example.test",
		Country:                 "Brasil",
		ProfileCompletionStatus: "COMPLETE",
		CanCreateCollaborator:   true,
	}
	otherPerson := person
	otherPerson.ID = "person-b"
	otherPerson.CPF = "93541134780"
	otherPerson.RG = "RG-100002"
	otherPerson.Cellular = "21998765432"
	otherPerson.Email = "bia@example.test"
	otherPerson.FirstName = "Bia"
	otherPerson.Nickname = "Bia"
	mustCreateEvidenceRow(t, database, &person)
	mustCreateEvidenceRow(t, database, &otherPerson)

	membership := db.PersonTenantMembership{
		BaseModel: db.BaseModel{ID: "membership-a", CreatedAt: now, UpdatedAt: now},
		TenantID:  db.DefaultTenantID,
		PersonID:  person.ID,
		StatusID:  "ref-person-status-active",
	}
	otherMembership := db.PersonTenantMembership{
		BaseModel: db.BaseModel{ID: "membership-b", CreatedAt: now, UpdatedAt: now},
		TenantID:  db.DefaultTenantID,
		PersonID:  otherPerson.ID,
		StatusID:  "ref-person-status-active",
	}
	mustCreateEvidenceRow(t, database, &membership)
	mustCreateEvidenceRow(t, database, &otherMembership)
	otherTenant := db.Tenant{
		BaseModel: db.BaseModel{ID: "tenant-b", CreatedAt: now, UpdatedAt: now},
		Code:      "TENANT_B",
		Name:      "Tenant B",
		Active:    true,
	}
	mustCreateEvidenceRow(t, database, &otherTenant)

	membershipID := membership.ID
	commissionPercent := 5.0
	goldAmount := 4.0
	closedAt := now.Add(24 * time.Hour)
	journey := db.CollaboratorJourney{
		BaseModel:             db.BaseModel{ID: "journey-a", CreatedAt: now, UpdatedAt: now},
		TenantID:              db.DefaultTenantID,
		MembershipID:          &membershipID,
		JourneyStartDate:      workDate.AddDate(0, 0, -30),
		DefaultEndDate:        workDate.AddDate(0, 0, 60),
		ProjectedEndDate:      workDate.AddDate(0, 0, 60),
		PaymentMethodID:       "ref-method-commission",
		PaymentValue:          commissionPercent,
		GoldCommissionPercent: &commissionPercent,
		PlanningAvailability:  "ACTIVE",
		SectorID:              "ref-sector-mining",
		LocationID:            "ref-location-main-mine",
		TaskID:                "ref-task-miner",
		StatusID:              "ref-collaborator-status-finished",
		ClosedAt:              &closedAt,
	}
	mustCreateEvidenceRow(t, database, &journey)
	dailyAmount := 350.0
	dailyJourney := journey
	dailyJourney.ID = "journey-daily"
	dailyJourney.PaymentMethodID = "ref-method-daily"
	dailyJourney.PaymentValue = dailyAmount
	dailyJourney.GoldCommissionPercent = nil
	dailyJourney.DailyBRLAmount = &dailyAmount
	mustCreateEvidenceRow(t, database, &dailyJourney)
	otherTenantJourney := journey
	otherTenantJourney.ID = "journey-other-tenant"
	otherTenantJourney.TenantID = otherTenant.ID
	mustCreateEvidenceRow(t, database, &otherTenantJourney)

	period := db.WorkPeriod{
		BaseModel:  db.BaseModel{ID: "work-period-a", CreatedAt: now, UpdatedAt: now},
		TenantID:   db.DefaultTenantID,
		WorkDate:   workDate,
		PeriodCode: "DAY",
		Name:       "Day shift",
		StartsAt:   workDate.Add(6 * time.Hour),
		EndsAt:     workDate.Add(18 * time.Hour),
		Status:     "FULLY_POSTED",
	}
	mustCreateEvidenceRow(t, database, &period)
	planningPeriod := db.WorkPeriod{
		BaseModel:  db.BaseModel{ID: "work-period-planning", CreatedAt: now, UpdatedAt: now},
		TenantID:   db.DefaultTenantID,
		WorkDate:   workDate.AddDate(0, 0, 7),
		PeriodCode: "DAY",
		Name:       "Future day shift",
		StartsAt:   workDate.AddDate(0, 0, 7).Add(6 * time.Hour),
		EndsAt:     workDate.AddDate(0, 0, 7).Add(18 * time.Hour),
		Status:     "PLANNING",
	}
	mustCreateEvidenceRow(t, database, &planningPeriod)

	actualStatus := "WORKED"
	assignment := db.WorkPeriodAssignment{
		BaseModel:            db.BaseModel{ID: "assignment-a", CreatedAt: now, UpdatedAt: now},
		TenantID:             db.DefaultTenantID,
		WorkPeriodID:         period.ID,
		CollaboratorID:       journey.ID,
		PlannedStatus:        "INCLUDED",
		PlanningAvailability: "ACTIVE",
		ActualStatus:         &actualStatus,
		SectorID:             "ref-sector-mining",
		LocationID:           "ref-location-main-mine",
		TaskID:               "ref-task-miner",
		Active:               true,
	}
	mustCreateEvidenceRow(t, database, &assignment)
	plannedAssignment := assignment
	plannedAssignment.ID = "assignment-planned"
	plannedAssignment.WorkPeriodID = planningPeriod.ID
	plannedAssignment.ActualStatus = nil
	mustCreateEvidenceRow(t, database, &plannedAssignment)
	dailyAssignment := assignment
	dailyAssignment.ID = "assignment-daily"
	dailyAssignment.CollaboratorID = dailyJourney.ID
	mustCreateEvidenceRow(t, database, &dailyAssignment)

	production := db.GoldProductionEntry{
		BaseModel:         db.BaseModel{ID: "production-a", CreatedAt: now, UpdatedAt: now},
		TenantID:          db.DefaultTenantID,
		WorkPeriodID:      period.ID,
		LocationID:        assignment.LocationID,
		ProductionDate:    workDate,
		GoldGramsProduced: 80,
		Active:            true,
	}
	mustCreateEvidenceRow(t, database, &production)

	run := db.AccrualRun{
		BaseModel:    db.BaseModel{ID: "accrual-run-a", CreatedAt: now, UpdatedAt: now},
		TenantID:     db.DefaultTenantID,
		WorkPeriodID: period.ID,
		Status:       "POSTED",
		AccrualDate:  workDate,
		Notes:        "Posted commission earnings",
	}
	mustCreateEvidenceRow(t, database, &run)
	assignmentID := assignment.ID
	accrual := db.AccrualItem{
		BaseModel:              db.BaseModel{ID: "accrual-item-a", CreatedAt: now, UpdatedAt: now},
		TenantID:               db.DefaultTenantID,
		PersonID:               person.ID,
		AccrualRunID:           run.ID,
		WorkPeriodID:           period.ID,
		WorkPeriodAssignmentID: &assignmentID,
		CollaboratorID:         journey.ID,
		CalculationType:        "GOLD_COMMISSION",
		Direction:              "CREDIT",
		GoldGramAmount:         &goldAmount,
		Status:                 "POSTED",
		Description:            "Commission earning",
	}
	mustCreateEvidenceRow(t, database, &accrual)

	credit := db.LedgerEntry{
		BaseModel:      db.BaseModel{ID: "ledger-credit-a", CreatedAt: now, UpdatedAt: now},
		TenantID:       db.DefaultTenantID,
		PersonID:       person.ID,
		CollaboratorID: journey.ID,
		ValueUnitID:    "ref-value-unit-gold-gram",
		EntryType:      "EARNING_CREDIT",
		Direction:      "CREDIT",
		Amount:         goldAmount,
		EffectiveDate:  workDate,
		SourceType:     "WORK_PERIOD_ASSIGNMENT",
		SourceID:       assignment.ID,
		Description:    "Commission earning",
		Active:         true,
		CorrectionType: "ORIGINAL",
	}
	mustCreateEvidenceRow(t, database, &credit)

	debit := db.LedgerEntry{
		BaseModel:      db.BaseModel{ID: "ledger-debit-a", CreatedAt: now.Add(time.Minute), UpdatedAt: now.Add(time.Minute)},
		TenantID:       db.DefaultTenantID,
		PersonID:       person.ID,
		CollaboratorID: journey.ID,
		ValueUnitID:    "ref-value-unit-brl",
		EntryType:      "EXPENSE_DEDUCTION",
		Direction:      "DEBIT",
		Amount:         75,
		EffectiveDate:  workDate,
		SourceType:     "EXPENSE",
		SourceID:       "expense-a",
		Description:    "Canteen expense",
		Active:         true,
		CorrectionType: "ORIGINAL",
	}
	mustCreateEvidenceRow(t, database, &debit)

	creditID := credit.ID
	reversal := db.LedgerEntry{
		BaseModel:            db.BaseModel{ID: "ledger-reversal-a", CreatedAt: now.Add(2 * time.Minute), UpdatedAt: now.Add(2 * time.Minute)},
		TenantID:             db.DefaultTenantID,
		PersonID:             person.ID,
		CollaboratorID:       journey.ID,
		ValueUnitID:          "ref-value-unit-gold-gram",
		EntryType:            "EARNING_CREDIT",
		Direction:            "DEBIT",
		Amount:               goldAmount,
		EffectiveDate:        workDate.AddDate(0, 0, 1),
		SourceType:           "LEDGER_CORRECTION",
		SourceID:             "correction-a",
		Description:          "Reverse incorrect earning",
		Active:               true,
		CorrectionType:       "REVERSAL",
		RelatedEntryID:       &creditID,
		CorrectionReasonCode: "INCORRECT_AMOUNT",
		CorrectionReasonText: "Incorrect earning amount",
	}
	mustCreateEvidenceRow(t, database, &reversal)

	ctx := tenantctx.WithTenantID(context.Background(), db.DefaultTenantID)
	svc := NewService(NewRepository(database))
	evidence, err := svc.GetSelfWorkCreditEvidence(ctx, journey.ID, membership.ID)
	if err != nil {
		t.Fatalf("get work and credit evidence: %v", err)
	}
	if evidence.Journey.ID != journey.ID || evidence.Journey.MembershipID != membership.ID {
		t.Fatalf("unexpected Journey evidence identity: %+v", evidence.Journey)
	}
	if len(evidence.WorkRecognized) != 1 {
		t.Fatalf("expected one work record, got %+v", evidence.WorkRecognized)
	}
	if evidence.WorkRecognized[0].ActualStatus != "WORKED" || evidence.WorkRecognized[0].GoldGramsProduced != 80 {
		t.Fatalf("unexpected work evidence: %+v", evidence.WorkRecognized[0])
	}
	if len(evidence.EarningsCalculated) != 1 || evidence.EarningsCalculated[0].GoldGramAmount == nil || *evidence.EarningsCalculated[0].GoldGramAmount != 4 {
		t.Fatalf("unexpected accrual evidence: %+v", evidence.EarningsCalculated)
	}
	if len(evidence.AccountPostings) != 3 {
		t.Fatalf("expected credit, debit, and correction postings, got %+v", evidence.AccountPostings)
	}
	var foundCredit, foundDebitReceipt, foundCorrection bool
	for _, posting := range evidence.AccountPostings {
		if posting.ID == credit.ID && posting.SignedAmount == 4 && posting.SourceID == assignment.ID {
			foundCredit = true
		}
		if posting.ID == debit.ID && posting.SignedAmount == -75 && posting.Receipt != nil {
			foundDebitReceipt = true
		}
		if posting.ID == reversal.ID && posting.CorrectionType == "REVERSAL" && posting.RelatedEntryID == credit.ID && posting.CorrectionReasonText == "Incorrect earning amount" {
			foundCorrection = true
		}
	}
	if !foundCredit || !foundDebitReceipt || !foundCorrection {
		t.Fatalf("expected credit provenance, debit receipt, and correction evidence, got %+v", evidence.AccountPostings)
	}

	dailyEvidence, err := svc.GetSelfWorkCreditEvidence(ctx, dailyJourney.ID, membership.ID)
	if err != nil {
		t.Fatalf("get daily-wage work and credit evidence: %v", err)
	}
	if len(dailyEvidence.WorkRecognized) != 1 {
		t.Fatalf("expected daily-wage work evidence, got %+v", dailyEvidence.WorkRecognized)
	}
	if dailyEvidence.WorkRecognized[0].ProductionEntries != 0 || dailyEvidence.WorkRecognized[0].GoldGramsProduced != 0 {
		t.Fatalf("daily-wage Journey must not present unrelated site production as a compensation input: %+v", dailyEvidence.WorkRecognized[0])
	}

	_, err = svc.GetSelfWorkCreditEvidence(ctx, journey.ID, otherMembership.ID)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("different Membership must not read Journey evidence, got %v", err)
	}
	_, err = svc.GetSelfWorkCreditEvidence(ctx, otherTenantJourney.ID, membership.ID)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("same Membership identifier must not cross the request Tenant boundary, got %v", err)
	}
}

func mustCreateEvidenceRow(t *testing.T, database *gorm.DB, value any) {
	t.Helper()
	if err := database.Create(value).Error; err != nil {
		t.Fatalf("create evidence fixture %T: %v", value, err)
	}
}
