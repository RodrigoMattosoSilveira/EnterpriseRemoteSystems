package referencedata

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
	listTenantID       string
	createTenantID     string
	updateTenantID     string
	deactivateTenantID string
	reactivateTenantID string
}

func (s *tenantRecordingService) ListByType(_ context.Context, tenantID string, _ string) ([]ReferenceDataDTO, error) {
	s.listTenantID = tenantID
	return []ReferenceDataDTO{}, nil
}

func (s *tenantRecordingService) Create(_ context.Context, tenantID string, typ string, _ CreateReferenceDataRequest) (*ReferenceDataDTO, error) {
	s.createTenantID = tenantID
	return &ReferenceDataDTO{ID: "reference-one", TenantID: tenantID, Type: typ}, nil
}

func (s *tenantRecordingService) Update(_ context.Context, tenantID string, typ string, id string, _ UpdateReferenceDataRequest) (*ReferenceDataDTO, error) {
	s.updateTenantID = tenantID
	return &ReferenceDataDTO{ID: id, TenantID: tenantID, Type: typ}, nil
}

func (s *tenantRecordingService) Deactivate(_ context.Context, tenantID string, typ string, id string) (*ReferenceDataDTO, error) {
	s.deactivateTenantID = tenantID
	return &ReferenceDataDTO{ID: id, TenantID: tenantID, Type: typ, Active: false}, nil
}

func (s *tenantRecordingService) Reactivate(_ context.Context, tenantID string, typ string, id string) (*ReferenceDataDTO, error) {
	s.reactivateTenantID = tenantID
	return &ReferenceDataDTO{ID: id, TenantID: tenantID, Type: typ, Active: true}, nil
}

func TestHandlerUsesAuthoritativeSelectedTenantForReferenceDataOperations(t *testing.T) {
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
	app.Get("/reference-data/:type", handler.ListByType)
	app.Post("/reference-data/:type", handler.Create)
	app.Put("/reference-data/:type/:id", handler.Update)
	app.Patch("/reference-data/:type/:id/deactivate", handler.Deactivate)
	app.Patch("/reference-data/:type/:id/reactivate", handler.Reactivate)

	tests := []struct {
		name       string
		method     string
		path       string
		body       string
		assertSeen func(t *testing.T)
	}{
		{
			name:   "list",
			method: http.MethodGet,
			path:   "/reference-data/task",
			assertSeen: func(t *testing.T) {
				if service.listTenantID != "tenant-selected" {
					t.Fatalf("expected selected tenant for list, got %q", service.listTenantID)
				}
			},
		},
		{
			name:   "create",
			method: http.MethodPost,
			path:   "/reference-data/task",
			body:   `{}`,
			assertSeen: func(t *testing.T) {
				if service.createTenantID != "tenant-selected" {
					t.Fatalf("expected selected tenant for create, got %q", service.createTenantID)
				}
			},
		},
		{
			name:   "update",
			method: http.MethodPut,
			path:   "/reference-data/task/reference-one",
			body:   `{}`,
			assertSeen: func(t *testing.T) {
				if service.updateTenantID != "tenant-selected" {
					t.Fatalf("expected selected tenant for update, got %q", service.updateTenantID)
				}
			},
		},
		{
			name:   "deactivate",
			method: http.MethodPatch,
			path:   "/reference-data/task/reference-one/deactivate",
			body:   `{}`,
			assertSeen: func(t *testing.T) {
				if service.deactivateTenantID != "tenant-selected" {
					t.Fatalf("expected selected tenant for deactivate, got %q", service.deactivateTenantID)
				}
			},
		},
		{
			name:   "reactivate",
			method: http.MethodPatch,
			path:   "/reference-data/task/reference-one/reactivate",
			body:   `{}`,
			assertSeen: func(t *testing.T) {
				if service.reactivateTenantID != "tenant-selected" {
					t.Fatalf("expected selected tenant for reactivate, got %q", service.reactivateTenantID)
				}
			},
		},
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
