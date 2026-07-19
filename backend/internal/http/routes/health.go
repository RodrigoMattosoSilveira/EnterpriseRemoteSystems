package routes

import (
	"enterpriseremotesystems/backend/internal/health"
	"github.com/gofiber/fiber/v3"
)

// RegisterPublicHealthFastPath installs a top-priority responder before any
// /api/v1 middleware or protected route is registered. Deployment smoke tests,
// container probes, and edge/load-balancer checks do not carry actor headers, so
// health checks must stay public even when route authorization is enabled.
func RegisterPublicHealthFastPath(server *fiber.App) {
	h := health.NewHandler()

	server.Use(func(c fiber.Ctx) error {
		if isPublicHealthFastPathMethod(c.Method()) && isPublicHealthFastPath(c.Path()) {
			return h.Healthz(c)
		}
		return c.Next()
	})
}

func RegisterHealthRoutes(server *fiber.App) {
	h := health.NewHandler()

	server.Get("/healthz", h.Healthz)
	server.Get("/api/v1/healthz", h.Healthz)
}

func isPublicHealthFastPathMethod(method string) bool {
	switch method {
	case fiber.MethodGet, fiber.MethodHead:
		return true
	default:
		return false
	}
}

func isPublicHealthFastPath(path string) bool {
	switch path {
	case "/healthz", "/healthz/", "/api/v1/healthz", "/api/v1/healthz/":
		return true
	default:
		return false
	}
}
