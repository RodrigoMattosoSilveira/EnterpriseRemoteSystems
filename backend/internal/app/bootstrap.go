package app

import (
	"context"
	"log"

	"enterpriseremotesystems/backend/internal/accruals"
	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/collaborators"
	"enterpriseremotesystems/backend/internal/currentaccounts"
	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/expenses"
	"enterpriseremotesystems/backend/internal/goldproduction"
	httpserver "enterpriseremotesystems/backend/internal/http"
	"enterpriseremotesystems/backend/internal/http/routes"
	"enterpriseremotesystems/backend/internal/people"
	"enterpriseremotesystems/backend/internal/pricelists"
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
	if cfg.AutoMigrate || (cfg.Env == "test" && !cfg.AutoMigrateConfigured) {
		if err := authz.AutoMigrate(database); err != nil {
			return nil, nil, err
		}
	}
	if cfg.AutoMigrate || (cfg.Env == "test" && !cfg.AutoMigrateConfigured) {
		if err := authentication.AutoMigrate(database); err != nil {
			return nil, nil, err
		}
	}
	if err := authz.SeedAuthorizationCatalog(database); err != nil {
		return nil, nil, err
	}
	bootstrapResult, err := authz.EnsureBootstrapActor(context.Background(), database, authz.BootstrapConfig{
		Enabled:                cfg.AuthzBootstrapEnabled,
		ActorKey:               cfg.AuthzBootstrapActorKey,
		DisplayName:            cfg.AuthzBootstrapDisplayName,
		RoleCode:               authz.RoleCode(cfg.AuthzBootstrapRoleCode),
		TenantID:               cfg.AuthzBootstrapTenantID,
		RequireEmptyActorTable: cfg.AuthzBootstrapRequireEmptyActors,
	})
	if err != nil {
		return nil, nil, err
	}
	if bootstrapResult.Enabled {
		log.Printf("authorization bootstrap ensured actor_key=%s role=%s tenant=%s actor_created=%t grant_created=%t", bootstrapResult.ActorKey, bootstrapResult.RoleCode, bootstrapResult.TenantID, bootstrapResult.ActorCreated, bootstrapResult.GrantCreated)
	}

	actorStore := authz.NewGORMStore(database)

	authenticationRepo := authentication.NewRepository(database)
	authenticationSvc := authentication.NewService(authenticationRepo, authentication.ServiceConfig{
		SessionTTL:       cfg.AuthSessionTTL,
		PasswordResetTTL: cfg.AuthPasswordResetTTL,
		PasswordHashCost: cfg.AuthPasswordHashCost,
	})
	authenticationHandler := authentication.NewHandler(authenticationSvc, authentication.CookieConfig{
		Name:     cfg.AuthSessionCookieName,
		Secure:   cfg.AuthSessionCookieSecure,
		SameSite: cfg.AuthSessionCookieSameSite,
		TTL:      cfg.AuthSessionTTL,
	}, actorStore, actorStore)

	tenantRepo := tenants.NewRepository(database)
	tenantSvc := tenants.NewService(tenantRepo)
	tenantHandler := tenants.NewHandler(tenantSvc, actorStore, actorStore)

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

	priceListRepo := pricelists.NewRepository(database)
	priceListSvc := pricelists.NewService(priceListRepo)
	priceListHandler := pricelists.NewHandler(priceListSvc)

	currentAccountRepo := currentaccounts.NewRepository(database)
	currentAccountSvc := currentaccounts.NewService(currentAccountRepo, cfg.LedgerCorrectionKey, cfg.LedgerSettlementKey)
	authzHandler := authz.NewHandler(actorStore)
	currentAccountHandler := currentaccounts.NewHandler(currentAccountSvc, currentaccounts.WithActorStore(actorStore), currentaccounts.WithAuthorizationAudit(actorStore))

	workPeriodRepo := workperiods.NewRepository(database)
	workPeriodSvc := workperiods.NewService(workPeriodRepo)
	workPeriodHandler := workperiods.NewHandler(workPeriodSvc)

	workPeriodAssignmentRepo := workperiodassignments.NewRepository(database)
	workPeriodAssignmentSvc := workperiodassignments.NewService(workPeriodAssignmentRepo, actorStore)
	workPeriodAssignmentHandler := workperiodassignments.NewHandler(workPeriodAssignmentSvc)

	goldProductionRepo := goldproduction.NewRepository(database)
	goldProductionSvc := goldproduction.NewService(goldProductionRepo)
	goldProductionHandler := goldproduction.NewHandler(goldProductionSvc)

	accrualRepo := accruals.NewRepository(database)
	accrualSvc := accruals.NewService(accrualRepo)
	accrualHandler := accruals.NewHandler(accrualSvc)

	deps := routes.Dependencies{
		DB:                          database,
		AuthenticationHandler:       authenticationHandler,
		DisableRouteAuthorization:   cfg.DisableRouteAuthorization,
		ActorHeaderMode:             cfg.AuthzActorHeaderMode,
		BootstrapActorKey:           cfg.AuthzBootstrapActorKey,
		AuthzHandler:                authzHandler,
		ActorStore:                  actorStore,
		PeopleHandler:               peopleHandler,
		CollaboratorHandler:         collaboratorHandler,
		ExpenseHandler:              expenseHandler,
		PriceListHandler:            priceListHandler,
		CurrentAccountHandler:       currentAccountHandler,
		WorkPeriodHandler:           workPeriodHandler,
		WorkPeriodAssignmentHandler: workPeriodAssignmentHandler,
		GoldProductionHandler:       goldProductionHandler,
		AccrualHandler:              accrualHandler,
		ReferenceDataHandler:        refHandler,
		TenantHandler:               tenantHandler,
		TenantService:               tenantSvc,
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
