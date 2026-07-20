package routes

import (
	"enterpriseremotesystems/backend/internal/accruals"
	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/collaborators"
	"enterpriseremotesystems/backend/internal/currentaccounts"
	"enterpriseremotesystems/backend/internal/expenses"
	"enterpriseremotesystems/backend/internal/goldproduction"
	"enterpriseremotesystems/backend/internal/people"
	"enterpriseremotesystems/backend/internal/pricelists"
	"enterpriseremotesystems/backend/internal/referencedata"
	"enterpriseremotesystems/backend/internal/tenants"
	"enterpriseremotesystems/backend/internal/workperiodassignments"
	"enterpriseremotesystems/backend/internal/workperiods"
	"gorm.io/gorm"
)

type Dependencies struct {
	DB                          *gorm.DB
	DisableRouteAuthorization   bool
	AuthzHandler                *authz.Handler
	ActorStore                  authz.ActorStore
	PeopleHandler               *people.Handler
	CollaboratorHandler         *collaborators.Handler
	ExpenseHandler              *expenses.Handler
	PriceListHandler            *pricelists.Handler
	CurrentAccountHandler       *currentaccounts.Handler
	WorkPeriodHandler           *workperiods.Handler
	WorkPeriodAssignmentHandler *workperiodassignments.Handler
	GoldProductionHandler       *goldproduction.Handler
	AccrualHandler              *accruals.Handler
	ReferenceDataHandler        *referencedata.Handler
	TenantHandler               *tenants.Handler
	TenantService               tenants.Service
}
