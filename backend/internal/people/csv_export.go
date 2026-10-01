package people

import (
	"bytes"
	"encoding/csv"
)

// CanonicalCSVHeaders is the single People portability contract shared by the
// Tenant export and the import-people command. Keep ordering stable so an ERS
// export can be imported into another environment without spreadsheet changes.
func CanonicalCSVHeaders() []string {
	return []string{
		"firstName", "lastName", "nickname", "cpf", "rg", "cellular", "email", "statusId", "notes",
		"street1", "street2", "city", "state", "cep", "country",
		"bankName", "bankNumber", "checkingAccount", "pixKey",
		"emergencyName", "emergencyCellular", "emergencyEmail",
	}
}

// EncodeCanonicalCSV writes Tenant-scoped Person projections in the exact
// format accepted by import-people. Environment-specific IDs are deliberately
// excluded. The legacy-named statusId column carries the stable Person-status
// code when available so exports do not leak source-Tenant reference-data IDs.
// All remaining fields are canonical global Person data visible through this Tenant.
func EncodeCanonicalCSV(items []PersonDTO) ([]byte, error) {
	var buffer bytes.Buffer
	writer := csv.NewWriter(&buffer)
	if err := writer.Write(CanonicalCSVHeaders()); err != nil {
		return nil, err
	}
	for _, person := range items {
		statusValue := person.StatusCode
		if statusValue == "" {
			statusValue = person.StatusID
		}
		if err := writer.Write([]string{
			person.FirstName, person.LastName, person.Nickname, person.CPF, person.RG, person.Cellular, person.Email,
			statusValue, person.Notes,
			person.Street1, person.Street2, person.City, person.State, person.CEP, person.Country,
			person.BankName, person.BankNumber, person.CheckingAccount, person.PIXKey,
			person.EmergencyName, person.EmergencyCellular, person.EmergencyEmail,
		}); err != nil {
			return nil, err
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}
