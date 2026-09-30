package people_test

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
)

func TestPersonPhotoLifecycle(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	created := createPerson(t, server, validPersonPayload(1, nil))
	photo := pngBytes(t, 96, 80)

	put := httptest.NewRequest(http.MethodPut, peopleUpdateURLPrefix+created.Data.ID+"/photo", bytes.NewReader(photo))
	put.Header.Set("Content-Type", "image/png")
	putRes, err := server.Test(put, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("put photo: %v", err)
	}
	defer putRes.Body.Close()
	if putRes.StatusCode != http.StatusOK {
		t.Fatalf("expected photo PUT 200, got %d", putRes.StatusCode)
	}

	get := httptest.NewRequest(http.MethodGet, peopleUpdateURLPrefix+created.Data.ID+"/photo", nil)
	getRes, err := server.Test(get, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("get photo: %v", err)
	}
	defer getRes.Body.Close()
	if getRes.StatusCode != http.StatusOK {
		t.Fatalf("expected photo GET 200, got %d", getRes.StatusCode)
	}
	if got := getRes.Header.Get("Content-Type"); got != "image/png" {
		t.Fatalf("expected image/png, got %q", got)
	}
	got, _ := io.ReadAll(getRes.Body)
	decoded, _, err := image.Decode(bytes.NewReader(got))
	if err != nil {
		t.Fatalf("decode retrieved photo: %v", err)
	}
	if decoded.Bounds().Dx() != 96 || decoded.Bounds().Dy() != 80 {
		t.Fatalf("unexpected retrieved dimensions: %v", decoded.Bounds())
	}

	del := httptest.NewRequest(http.MethodDelete, peopleUpdateURLPrefix+created.Data.ID+"/photo", nil)
	delRes, err := server.Test(del, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("delete photo: %v", err)
	}
	defer delRes.Body.Close()
	if delRes.StatusCode != http.StatusNoContent {
		t.Fatalf("expected photo DELETE 204, got %d", delRes.StatusCode)
	}

	missing, err := server.Test(httptest.NewRequest(http.MethodGet, peopleUpdateURLPrefix+created.Data.ID+"/photo", nil), fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("get deleted photo: %v", err)
	}
	defer missing.Body.Close()
	if missing.StatusCode != http.StatusNotFound {
		t.Fatalf("expected deleted photo GET 404, got %d", missing.StatusCode)
	}
}

func TestPersonPhotoRejectsUnsupportedDimensions(t *testing.T) {
	server, cleanup := newTestServer(t)
	defer cleanup()
	created := createPerson(t, server, validPersonPayload(1, nil))
	photo := pngBytes(t, 32, 32)
	req := httptest.NewRequest(http.MethodPut, peopleUpdateURLPrefix+created.Data.ID+"/photo", bytes.NewReader(photo))
	req.Header.Set("Content-Type", "image/png")
	res, err := server.Test(req, fiber.TestConfig{Timeout: 0, FailOnTimeout: false})
	if err != nil {
		t.Fatalf("put invalid photo: %v", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected invalid photo 400, got %d", res.StatusCode)
	}
}

func pngBytes(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: 40, G: 80, B: 120, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}
