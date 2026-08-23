package routes

import (
	"enterpriseremotesystems/backend/internal/authz"
	"github.com/gofiber/fiber/v3"
)

func RegisterAuthenticationRoutes(router fiber.Router, deps Dependencies) {
	if deps.AuthenticationHandler == nil {
		return
	}

	r := router.Group("/auth")
	r.Use(authenticationMiddleware(deps))
	r.Post("/login", authenticationPublic(), deps.AuthenticationHandler.Login)
	r.Post("/logout", authenticationPublic(), deps.AuthenticationHandler.Logout)
	r.Get("/session", authenticationPublic(), deps.AuthenticationHandler.CurrentSession)
	r.Get("/tenant-options", requireAuthenticatedSession(deps), deps.AuthenticationHandler.TenantOptions)
	r.Get("/self-service", requireAuthenticatedSession(deps), deps.AuthenticationHandler.SelfServiceHome)
	r.Post("/password/change", requireAuthenticatedSession(deps), deps.AuthenticationHandler.ChangePassword)
	r.Post("/password/reset", authenticationPublic(), deps.AuthenticationHandler.ResetPassword)
	r.Post("/reactivation-requests", authenticationPublic(), deps.AuthenticationHandler.RequestSelfReactivation)
}

func RegisterAuthenticationAdministrationRoutes(router fiber.Router, deps Dependencies) {
	if deps.AuthenticationHandler == nil {
		return
	}

	r := router.Group("/auth")
	r.Get("/accounts", requireApplicationPermission(deps, authz.PermissionAuthzRead), deps.AuthenticationHandler.ListAccounts)
	r.Post("/accounts", requireApplicationPermission(deps, authz.PermissionAuthzManage), deps.AuthenticationHandler.CreateAccount)
	r.Patch("/accounts/:id/active", requireApplicationPermission(deps, authz.PermissionAuthzManage), deps.AuthenticationHandler.SetAccountActive)
	r.Post("/accounts/:id/password-reset-tokens", requireApplicationPermission(deps, authz.PermissionAuthzManage), deps.AuthenticationHandler.IssuePasswordResetToken)
	r.Get("/reactivation-requests", requireApplicationPermission(deps, authz.PermissionAuthzRead), deps.AuthenticationHandler.ListReactivationRequests)
	r.Post("/reactivation-requests/:id/decision", requireApplicationPermission(deps, authz.PermissionAuthzManage), deps.AuthenticationHandler.ReviewReactivationRequest)
}

func authenticationMiddleware(deps Dependencies) fiber.Handler {
	if deps.AuthenticationHandler == nil {
		return func(c fiber.Ctx) error { return c.Next() }
	}
	return deps.AuthenticationHandler.SessionMiddleware()
}

func authenticationPublic() fiber.Handler {
	return func(c fiber.Ctx) error { return c.Next() }
}

func requireAuthenticatedSession(deps Dependencies) fiber.Handler {
	return func(c fiber.Ctx) error {
		if deps.AuthenticationHandler == nil {
			return c.Status(fiber.StatusUnauthorized).JSON(map[string]any{
				"error": map[string]string{
					"code":    "authentication_required",
					"message": "An authenticated session is required",
				},
			})
		}
		return deps.AuthenticationHandler.RequireSession(c)
	}
}
