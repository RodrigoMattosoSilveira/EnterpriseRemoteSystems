package routes

import (
	"gorm.io/gorm"
	"enterpriseremotesystems/backend/internal/people"
	"enterpriseremotesystems/backend/internal/referencedata"
)

type Dependencies struct {
	DB                   *gorm.DB
	PeopleHandler        *people.Handler
	ReferenceDataHandler *referencedata.Handler
}
