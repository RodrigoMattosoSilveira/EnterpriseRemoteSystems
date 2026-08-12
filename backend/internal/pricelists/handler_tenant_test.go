package pricelists

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

type tenantRecordingService struct {
	listItemsTenantID           string
	createItemTenantID          string
	updateItemTenantID          string
	deactivateItemTenantID      string
	reactivateItemTenantID      string
	listGoldPricesTenantID      string
	createGoldPriceTenantID     string
	latestGoldPriceTenantID     string
	deactivateGoldPriceTenantID string
}

func (s *tenantRecordingService) ListItems(_ context.Context, tenantID string, _ PriceListItemListFilter) ([]PriceListItemDTO, error) {
	s.listItemsTenantID = tenantID
	return []PriceListItemDTO{}, nil
}

func (s *tenantRecordingService) CreateItem(_ context.Context, tenantID string, _ CreatePriceListItemRequest) (*PriceListItemDTO, error) {
	s.createItemTenantID = tenantID
	return &PriceListItemDTO{ID: "price-item-one", TenantID: tenantID}, nil
}

func (s *tenantRecordingService) UpdateItem(_ context.Context, tenantID string, id string, _ UpdatePriceListItemRequest) (*PriceListItemDTO, error) {
	s.updateItemTenantID = tenantID
	return &PriceListItemDTO{ID: id, TenantID: tenantID}, nil
}

func (s *tenantRecordingService) DeactivateItem(_ context.Context, tenantID string, id string) (*PriceListItemDTO, error) {
	s.deactivateItemTenantID = tenantID
	return &PriceListItemDTO{ID: id, TenantID: tenantID, Active: false}, nil
}

func (s *tenantRecordingService) ReactivateItem(_ context.Context, tenantID string, id string) (*PriceListItemDTO, error) {
	s.reactivateItemTenantID = tenantID
	return &PriceListItemDTO{ID: id, TenantID: tenantID, Active: true}, nil
}

func (s *tenantRecordingService) ListGoldPrices(_ context.Context, tenantID string, _ GoldPriceListFilter) ([]GoldPriceDTO, error) {
	s.listGoldPricesTenantID = tenantID
	return []GoldPriceDTO{}, nil
}

func (s *tenantRecordingService) CreateGoldPrice(_ context.Context, tenantID string, _ CreateGoldPriceRequest) (*GoldPriceDTO, error) {
	s.createGoldPriceTenantID = tenantID
	return &GoldPriceDTO{ID: "gold-price-one", TenantID: tenantID}, nil
}

func (s *tenantRecordingService) LatestGoldPrice(_ context.Context, tenantID string) (*GoldPriceDTO, error) {
	s.latestGoldPriceTenantID = tenantID
	return &GoldPriceDTO{ID: "gold-price-one", TenantID: tenantID}, nil
}

func (s *tenantRecordingService) DeactivateGoldPrice(_ context.Context, tenantID string, id string) (*GoldPriceDTO, error) {
	s.deactivateGoldPriceTenantID = tenantID
	return &GoldPriceDTO{ID: id, TenantID: tenantID, Active: false}, nil
}

func TestHandlerUsesAuthoritativeSelectedTenantForPriceListAndGoldPriceOperations(t *testing.T) {
	service := &tenantRecordingService{}
	handler := NewHandler(service)
	app := fiber.New()
	app.Use(func(c fiber.Ctx) error {
		authz.SetRequestActor(c, &authz.Actor{
			ID:       "session-application-admin",
			RecordID: "actor-record-selected",
			TenantID: "tenant-selected",
			Source:   authz.ActorSourceAuthenticatedSession,
		})
		return c.Next()
	})
	app.Get("/price-list-items", handler.ListItems)
	app.Post("/price-list-items", handler.CreateItem)
	app.Patch("/price-list-items/:id", handler.UpdateItem)
	app.Patch("/price-list-items/:id/deactivate", handler.DeactivateItem)
	app.Patch("/price-list-items/:id/reactivate", handler.ReactivateItem)
	app.Get("/gold-prices", handler.ListGoldPrices)
	app.Post("/gold-prices", handler.CreateGoldPrice)
	app.Get("/gold-prices/latest", handler.LatestGoldPrice)
	app.Patch("/gold-prices/:id/deactivate", handler.DeactivateGoldPrice)

	tests := []struct {
		name       string
		method     string
		path       string
		body       string
		assertSeen func(t *testing.T)
	}{
		{name: "list price-list items", method: http.MethodGet, path: "/price-list-items", assertSeen: func(t *testing.T) {
			if service.listItemsTenantID != "tenant-selected" {
				t.Fatalf("expected selected tenant for item list, got %q", service.listItemsTenantID)
			}
		}},
		{name: "create price-list item", method: http.MethodPost, path: "/price-list-items", body: `{}`, assertSeen: func(t *testing.T) {
			if service.createItemTenantID != "tenant-selected" {
				t.Fatalf("expected selected tenant for item create, got %q", service.createItemTenantID)
			}
		}},
		{name: "update price-list item", method: http.MethodPatch, path: "/price-list-items/price-item-one", body: `{}`, assertSeen: func(t *testing.T) {
			if service.updateItemTenantID != "tenant-selected" {
				t.Fatalf("expected selected tenant for item update, got %q", service.updateItemTenantID)
			}
		}},
		{name: "deactivate price-list item", method: http.MethodPatch, path: "/price-list-items/price-item-one/deactivate", body: `{}`, assertSeen: func(t *testing.T) {
			if service.deactivateItemTenantID != "tenant-selected" {
				t.Fatalf("expected selected tenant for item deactivate, got %q", service.deactivateItemTenantID)
			}
		}},
		{name: "reactivate price-list item", method: http.MethodPatch, path: "/price-list-items/price-item-one/reactivate", body: `{}`, assertSeen: func(t *testing.T) {
			if service.reactivateItemTenantID != "tenant-selected" {
				t.Fatalf("expected selected tenant for item reactivate, got %q", service.reactivateItemTenantID)
			}
		}},
		{name: "list gold prices", method: http.MethodGet, path: "/gold-prices", assertSeen: func(t *testing.T) {
			if service.listGoldPricesTenantID != "tenant-selected" {
				t.Fatalf("expected selected tenant for gold-price list, got %q", service.listGoldPricesTenantID)
			}
		}},
		{name: "create gold price", method: http.MethodPost, path: "/gold-prices", body: `{}`, assertSeen: func(t *testing.T) {
			if service.createGoldPriceTenantID != "tenant-selected" {
				t.Fatalf("expected selected tenant for gold-price create, got %q", service.createGoldPriceTenantID)
			}
		}},
		{name: "latest gold price", method: http.MethodGet, path: "/gold-prices/latest", assertSeen: func(t *testing.T) {
			if service.latestGoldPriceTenantID != "tenant-selected" {
				t.Fatalf("expected selected tenant for latest gold price, got %q", service.latestGoldPriceTenantID)
			}
		}},
		{name: "deactivate gold price", method: http.MethodPatch, path: "/gold-prices/gold-price-one/deactivate", body: `{}`, assertSeen: func(t *testing.T) {
			if service.deactivateGoldPriceTenantID != "tenant-selected" {
				t.Fatalf("expected selected tenant for gold-price deactivate, got %q", service.deactivateGoldPriceTenantID)
			}
		}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.path, bytes.NewBufferString(test.body))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(authz.HeaderTenantID, "tenant-spoofed")

			response, err := app.Test(request)
			if err != nil {
				t.Fatalf("perform request: %v", err)
			}
			defer response.Body.Close()
			if response.StatusCode >= http.StatusBadRequest {
				t.Fatalf("expected successful response, got %d", response.StatusCode)
			}
			test.assertSeen(t)
		})
	}
}
