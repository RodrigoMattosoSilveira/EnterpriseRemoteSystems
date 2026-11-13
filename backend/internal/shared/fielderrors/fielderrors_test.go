package fielderrors

import "testing"

func TestCollectorRecordsMessageAndRuleTogether(t *testing.T) {
	errs := New()
	errs.Require("name", "   ")
	errs.Require("code", "X")
	errs.Add("amount", MustBePositive, "Amount must be greater than zero")

	if errs.Empty() {
		t.Fatal("expected failures")
	}
	if errs.Fields["name"] != "Required" || errs.Codes["name"] != Required {
		t.Fatalf("unexpected name failure: %q / %q", errs.Fields["name"], errs.Codes["name"])
	}
	if _, ok := errs.Fields["code"]; ok {
		t.Fatal("non-blank value must not be reported")
	}
	if errs.Codes["amount"] != MustBePositive {
		t.Fatalf("unexpected amount rule %q", errs.Codes["amount"])
	}
	if len(errs.Fields) != len(errs.Codes) {
		t.Fatal("every field message must have a rule code")
	}
}

func TestSingle(t *testing.T) {
	fields, codes := Single("id", "inactive", "Inactive")
	if fields["id"] != "Inactive" || codes["id"] != "inactive" {
		t.Fatalf("unexpected single failure: %v %v", fields, codes)
	}
}
