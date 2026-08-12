package people

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
	listTenantID   string
	createTenantID string
	getTenantID    string
	updateTenantID string
}

func (s *tenantRecordingService) List(_ context.Context, tenantID string, _ PersonListFilter) ([]PersonDTO, int64, error) {
	s.listTenantID = tenantID
	return []PersonDTO{}, 0, nil
}

func (s *tenantRecordingService) Create(_ context.Context, tenantID string, _ CreatePersonRequest, _ string) (*PersonDTO, error) {
	s.createTenantID = tenantID
	return &PersonDTO{ID: "person-one", TenantID: tenantID}, nil
}

func (s *tenantRecordingService) GetByID(_ context.Context, tenantID string, id string) (*PersonDTO, error) {
	s.getTenantID = tenantID
	return &PersonDTO{ID: id, TenantID: tenantID}, nil
}

func (s *tenantRecordingService) Update(_ context.Context, tenantID string, id string, _ UpdatePersonRequest, _ string) (*PersonDTO, error) {
	s.updateTenantID = tenantID
	return &PersonDTO{ID: id, TenantID: tenantID}, nil
}

func TestHandlerUsesAuthoritativeSelectedTenantForPeopleOperations(t *testing.T) {
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
	app.Get("/people", handler.List)
	app.Post("/people", handler.Create)
	app.Get("/people/:id", handler.GetByID)
	app.Put("/people/:id", handler.Update)

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
			path:   "/people",
			assertSeen: func(t *testing.T) {
				if service.listTenantID != "tenant-selected" {
					t.Fatalf("expected selected tenant for list, got %q", service.listTenantID)
				}
			},
		},
		{
			name:   "create",
			method: http.MethodPost,
			path:   "/people",
			body:   `{}`,
			assertSeen: func(t *testing.T) {
				if service.createTenantID != "tenant-selected" {
					t.Fatalf("expected selected tenant for create, got %q", service.createTenantID)
				}
			},
		},
		{
			name:   "get",
			method: http.MethodGet,
			path:   "/people/person-one",
			assertSeen: func(t *testing.T) {
				if service.getTenantID != "tenant-selected" {
					t.Fatalf("expected selected tenant for get, got %q", service.getTenantID)
				}
			},
		},
		{
			name:   "update",
			method: http.MethodPut,
			path:   "/people/person-one",
			body:   `{}`,
			assertSeen: func(t *testing.T) {
				if service.updateTenantID != "tenant-selected" {
					t.Fatalf("expected selected tenant for update, got %q", service.updateTenantID)
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
