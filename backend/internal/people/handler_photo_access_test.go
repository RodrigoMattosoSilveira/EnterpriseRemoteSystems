package people_test

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
)

// A Tenant that holds no membership for the Person must not receive the photo: the response
// is an error, and no image bytes are returned.
func TestPhotoEndpointDoesNotServePhotoToNonMemberTenant(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	created := createPerson(t, server, validPersonPayload(1, nil))

	put := httptest.NewRequest(http.MethodPut, peopleUpdateURLPrefix+created.Data.ID+"/photo", bytes.NewReader(pngBytes(t, 96, 80)))
	put.Header.Set("Content-Type", "image/png")
	putRes, err := server.Test(put, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("put photo: %v", err)
	}
	putRes.Body.Close()
	if putRes.StatusCode != http.StatusOK {
		t.Fatalf("expected photo PUT 200, got %d", putRes.StatusCode)
	}

	get := httptest.NewRequest(http.MethodGet, peopleUpdateURLPrefix+created.Data.ID+"/photo", nil)
	get.Header.Set("X-Tenant-ID", "tenant-not-a-member")
	res, err := server.Test(get, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("get photo as non-member Tenant: %v", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode == http.StatusOK {
		t.Fatalf("non-member Tenant must not receive the photo, got 200")
	}
	if res.StatusCode != http.StatusNotFound && res.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 404 or 403 for non-member Tenant, got %d", res.StatusCode)
	}
	if bytes.HasPrefix(body, []byte("\x89PNG")) {
		t.Fatalf("non-member response leaked image bytes")
	}
}

// A member Tenant receives the image bytes only: the body is the PNG itself, with the image
// content type and no JSON envelope or Tenant data.
func TestPhotoEndpointServesImageBytesOnlyToMember(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	created := createPerson(t, server, validPersonPayload(1, nil))

	put := httptest.NewRequest(http.MethodPut, peopleUpdateURLPrefix+created.Data.ID+"/photo", bytes.NewReader(pngBytes(t, 96, 80)))
	put.Header.Set("Content-Type", "image/png")
	putRes, err := server.Test(put, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("put photo: %v", err)
	}
	putRes.Body.Close()

	get := httptest.NewRequest(http.MethodGet, peopleUpdateURLPrefix+created.Data.ID+"/photo", nil)
	get.Header.Set("X-Tenant-ID", "default")
	res, err := server.Test(get, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("get photo as member Tenant: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("member Tenant expected 200, got %d", res.StatusCode)
	}
	if got := res.Header.Get("Content-Type"); got != "image/png" {
		t.Fatalf("expected image/png, got %q", got)
	}
	body, _ := io.ReadAll(res.Body)
	if !bytes.HasPrefix(body, []byte("\x89PNG\r\n\x1a\n")) {
		t.Fatalf("body is not a PNG image")
	}
	if bytes.Contains(body, []byte("tenantId")) || bytes.Contains(body, []byte("membershipId")) || bytes.HasPrefix(body, []byte("{")) {
		t.Fatalf("photo response carries Tenant or JSON data")
	}
}
