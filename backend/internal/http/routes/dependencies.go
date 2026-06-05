package routes

import (
	"enterpriseremotesystems/backend/internal/collaborators"
	"enterpriseremotesystems/backend/internal/expenses"
	"enterpriseremotesystems/backend/internal/people"
	"enterpriseremotesystems/backend/internal/referencedata"
	"enterpriseremotesystems/backend/internal/tenants"
	"gorm.io/gorm"
)

type Dependencies struct {
	DB                   *gorm.DB
	PeopleHandler        *people.Handler
	CollaboratorHandler  *collaborators.Handler
	ExpenseHandler       *expenses.Handler
	ReferenceDataHandler *referencedata.Handler
	TenantHandler        *tenants.Handler
}
