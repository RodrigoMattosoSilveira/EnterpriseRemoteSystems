package people

import "strings"

const (
	ProfilePersonalOnly = "PERSONAL_ONLY"
	ProfileIncomplete  = "INCOMPLETE"
	ProfileComplete    = "COMPLETE"
)

type CompletionResult struct {
	Status                  string
	CanCreateCollaborator  bool
	MissingSections         []string
}

type completionInput struct {
	Street1 string
	Street2 string
	State   string
	City    string
	CEP     string
	Country string

	BankName        string
	BankNumber      string
	CheckingAccount string
	PIXKey          string

	EmergencyName     string
	EmergencyCellular string
	EmergencyEmail    string
}

func ComputeCompletion(input completionInput) CompletionResult {
	missing := []string{}

	if !hasAddress(input) {
		missing = append(missing, "Address")
	}

	if !hasBank(input) {
		missing = append(missing, "Bank")
	}

	if !hasEmergency(input) {
		missing = append(missing, "Emergency")
	}

	if len(missing) == 3 {
		return CompletionResult{
			Status:                 ProfilePersonalOnly,
			CanCreateCollaborator: false,
			MissingSections:        missing,
		}
	}

	if len(missing) > 0 {
		return CompletionResult{
			Status:                 ProfileIncomplete,
			CanCreateCollaborator: false,
			MissingSections:        missing,
		}
	}

	return CompletionResult{
		Status:                 ProfileComplete,
		CanCreateCollaborator: true,
		MissingSections:        nil,
	}
}

func hasAddress(input completionInput) bool {
	return notBlank(input.Street1) &&
		notBlank(input.State) &&
		notBlank(input.CEP) &&
		notBlank(input.City) &&
		input.Country == "Brasil" &&
		IsValidCEP(input.CEP)
}

func hasBank(input completionInput) bool {
	return notBlank(input.BankName) &&
		notBlank(input.BankNumber) &&
		notBlank(input.CheckingAccount) &&
		notBlank(input.PIXKey)
}

func hasEmergency(input completionInput) bool {
	return notBlank(input.EmergencyName) &&
		IsValidBrazilianCellular(input.EmergencyCellular) &&
		IsValidEmail(input.EmergencyEmail)
}

func notBlank(value string) bool {
	return strings.TrimSpace(value) != ""
}