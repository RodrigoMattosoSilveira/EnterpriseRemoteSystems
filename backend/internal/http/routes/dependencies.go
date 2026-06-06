package routes

import (
	"enterpriseremotesystems/backend/internal/collaborators"
	"enterpriseremotesystems/backend/internal/currentaccounts"
	"enterpriseremotesystems/backend/internal/expenses"
	"enterpriseremotesystems/backend/internal/people"
	"enterpriseremotesystems/backend/internal/referencedata"
	"enterpriseremotesystems/backend/internal/tenants"
	"enterpriseremotesystems/backend/internal/workperiods"
	"gorm.io/gorm"
)

type Dependencies struct {
	DB                    *gorm.DB
	PeopleHandler         *people.Handler
	CollaboratorHandler   *collaborators.Handler
	ExpenseHandler        *expenses.Handler
	CurrentAccountHandler *currentaccounts.Handler
	WorkPeriodHandler     *workperiods.Handler
	ReferenceDataHandler  *referencedata.Handler
	TenantHandler         *tenants.Handler
}
