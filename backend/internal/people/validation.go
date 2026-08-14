package people

import (
	"errors"
	"regexp"
	"strings"
	"unicode"
)

var (
	reDigitsOnly     = regexp.MustCompile(`\D`)
	reEmail          = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	reBrazilCellular = regexp.MustCompile(`^\+?55?[1-9]{2}9[0-9]{8}$|^[1-9]{2}9[0-9]{8}$`)
	reRG             = regexp.MustCompile(`^[A-Za-z0-9.\-]{5,20}$`)
	reCEPDigits      = regexp.MustCompile(`^[0-9]{8}$`)
)

type ValidationError struct {
	Fields map[string]string
}

func (e ValidationError) Error() string {
	return "validation failed"
}

func ValidateCreatePerson(req CreatePersonRequest) error {
	fields := map[string]string{}

	requireString(fields, "firstName", req.FirstName)
	requireString(fields, "lastName", req.LastName)
	requireString(fields, "nickname", req.Nickname)
	requireString(fields, "cpf", req.CPF)
	requireString(fields, "rg", req.RG)
	requireString(fields, "cellular", req.Cellular)
	requireString(fields, "email", req.Email)
	requireString(fields, "statusId", req.StatusID)

	if req.CPF != "" && !IsValidCPF(req.CPF) {
		fields["cpf"] = "CPF is invalid"
	}

	if req.RG != "" && !IsValidRG(req.RG) {
		fields["rg"] = "RG is invalid"
	}

	if req.Cellular != "" && !IsValidBrazilianCellular(req.Cellular) {
		fields["cellular"] = "Cellular must be a valid Brazilian mobile number"
	}

	if req.Email != "" && !IsValidEmail(req.Email) {
		fields["email"] = "Email is invalid"
	}

	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}

	return nil
}

func ValidateUpdatePerson(req UpdatePersonRequest) error {
	fields := map[string]string{}

	requireString(fields, "firstName", req.FirstName)
	requireString(fields, "lastName", req.LastName)
	requireString(fields, "nickname", req.Nickname)
	requireString(fields, "cpf", req.CPF)
	requireString(fields, "rg", req.RG)
	requireString(fields, "cellular", req.Cellular)
	requireString(fields, "email", req.Email)
	requireString(fields, "statusId", req.StatusID)

	if req.CPF != "" && !IsValidCPF(req.CPF) {
		fields["cpf"] = "CPF is invalid"
	}

	if req.RG != "" && !IsValidRG(req.RG) {
		fields["rg"] = "RG is invalid"
	}

	if req.Cellular != "" && !IsValidBrazilianCellular(req.Cellular) {
		fields["cellular"] = "Cellular must be a valid Brazilian mobile number"
	}

	if req.Email != "" && !IsValidEmail(req.Email) {
		fields["email"] = "Email is invalid"
	}

	if req.CEP != "" && !IsValidCEP(req.CEP) {
		fields["cep"] = "CEP is invalid"
	}

	if req.EmergencyCellular != "" && !IsValidBrazilianCellular(req.EmergencyCellular) {
		fields["emergencyCellular"] = "Emergency cellular must be a valid Brazilian mobile number"
	}

	if req.EmergencyEmail != "" && !IsValidEmail(req.EmergencyEmail) {
		fields["emergencyEmail"] = "Emergency email is invalid"
	}

	if req.Country != "" && req.Country != "Brasil" {
		fields["country"] = "Country must be Brasil"
	}

	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}

	return nil
}

func requireString(fields map[string]string, key string, value string) {
	if strings.TrimSpace(value) == "" {
		fields[key] = "Required"
	}
}

func IsValidEmail(value string) bool {
	return reEmail.MatchString(strings.TrimSpace(value))
}

func IsValidRG(value string) bool {
	return reRG.MatchString(strings.TrimSpace(value))
}

func IsValidCEP(value string) bool {
	normalized, ok := parseCEP(value)
	return ok && reCEPDigits.MatchString(normalized)
}

// NormalizeCEP returns the canonical eight-digit representation used by the
// database. Five-digit municipality CEP prefixes are completed with the
// conventional 000 suffix. Callers should validate with IsValidCEP before
// persisting the value.
func NormalizeCEP(value string) string {
	normalized, _ := parseCEP(value)
	return normalized
}

func parseCEP(value string) (string, bool) {
	var digits strings.Builder
	digits.Grow(8)

	for _, r := range strings.TrimSpace(value) {
		switch {
		case r >= '0' && r <= '9':
			digits.WriteRune(r)
		case unicode.IsSpace(r):
			continue
		case isCEPSeparator(r):
			continue
		default:
			return "", false
		}
	}

	normalized := digits.String()
	switch len(normalized) {
	case 5:
		// Some municipalities use one general CEP ending in 000 and users
		// commonly enter only its five-digit prefix (for example, 68920 for
		// 68920-000). Persist the complete canonical CEP.
		return normalized + "000", true
	case 8:
		return normalized, true
	default:
		return "", false
	}
}

func isCEPSeparator(r rune) bool {
	switch r {
	case '.', '-', '‐', '‑', '‒', '–', '—', '−':
		return true
	default:
		return false
	}
}

func IsValidBrazilianCellular(value string) bool {
	clean := strings.TrimSpace(value)
	clean = strings.ReplaceAll(clean, " ", "")
	clean = strings.ReplaceAll(clean, "(", "")
	clean = strings.ReplaceAll(clean, ")", "")
	clean = strings.ReplaceAll(clean, "-", "")

	if strings.HasPrefix(clean, "+") {
		clean = "+" + reDigitsOnly.ReplaceAllString(clean[1:], "")
	} else {
		clean = reDigitsOnly.ReplaceAllString(clean, "")
	}

	return reBrazilCellular.MatchString(clean)
}

func NormalizeDigits(value string) string {
	return reDigitsOnly.ReplaceAllString(value, "")
}

func IsValidCPF(value string) bool {
	cpf := NormalizeDigits(value)

	if len(cpf) != 11 {
		return false
	}

	if allSameDigits(cpf) {
		return false
	}

	sum := 0
	for i := 0; i < 9; i++ {
		sum += int(cpf[i]-'0') * (10 - i)
	}

	digit := 11 - (sum % 11)
	if digit >= 10 {
		digit = 0
	}

	if digit != int(cpf[9]-'0') {
		return false
	}

	sum = 0
	for i := 0; i < 10; i++ {
		sum += int(cpf[i]-'0') * (11 - i)
	}

	digit = 11 - (sum % 11)
	if digit >= 10 {
		digit = 0
	}

	return digit == int(cpf[10]-'0')
}

func allSameDigits(value string) bool {
	if value == "" {
		return true
	}

	first := value[0]
	for i := 1; i < len(value); i++ {
		if value[i] != first {
			return false
		}
	}

	return true
}

func IsValidationError(err error) (ValidationError, bool) {
	var validationErr ValidationError
	if errors.As(err, &validationErr) {
		return validationErr, true
	}
	return ValidationError{}, false
}

func (e ValidationError) ValidationFields() map[string]string {
	return e.Fields
}
