package http

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/recover"

	"enterpriseremotesystems/backend/internal/http/routes"
)

func NewServer(deps routes.Dependencies) *fiber.App {
	server := fiber.New(fiber.Config{
		AppName:      "Enterprise Remote Systems API",
		ServerHeader: "enterpriseremotesystems",
	})

	server.Use(recover.New())
	server.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "Authorization"},
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
	}))

	routes.Register(server, deps)

	return server
}
