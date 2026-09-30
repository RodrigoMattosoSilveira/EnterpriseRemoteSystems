package collaborators

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
)

type Repository interface {
	List(ctx context.Context, filter CollaboratorListFilter) ([]db.CollaboratorJourney, int64, error)
	ListForMembership(ctx context.Context, membershipID string) ([]db.CollaboratorJourney, error)
	ListCandidateMemberships(ctx context.Context) ([]db.PersonTenantMembership, error)
	Create(ctx context.Context, collaborator *db.CollaboratorJourney) error
	Update(ctx context.Context, collaborator *db.CollaboratorJourney) error
	UpdateWorkAssignment(ctx context.Context, collaborator *db.CollaboratorJourney) error
	UpdateExtension(ctx context.Context, collaborator *db.CollaboratorJourney) error
	CreateExtensionRequest(ctx context.Context, request *db.JourneyExtensionRequest) error
	ListExtensionRequests(ctx context.Context, collaboratorID string) ([]db.JourneyExtensionRequest, error)
	FindExtensionRequest(ctx context.Context, collaboratorID, requestID string) (*db.JourneyExtensionRequest, error)
	AcceptExtensionRequest(ctx context.Context, collaborator *db.CollaboratorJourney, request *db.JourneyExtensionRequest) error
	UpdateExtensionRequest(ctx context.Context, request *db.JourneyExtensionRequest) error
	CreateJourneyBonusAward(ctx context.Context, award *db.JourneyBonusAward) error
	ListJourneyBonusAwards(ctx context.Context, collaboratorID string) ([]db.JourneyBonusAward, error)
	FindJourneyBonusAward(ctx context.Context, collaboratorID, awardID string) (*db.JourneyBonusAward, error)
	ApproveJourneyBonusAward(ctx context.Context, award *db.JourneyBonusAward, entry *db.LedgerEntry) error
	FindValueUnitByCode(ctx context.Context, code string) (*db.ReferenceData, error)
	FindByID(ctx context.Context, id string) (*db.CollaboratorJourney, error)
	FindByIDForMembership(ctx context.Context, id string, membershipID string) (*db.CollaboratorJourney, error)
	FindActiveMembershipByID(ctx context.Context, membershipID string) (*db.PersonTenantMembership, error)
	FindActiveReference(ctx context.Context, id string, typ string) (*db.ReferenceData, error)
	ExistsActiveReference(ctx context.Context, id string, typ string) (bool, error)
	ExistsOpenJourneyForMembership(ctx context.Context, membershipID string) (bool, error)
	LoadWorkCreditEvidence(ctx context.Context, journeyID string, membershipID string) (*WorkCreditEvidenceRecord, error)
}

type WorkCreditEvidenceRecord struct {
	Journey            db.CollaboratorJourney
	WorkRecognized     []WorkCreditWorkRow
	EarningsCalculated []WorkCreditAccrualRow
	AccountPostings    []db.LedgerEntry
}

type WorkCreditWorkRow struct {
	AssignmentID      string
	WorkPeriodID      string
	WorkDate          string
	PeriodCode        string
	WorkPeriodName    string
	WorkPeriodStatus  string
	PlannedStatus     string
	ActualStatus      string
	SectorID          string
	SectorLabel       string
	LocationID        string
	LocationLabel     string
	TaskID            string
	TaskLabel         string
	ProductionEntries int64
	GoldGramsProduced float64
}

type WorkCreditAccrualRow struct {
	ID                     string
	AccrualRunID           string
	AccrualRunStatus       string
	AccrualDate            string
	WorkPeriodID           string
	WorkDate               string
	WorkPeriodAssignmentID string
	CalculationType        string
	Direction              string
	BRLAmount              *float64
	GoldGramAmount         *float64
	Status                 string
	PendingReason          string
	Description            string
}
