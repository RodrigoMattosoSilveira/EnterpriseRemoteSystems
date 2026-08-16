package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterPeopleRoutes(v1 fiber.Router, deps Dependencies) {
	r := v1.Group("/people")
	r.Get("/", requirePermission(deps, authz.PermissionPeopleRead), deps.PeopleHandler.List)
	// The new Bite 30B global-directory and Membership paths are deliberately
	// Tenant Administrator-only. The legacy POST /people permission guard remains
	// temporarily for Bite 28 compatibility until the Application Administrator
	// control-plane cutover in Bite 30H removes its standing tenant permissions.
	r.Get("/global", requireTenantAdministrator(deps), deps.PeopleHandler.SearchGlobal)
	r.Post("/memberships", requireTenantAdministrator(deps), deps.PeopleHandler.CreateMembership)
	if deps.AuthenticationHandler != nil {
		r.Get("/:id/authentication", requireTenantAdministrator(deps), deps.AuthenticationHandler.GetPersonAuthenticationStatus)
		r.Post("/:id/authentication/enable", requireTenantAdministrator(deps), deps.AuthenticationHandler.EnablePersonAuthentication)
		r.Post("/:id/authentication/reactivation-request", requireTenantAdministrator(deps), deps.AuthenticationHandler.RequestTenantPersonReactivation)
	}
	r.Post("/", requirePermission(deps, authz.PermissionPeopleCreate), deps.PeopleHandler.Create)
	r.Get("/:id", requirePermissionOrSelfPerson(deps, authz.PermissionPeopleRead, authz.PermissionPeopleSelfRead, "id"), deps.PeopleHandler.GetByID)
	r.Put("/:id", requirePermissionOrSelfPerson(deps, authz.PermissionPeopleUpdate, authz.PermissionPeopleSelfUpdate, "id"), deps.PeopleHandler.Update)
}
