package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterPeopleRoutes(v1 fiber.Router, deps Dependencies) {
	r := v1.Group("/people")
	r.Get("/", requirePermission(deps, authz.PermissionPeopleRead), deps.PeopleHandler.List)
	// Global-directory and Membership paths are Tenant Administrator-only.
	// Bite 30I.1 removes standing Tenant business-data permissions from the GLOBAL
	// Application Administrator, so Tenant Person creation remains an explicit
	// people.create capability of a Tenant-scoped Actor.
	r.Get("/global", requireTenantAdministrator(deps), deps.PeopleHandler.SearchGlobal)
	r.Post("/memberships", requireTenantAdministrator(deps), deps.PeopleHandler.CreateMembership)
	if deps.AuthenticationHandler != nil {
		r.Get("/:id/authentication", requireTenantAdministrator(deps), deps.AuthenticationHandler.GetPersonAuthenticationStatus)
		r.Post("/:id/authentication/enable", requireTenantAdministrator(deps), deps.AuthenticationHandler.EnablePersonAuthentication)
		r.Post("/:id/authentication/password-reset-tokens", requireTenantAdministrator(deps), deps.AuthenticationHandler.IssueTenantPersonPasswordResetToken)
		r.Post("/:id/authentication/reactivation-request", requireTenantAdministrator(deps), deps.AuthenticationHandler.RequestTenantPersonReactivation)
	}
	r.Post("/", requirePermission(deps, authz.PermissionPeopleCreate), deps.PeopleHandler.Create)
	r.Get("/:id", requirePermissionOrSelfPerson(deps, authz.PermissionPeopleRead, authz.PermissionPeopleSelfRead, "id"), deps.PeopleHandler.GetByID)
	r.Put("/:id", requirePermissionOrSelfPerson(deps, authz.PermissionPeopleUpdate, authz.PermissionPeopleSelfUpdate, "id"), deps.PeopleHandler.Update)
}
