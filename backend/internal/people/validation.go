package people

import (
	"errors"
	"regexp"
	"strings"
	"unicode"

	"enterpriseremotesystems/backend/internal/shared/fielderrors"
)

var (
	ErrApplicationSecuritySuspended = errors.New("authentication account is security-suspended")
	ErrTenantReactivationRequired   = errors.New("inactive Person-Tenant Membership must be reactivated through the Tenant reactivation workflow")

	reDigitsOnly     = regexp.MustCompile(`\D`)
	reEmail          = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	reBrazilCellular = regexp.MustCompile(`^\+?55?[1-9]{2}9[0-9]{8}$|^[1-9]{2}9[0-9]{8}$`)
	reRG             = regexp.MustCompile(`^[A-Za-z0-9.\-]{5,20}$`)
	reCEPDigits      = regexp.MustCompile(`^[0-9]{8}$`)
)

// ValidationError carries English field messages plus a stable rule code per
// field (Codes), which clients translate. See internal/shared/fielderrors.
type ValidationError struct {
	Fields map[string]string
	Codes  map[string]string
}

func (e ValidationError) Error() string {
	return "validation failed"
}

// Stable People rule codes returned as `fieldCodes` (shared ones live in
// fielderrors). Renaming one is an API change.
const (
	RuleInvalidCPF                = "invalid_cpf"
	RuleInvalidRG                 = "invalid_rg"
	RuleInvalidCellular           = "invalid_cellular"
	RuleInvalidEmail              = "invalid_email"
	RuleInvalidCEP                = "invalid_cep"
	RuleInvalidCountry            = "invalid_country"
	RuleAlreadyExists             = "already_exists"
	RuleAlreadyTenantMember       = "already_tenant_member"
	RuleInactivePersonStatus      = "inactive_person_status"
	RuleTenantStatusMissing       = "tenant_person_status_missing"
	RuleOnlyInactiveReactivatable = "only_inactive_reactivatable"
	RulePhotoInvalidType          = "photo_invalid_type"
	RulePhotoInvalidSize          = "photo_invalid_size"
	RulePhotoInvalidImage         = "photo_invalid_image"
	RulePhotoTypeMismatch         = "photo_type_mismatch"
	RulePhotoInvalidDimensions    = "photo_invalid_dimensions"
	RulePhotoNormalizedTooLarge   = "photo_normalized_too_large"
)

func validationError(errs *fielderrors.Collector) error {
	if errs.Empty() {
		return nil
	}
	return ValidationError{Fields: errs.Fields, Codes: errs.Codes}
}

func fieldError(field string, rule string, message string) ValidationError {
	fields, codes := fielderrors.Single(field, rule, message)
	return ValidationError{Fields: fields, Codes: codes}
}

func ValidateCreatePerson(req CreatePersonRequest) error {
	errs := fielderrors.New()

	errs.Require("firstName", req.FirstName)
	errs.Require("lastName", req.LastName)
	errs.Require("nickname", req.Nickname)
	errs.Require("cpf", req.CPF)
	errs.Require("rg", req.RG)
	errs.Require("cellular", req.Cellular)
	errs.Require("email", req.Email)
	errs.Require("statusId", req.StatusID)

	if req.CPF != "" && !IsValidCPF(req.CPF) {
		errs.Add("cpf", RuleInvalidCPF, "CPF is invalid")
	}

	if req.RG != "" && !IsValidRG(req.RG) {
		errs.Add("rg", RuleInvalidRG, "RG is invalid")
	}

	if req.Cellular != "" && !IsValidBrazilianCellular(req.Cellular) {
		errs.Add("cellular", RuleInvalidCellular, "Cellular must be a valid Brazilian mobile number")
	}

	if req.Email != "" && !IsValidEmail(req.Email) {
		errs.Add("email", RuleInvalidEmail, "Email is invalid")
	}

	return validationError(errs)
}

func ValidateUpdatePerson(req UpdatePersonRequest) error {
	errs := fielderrors.New()

	errs.Require("firstName", req.FirstName)
	errs.Require("lastName", req.LastName)
	errs.Require("nickname", req.Nickname)
	errs.Require("cpf", req.CPF)
	errs.Require("rg", req.RG)
	errs.Require("cellular", req.Cellular)
	errs.Require("email", req.Email)
	errs.Require("statusId", req.StatusID)

	if req.CPF != "" && !IsValidCPF(req.CPF) {
		errs.Add("cpf", RuleInvalidCPF, "CPF is invalid")
	}

	if req.RG != "" && !IsValidRG(req.RG) {
		errs.Add("rg", RuleInvalidRG, "RG is invalid")
	}

	if req.Cellular != "" && !IsValidBrazilianCellular(req.Cellular) {
		errs.Add("cellular", RuleInvalidCellular, "Cellular must be a valid Brazilian mobile number")
	}

	if req.Email != "" && !IsValidEmail(req.Email) {
		errs.Add("email", RuleInvalidEmail, "Email is invalid")
	}

	if req.CEP != "" && !IsValidCEP(req.CEP) {
		errs.Add("cep", RuleInvalidCEP, "CEP is invalid")
	}

	if req.EmergencyCellular != "" && !IsValidBrazilianCellular(req.EmergencyCellular) {
		errs.Add("emergencyCellular", RuleInvalidCellular, "Emergency cellular must be a valid Brazilian mobile number")
	}

	if req.EmergencyEmail != "" && !IsValidEmail(req.EmergencyEmail) {
		errs.Add("emergencyEmail", RuleInvalidEmail, "Emergency email is invalid")
	}

	if req.Country != "" && req.Country != "Brasil" {
		errs.Add("country", RuleInvalidCountry, "Country must be Brasil")
	}

	return validationError(errs)
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

func (e ValidationError) ValidationFieldCodes() map[string]string {
	return e.Codes
}
