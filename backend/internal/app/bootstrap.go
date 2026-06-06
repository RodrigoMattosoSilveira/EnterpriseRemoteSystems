package app

import (
	"log"

	"enterpriseremotesystems/backend/internal/collaborators"
	"enterpriseremotesystems/backend/internal/currentaccounts"
	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/expenses"
	httpserver "enterpriseremotesystems/backend/internal/http"
	"enterpriseremotesystems/backend/internal/http/routes"
	"enterpriseremotesystems/backend/internal/people"
	"enterpriseremotesystems/backend/internal/referencedata"
	"enterpriseremotesystems/backend/internal/tenants"
	"enterpriseremotesystems/backend/internal/workperiodassignments"
	"enterpriseremotesystems/backend/internal/workperiods"
	"github.com/gofiber/fiber/v3"
)

func Bootstrap(cfg Config) (*fiber.App, func(), error) {
	database, err := db.Open(cfg.DBPath)
	if err != nil {
		return nil, nil, err
	}
	if cfg.AutoMigrate || (cfg.Env == "test" && !cfg.AutoMigrateConfigured) {
		if err := db.AutoMigrate(database); err != nil {
			return nil, nil, err
		}
	}
	if err := db.SeedReferenceData(database); err != nil {
		return nil, nil, err
	}

	tenantRepo := tenants.NewRepository(database)
	tenantSvc := tenants.NewService(tenantRepo)
	tenantHandler := tenants.NewHandler(tenantSvc)

	refRepo := referencedata.NewGormRepository(database)
	refSvc := referencedata.NewService(refRepo)
	refHandler := referencedata.NewHandler(refSvc)

	peopleRepo := people.NewRepository(database)
	peopleSvc := people.NewService(peopleRepo)
	peopleHandler := people.NewHandler(peopleSvc)

	collaboratorRepo := collaborators.NewRepository(database)
	collaboratorSvc := collaborators.NewService(collaboratorRepo)
	collaboratorHandler := collaborators.NewHandler(collaboratorSvc)

	expenseRepo := expenses.NewRepository(database)
	expenseSvc := expenses.NewService(expenseRepo)
	expenseHandler := expenses.NewHandler(expenseSvc)

	currentAccountRepo := currentaccounts.NewRepository(database)
	currentAccountSvc := currentaccounts.NewService(currentAccountRepo)
	currentAccountHandler := currentaccounts.NewHandler(currentAccountSvc)

	workPeriodRepo := workperiods.NewRepository(database)
	workPeriodSvc := workperiods.NewService(workPeriodRepo)
	workPeriodHandler := workperiods.NewHandler(workPeriodSvc)

	workPeriodAssignmentRepo := workperiodassignments.NewRepository(database)
	workPeriodAssignmentSvc := workperiodassignments.NewService(workPeriodAssignmentRepo)
	workPeriodAssignmentHandler := workperiodassignments.NewHandler(workPeriodAssignmentSvc)

	deps := routes.Dependencies{
		DB:                          database,
		PeopleHandler:               peopleHandler,
		CollaboratorHandler:         collaboratorHandler,
		ExpenseHandler:              expenseHandler,
		CurrentAccountHandler:       currentAccountHandler,
		WorkPeriodHandler:           workPeriodHandler,
		WorkPeriodAssignmentHandler: workPeriodAssignmentHandler,
		ReferenceDataHandler:        refHandler,
		TenantHandler:               tenantHandler,
	}

	server := httpserver.NewServer(deps)
	cleanup := func() {
		sqlDB, err := database.DB()
		if err != nil {
			log.Printf("failed to access database handle during cleanup: %v", err)
			return
		}
		if err := sqlDB.Close(); err != nil {
			log.Printf("failed to close database: %v", err)
		}
	}
	return server, cleanup, nil
}
