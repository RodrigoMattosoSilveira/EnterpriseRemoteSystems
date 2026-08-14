package people_test

import (
	"testing"

	"enterpriseremotesystems/backend/internal/people"
)

func TestCEPValidationAcceptsCommonBrazilianFormatting(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		value string
		want  string
	}{
		{name: "plain digits", value: "01001000", want: "01001000"},
		{name: "standard dash", value: "01001-000", want: "01001000"},
		{name: "dot and dash", value: "01.001-000", want: "01001000"},
		{name: "space separator", value: "01001 000", want: "01001000"},
		{name: "nonbreaking hyphen", value: "01001‑000", want: "01001000"},
		{name: "en dash", value: "01001–000", want: "01001000"},
		{name: "municipality prefix", value: "68920", want: "68920000"},
		{name: "formatted municipality prefix", value: "68.920", want: "68920000"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if !people.IsValidCEP(tt.value) {
				t.Fatalf("expected CEP %q to be valid", tt.value)
			}
			if got := people.NormalizeCEP(tt.value); got != tt.want {
				t.Fatalf("expected normalized CEP %q, got %q", tt.want, got)
			}
		})
	}
}

func TestCEPValidationRejectsNonCEPCharacters(t *testing.T) {
	t.Parallel()

	invalid := []string{
		"6892",
		"689200",
		"0100100",
		"010010000",
		"CEP 01001-000",
		"01001/000",
		"abcdefgh",
	}

	for _, value := range invalid {
		if people.IsValidCEP(value) {
			t.Errorf("expected CEP %q to be invalid", value)
		}
	}
}
