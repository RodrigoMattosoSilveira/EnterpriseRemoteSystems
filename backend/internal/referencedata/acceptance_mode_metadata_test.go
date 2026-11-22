package referencedata

import (
	"errors"
	"testing"
)

func TestAcceptanceModeMetadataIsRebuiltFromAllowedModes(t *testing.T) {
	for _, mode := range []string{"BOTH", "PAPER_ONLY", "ELECTRONIC_ONLY"} {
		got, err := normalizeAcceptanceModeMetadata("receipt_acceptance_mode", "EXPENSE_DEBIT", `{"mode":"`+mode+`"}`)
		if err != nil {
			t.Fatalf("mode %s: unexpected error %v", mode, err)
		}
		if got != `{"mode":"`+mode+`"}` {
			t.Fatalf("mode %s: stored metadata %q", mode, got)
		}
	}
}

func TestAcceptanceModeMetadataDefaultsToBothWhenEmpty(t *testing.T) {
	got, err := normalizeAcceptanceModeMetadata("receipt_acceptance_mode", "EXPENSE_DEBIT", "   ")
	if err != nil {
		t.Fatalf("unexpected error %v", err)
	}
	if got != `{"mode":"BOTH"}` {
		t.Fatalf("expected default BOTH, got %q", got)
	}
}

func TestAcceptanceModeMetadataRejectsMistypedValues(t *testing.T) {
	cases := map[string]string{
		"lowercase mode":  `{"mode":"paper_only"}`,
		"unknown mode":    `{"mode":"SOMETIMES"}`,
		"extra key":       `{"mode":"BOTH","note":"x"}`,
		"wrong key":       `{"modo":"BOTH"}`,
		"not json":        `PAPER_ONLY`,
		"mode not string": `{"mode":1}`,
		"json array":      `["BOTH"]`,
	}
	for name, metadata := range cases {
		if _, err := normalizeAcceptanceModeMetadata("receipt_acceptance_mode", "EXPENSE_DEBIT", metadata); err == nil {
			t.Fatalf("%s: expected rejection for %q", name, metadata)
		}
	}
}

func TestAcceptanceModeRequiresExpenseDebitCode(t *testing.T) {
	_, err := normalizeAcceptanceModeMetadata("receipt_acceptance_mode", "OTHER", `{"mode":"BOTH"}`)
	var validation ValidationError
	if !errors.As(err, &validation) || validation.Fields["code"] == "" {
		t.Fatalf("expected code validation error, got %v", err)
	}
}

func TestOtherReferenceTypesAreUnchanged(t *testing.T) {
	got, err := normalizeAcceptanceModeMetadata("value_unit", "BRL", `{"anything":true}`)
	if err != nil || got != `{"anything":true}` {
		t.Fatalf("other types must pass through unchanged, got %q err=%v", got, err)
	}
}
