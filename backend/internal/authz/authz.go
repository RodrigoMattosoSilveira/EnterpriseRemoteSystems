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
	PermissionAll Permission = "*"

	PermissionAuthzRead   Permission = "authz.read"
	PermissionAuthzManage Permission = "authz.manage"

	PermissionTenantsRead   Permission = "tenants.read"
	PermissionTenantsCreate Permission = "tenants.create"
	PermissionTenantsUpdate Permission = "tenants.update"

	PermissionPeopleRead       Permission = "people.read"
	PermissionPeopleCreate     Permission = "people.create"
	PermissionPeopleUpdate     Permission = "people.update"
	PermissionPeopleSelfRead   Permission = "people.self.read"
	PermissionPeopleSelfUpdate Permission = "people.self.update"

	PermissionCollaboratorsRead     Permission = "collaborators.read"
	PermissionCollaboratorsCreate   Permission = "collaborators.create"
	PermissionCollaboratorsUpdate   Permission = "collaborators.update"
	PermissionCollaboratorsSelfRead Permission = "collaborators.self.read"

	PermissionPlanningRead   Permission = "planning.read"
	PermissionPlanningCreate Permission = "planning.create"
	PermissionPlanningUpdate Permission = "planning.update"

	PermissionEarningsRead   Permission = "earnings.read"
	PermissionEarningsCreate Permission = "earnings.create"
	PermissionEarningsUpdate Permission = "earnings.update"

	PermissionPriceListsRead   Permission = "price_lists.read"
	PermissionPriceListsCreate Permission = "price_lists.create"
	PermissionPriceListsUpdate Permission = "price_lists.update"

	PermissionExpensesRead   Permission = "expenses.read"
	PermissionExpensesCreate Permission = "expenses.create"
	PermissionExpensesUpdate Permission = "expenses.update"

	PermissionCurrentAccountsSummaryRead     Permission = "current_accounts.summary.read"
	PermissionCurrentAccountsLedgerRead      Permission = "current_accounts.ledger.read"
	PermissionCurrentAccountsLedgerCreate    Permission = "current_accounts.ledger.create"
	PermissionCurrentAccountsSettingsRead    Permission = "current_accounts.settings.read"
	PermissionCurrentAccountsSettingsUpdate  Permission = "current_accounts.settings.update"
	PermissionCurrentAccountsSelfSummaryRead Permission = "current_accounts.self.summary.read"
	PermissionCurrentAccountsSelfLedgerRead  Permission = "current_accounts.self.ledger.read"

	PermissionAssignmentsSelfCurrentRead Permission = "assignments.self.current.read"

	PermissionLedgerReceiptsRead     Permission = "ledger.receipts.read"
	PermissionLedgerReceiptsCreate   Permission = "ledger.receipts.create"
	PermissionLedgerReceiptsPrint    Permission = "ledger.receipts.print"
	PermissionLedgerReceiptsReturn   Permission = "ledger.receipts.return"
	PermissionLedgerReceiptsBackfill Permission = "ledger.receipts.backfill"
	PermissionLedgerReceiptsSelfRead Permission = "ledger.receipts.self.read"

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
	ActorSourcePersisted          ActorSource = "persisted"
)

type ActorScope string

const (
	ActorScopeLegacy      ActorScope = "LEGACY"
	ActorScopeApplication ActorScope = "APPLICATION"
	ActorScopeTenant      ActorScope = "TENANT"
	ActorScopeSelf        ActorScope = "SELF"
)

type Actor struct {
	// ID is the stable external actor key used by the request/authentication layer.
	ID string
	// RecordID is the persisted authz_actors primary key when the actor was loaded
	// from the authorization store.
	RecordID       string
	TenantID       string
	PersonID       string
	CollaboratorID string
	Source         ActorSource
	Scope          ActorScope
	RoleCodes      []string
	Permissions    map[Permission]struct{}
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

	actor := &Actor{
		ID:          id,
		TenantID:    strings.TrimSpace(get(HeaderTenantID)),
		Source:      source,
		Permissions: ParsePermissions(get(HeaderActorPermissions)),
	}
	if source == ActorSourceHeaderAuthorizedBy {
		actor.Scope = ActorScopeLegacy
	}
	return actor, nil
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
	if _, ok := a.Permissions[PermissionAll]; ok {
		return true
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

func RequireTenantScope(actor *Actor, tenantID string) error {
	if actor == nil || strings.TrimSpace(actor.ID) == "" {
		return ErrMissingActor
	}
	if strings.TrimSpace(tenantID) == "" {
		return ErrForbidden
	}
	if actor.Scope == ActorScopeApplication {
		return nil
	}
	if strings.TrimSpace(actor.TenantID) == strings.TrimSpace(tenantID) {
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
