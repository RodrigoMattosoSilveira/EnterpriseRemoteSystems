package main

import (
	"strings"
	"testing"
)

func TestEnrollmentPreconditions(t *testing.T) {
	for _, tc := range []struct {
		name, env, desired, confirm string
		offline                     bool
		pass                        bool
	}{
		{"production approved", "production", "production", productionConfirmation, true, true},
		{"production without confirmation", "production", "production", "", true, false},
		{"production mismatch", "test", "production", productionConfirmation, true, false},
		{"production not offline", "production", "production", productionConfirmation, false, false},
		{"test approved", "test", "test", "", true, true},
		{"test refuses prod confirmation", "test", "test", productionConfirmation, true, false},
		{"missing environment", "", "local", "", true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := verifyPreconditions(tc.env, tc.desired, tc.confirm, "CHG-3367", "ops-1", "BKP-3367", tc.offline)
			if (err == nil) != tc.pass {
				t.Fatalf("unexpected precondition result: %v", err)
			}
		})
	}
}

func TestEnrollmentJSONRejectsUnknownAndTrailingDocuments(t *testing.T) {
	for _, document := range []string{
		`{"administrators":[],"bypass":true}`,
		`{"administrators":[]} {"administrators":[]}`,
		`{`,
	} {
		if _, err := readEnrollment(strings.NewReader(document)); err == nil {
			t.Fatalf("should reject malformed or extra JSON: %s", document)
		}
	}
}

func TestEnrollmentRequiresExistingFile(t *testing.T) {
	if err := verifyDatabaseFile("/nonexistent/ers-human-admins.db"); err == nil {
		t.Fatal("missing DB must not be created")
	}
}
