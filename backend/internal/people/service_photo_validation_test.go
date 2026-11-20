package people_test

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"testing"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/people"
)

// Invalid file handling: each rejected upload must fail with a validation error
// and leave the previously stored photo byte-for-byte unchanged.
func TestServiceSetPhotoRejectsInvalidFilesWithoutAlteringExistingPhoto(t *testing.T) {
	fx, cleanup := newPhotoFixture(t, false)
	defer cleanup()
	ctx := context.Background()
	existing := pngBytes(t, 96, 80)
	if err := fx.repo.UpsertPhoto(ctx, db.DefaultTenantID, fx.personID, photoRecord(t, existing, "image/png")); err != nil {
		t.Fatalf("seed existing photo: %v", err)
	}
	service := people.NewService(fx.repo)

	jpegBytes := jpegBytesFor(t, 96, 80)
	oversized := make([]byte, 5*1024*1024+1)
	copy(oversized, pngBytes(t, 96, 80))

	cases := []struct {
		name        string
		contentType string
		data        []byte
	}{
		{"unsupported content type", "image/gif", pngBytes(t, 96, 80)},
		{"PDF renamed as JPEG", "image/jpeg", []byte("%PDF-1.4 not an image")},
		{"PNG bytes declared as JPEG", "image/jpeg", pngBytes(t, 96, 80)},
		{"JPEG bytes declared as PNG", "image/png", jpegBytes},
		{"width below 64 pixels", "image/png", pngBytes(t, 32, 80)},
		{"height below 64 pixels", "image/png", pngBytes(t, 96, 32)},
		{"width above 2048 pixels", "image/png", pngBytes(t, 2049, 64)},
		{"height above 2048 pixels", "image/png", pngBytes(t, 64, 2049)},
		{"larger than 5 MiB", "image/png", oversized},
		{"empty upload", "image/png", []byte{}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := service.SetPhoto(ctx, db.DefaultTenantID, fx.personID, tc.contentType, tc.data, "test-actor")
			var validation people.ValidationError
			if !errors.As(err, &validation) {
				t.Fatalf("expected ValidationError, got %v", err)
			}
			got, getErr := fx.repo.GetPhoto(ctx, db.DefaultTenantID, fx.personID)
			if getErr != nil {
				t.Fatalf("existing photo must remain after rejection: %v", getErr)
			}
			assertPhotoEquals(t, got, existing, 96, 80)
			if got.ContentType != "image/png" {
				t.Fatalf("content type changed after rejection: %q", got.ContentType)
			}
		})
	}
}

// Valid input through the service: the normalized photo is stored against the Global Person.
func TestServiceSetPhotoStoresValidPhotoOnGlobalPerson(t *testing.T) {
	fx, cleanup := newPhotoFixture(t, false)
	defer cleanup()
	ctx := context.Background()
	service := people.NewService(fx.repo)
	data := pngBytes(t, 96, 80)

	dto, err := service.SetPhoto(ctx, db.DefaultTenantID, fx.personID, "image/png", data, "test-actor")
	if err != nil {
		t.Fatalf("valid upload rejected: %v", err)
	}
	if dto.Width != 96 || dto.Height != 80 {
		t.Fatalf("unexpected dimensions in response: %dx%d", dto.Width, dto.Height)
	}
	got, err := fx.repo.GetPhoto(ctx, db.DefaultTenantID, fx.personID)
	if err != nil {
		t.Fatalf("stored photo not found: %v", err)
	}
	if got.PersonID != fx.personID || got.UpdatedBy != "test-actor" {
		t.Fatalf("photo attribution wrong: person=%q updatedBy=%q", got.PersonID, got.UpdatedBy)
	}
}

func jpegBytesFor(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: 200, G: 90, B: 20, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode jpeg: %v", err)
	}
	return buf.Bytes()
}
