package main

import (
	"flag"
	"log"

	"enterpriseremotesystems/backend/internal/app"
)

func main() {
	migrateOnly := flag.Bool("migrate-only", false, "run migrations and exit")
	flag.Parse()

	cfg, err := app.LoadConfig()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	server, cleanup, err := app.Bootstrap(cfg)
	if err != nil {
		log.Fatalf("failed to bootstrap app: %v", err)
	}
	defer cleanup()

	if *migrateOnly {
		log.Println("migrations completed")
		return
	}

	if err := server.Listen(cfg.HTTPAddr); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}
