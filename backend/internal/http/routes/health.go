package routes

import (
	"enterpriseremotesystems/backend/internal/health"
	"github.com/gofiber/fiber/v3"
)

func RegisterHealthRoutes(server *fiber.App) {
	h := health.NewHandler()

	server.Get("/healthz", h.Healthz)
	server.Get("/api/v1/healthz", h.Healthz)
}
