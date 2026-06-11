package authz

import (
	"errors"
	"sort"
	"strings"
)

const (
	// HeaderAuthorizedBy is the temporary legacy actor header used by existing
	// financial operation endpoints. New endpoint wiring should use ExtractActor
	// so this compatibility path stays centralized while authenticated actors are
	// introduced in future bites.
	HeaderAuthorizedBy = "X-Authorized-By"

	// HeaderActorID is the forward-compatible actor identity header. It is a
	// temporary transport shape until ERS has authenticated users/sessions.
	HeaderActorID = "X-Actor-ID"

	// HeaderActorPermissions is a comma-separated temporary permissions header.
	// It lets backend tests and transitional clients exercise authorization
	// decisions before tenant-scoped roles are backed by persisted users.
	HeaderActorPermissions = "X-Actor-Permissions"

	// HeaderTenantID is the forward-compatible tenant scope header for an actor.
	HeaderTenantID = "X-Tenant-ID"
)

type Permission string

const (
	PermissionLedgerReceiptsPrint    Permission = "ledger.receipts.print"
	PermissionLedgerReceiptsReturn   Permission = "ledger.receipts.return"
	PermissionLedgerReceiptsBackfill Permission = "ledger.receipts.backfill"

	PermissionLedgerCorrectionsCreate         Permission = "ledger.corrections.create"
	PermissionJourneySettlementsPreview       Permission = "journey.settlements.preview"
	PermissionJourneySettlementsZeroGold      Permission = "journey.settlements.zero_gold"
	PermissionJourneySettlementsPartialPayout Permission = "journey.settlements.partial_payout"
	PermissionJourneySettlementsClose         Permission = "journey.settlements.close"
)

type ActorSource string

const (
	ActorSourceHeaderAuthorizedBy ActorSource = "x_authorized_by"
	ActorSourceHeaderActorID      ActorSource = "x_actor_id"
)

type Actor struct {
	ID          string
	TenantID    string
	Source      ActorSource
	Permissions map[Permission]struct{}
}

var (
	ErrMissingActor = errors.New("authorization actor is required")
	ErrForbidden    = errors.New("actor is not permitted")
)

type HeaderGetter func(name string) string

func ExtractActor(get HeaderGetter) (*Actor, error) {
	if get == nil {
		return nil, ErrMissingActor
	}

	id := strings.TrimSpace(get(HeaderActorID))
	source := ActorSourceHeaderActorID
	if id == "" {
		id = strings.TrimSpace(get(HeaderAuthorizedBy))
		source = ActorSourceHeaderAuthorizedBy
	}
	if id == "" {
		return nil, ErrMissingActor
	}

	return &Actor{
		ID:          id,
		TenantID:    strings.TrimSpace(get(HeaderTenantID)),
		Source:      source,
		Permissions: ParsePermissions(get(HeaderActorPermissions)),
	}, nil
}

func ParsePermissions(raw string) map[Permission]struct{} {
	permissions := make(map[Permission]struct{})
	for _, part := range strings.Split(raw, ",") {
		permission := Permission(strings.TrimSpace(part))
		if permission == "" {
			continue
		}
		permissions[permission] = struct{}{}
	}
	return permissions
}

func (a *Actor) HasPermission(permission Permission) bool {
	if a == nil || strings.TrimSpace(a.ID) == "" || permission == "" {
		return false
	}
	_, ok := a.Permissions[permission]
	return ok
}

type RequireOption func(*requireOptions)

type requireOptions struct {
	allowLegacyAuthorizedBy bool
}

// WithLegacyAuthorizedByCompatibility permits a legacy X-Authorized-By actor
// to satisfy a permission requirement while ERS transitions from operation
// headers to authenticated tenant-scoped roles. New authorization call sites
// should opt in only when preserving an existing endpoint's compatibility is
// explicitly part of the bite scope.
func WithLegacyAuthorizedByCompatibility() RequireOption {
	return func(opts *requireOptions) {
		opts.allowLegacyAuthorizedBy = true
	}
}

func RequirePermission(actor *Actor, permission Permission, opts ...RequireOption) error {
	if actor == nil || strings.TrimSpace(actor.ID) == "" {
		return ErrMissingActor
	}

	options := requireOptions{}
	for _, opt := range opts {
		if opt != nil {
			opt(&options)
		}
	}

	if actor.HasPermission(permission) {
		return nil
	}
	if options.allowLegacyAuthorizedBy && actor.Source == ActorSourceHeaderAuthorizedBy {
		return nil
	}
	return ErrForbidden
}

func PermissionNames(permissions map[Permission]struct{}) []string {
	names := make([]string, 0, len(permissions))
	for permission := range permissions {
		names = append(names, string(permission))
	}
	sort.Strings(names)
	return names
}
