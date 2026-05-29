package routes

import (
	"enterpriseremotesystems/backend/internal/collaborators"
	"enterpriseremotesystems/backend/internal/people"
	"enterpriseremotesystems/backend/internal/referencedata"
	"gorm.io/gorm"
)

type Dependencies struct {
	DB                   *gorm.DB
	PeopleHandler        *people.Handler
	CollaboratorHandler  *collaborators.Handler
	ReferenceDataHandler *referencedata.Handler
}
