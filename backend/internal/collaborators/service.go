package collaborators

import (
	"context"

	"enterpriseremotesystems/backend/internal/people"
)

type Service interface {
	List(ctx context.Context, filter CollaboratorListFilter) ([]CollaboratorDTO, int64, error)
	ListForMembership(ctx context.Context, membershipID string) ([]CollaboratorDTO, error)
	ListSelf(ctx context.Context, membershipID string) ([]CollaboratorDTO, error)
	ListCandidates(ctx context.Context) ([]people.PersonDTO, error)
	Create(ctx context.Context, req CreateCollaboratorRequest, actorUserID string) (*CollaboratorDTO, error)
	GetByID(ctx context.Context, id string) (*CollaboratorDTO, error)
	GetSelfByID(ctx context.Context, id string, membershipID string) (*CollaboratorDTO, error)
	GetSelfWorkCreditEvidence(ctx context.Context, id string, membershipID string) (*WorkCreditEvidenceDTO, error)
	Update(ctx context.Context, id string, req UpdateCollaboratorRequest, actorUserID string) (*CollaboratorDTO, error)
	UpdateWorkAssignment(ctx context.Context, id string, req UpdateCollaboratorWorkAssignmentRequest, actorUserID string) (*CollaboratorDTO, error)
	ExtendJourney(ctx context.Context, id string, req ExtendCollaboratorJourneyRequest, actorUserID string) (*JourneyExtensionRequestDTO, error)
	ListExtensionRequests(ctx context.Context, id string) ([]JourneyExtensionRequestDTO, error)
	ListSelfExtensionRequests(ctx context.Context, id, membershipID string) ([]JourneyExtensionRequestDTO, error)
	AcceptExtensionRequest(ctx context.Context, id, requestID, actorCollaboratorID, actorUserID string) (*JourneyExtensionRequestDTO, error)
	RejectExtensionRequest(ctx context.Context, id, requestID, actorCollaboratorID, actorUserID string) (*JourneyExtensionRequestDTO, error)
	CancelExtensionRequest(ctx context.Context, id, requestID, actorUserID string) (*JourneyExtensionRequestDTO, error)
	PostJourneyBonus(ctx context.Context, id string, req PostJourneyBonusRequest, actorUserID string) (*CollaboratorDTO, error)
}
