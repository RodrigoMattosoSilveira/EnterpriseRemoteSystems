package people

import (
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

func ToDTO(person db.Person) PersonDTO {
	statusLabel := ""
	if person.Status.Label != "" {
		statusLabel = person.Status.Label
	}

	completion := computeCompletionForPerson(person)

	return PersonDTO{
		ID:             person.ID,
		GlobalPersonID: person.GlobalPersonID,
		MembershipID:   person.MembershipID,
		TenantID:       person.TenantID,

		FirstName: person.FirstName,
		LastName:  person.LastName,
		Nickname:  person.Nickname,

		CPF:      person.CPF,
		RG:       person.RG,
		Cellular: person.Cellular,
		Email:    person.Email,

		Street1: person.Street1,
		Street2: person.Street2,
		State:   person.State,
		CEP:     person.CEP,
		City:    person.City,
		Country: person.Country,

		BankName:        person.BankName,
		BankNumber:      person.BankNumber,
		CheckingAccount: person.CheckingAccount,
		PIXKey:          stringValue(person.PIXKey),

		EmergencyName:     person.EmergencyName,
		EmergencyCellular: person.EmergencyCellular,
		EmergencyEmail:    person.EmergencyEmail,

		ProfileCompletionStatus: completion.Status,
		CanCreateCollaborator:   completion.CanCreateCollaborator,
		MissingSections:         completion.MissingSections,

		StatusID:    person.StatusID,
		StatusLabel: statusLabel,
		Notes:       person.Notes,

		CreatedAt: formatTime(person.CreatedAt),
		UpdatedAt: formatTime(person.UpdatedAt),
	}
}

func ToDTOList(people []db.Person) []PersonDTO {
	items := make([]PersonDTO, 0, len(people))
	for _, person := range people {
		items = append(items, ToDTO(person))
	}
	return items
}

func computeCompletionForPerson(person db.Person) CompletionResult {
	return ComputeCompletion(completionInput{
		Street1:           person.Street1,
		State:             person.State,
		City:              person.City,
		Country:           person.Country,
		CEP:               person.CEP,
		BankName:          person.BankName,
		BankNumber:        person.BankNumber,
		CheckingAccount:   person.CheckingAccount,
		PIXKey:            stringValue(person.PIXKey),
		EmergencyName:     person.EmergencyName,
		EmergencyCellular: person.EmergencyCellular,
		EmergencyEmail:    person.EmergencyEmail,
	})
}

func formatTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}
func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func GlobalPersonToDTO(person db.GlobalPerson) GlobalPersonDTO {
	return GlobalPersonDTO{
		ID:        person.ID,
		FirstName: person.FirstName, LastName: person.LastName, Nickname: person.Nickname,
		CPF: person.CPF, RG: person.RG, Cellular: person.Cellular, Email: person.Email,
	}
}

func GlobalPersonToDTOList(rows []db.GlobalPerson) []GlobalPersonDTO {
	items := make([]GlobalPersonDTO, 0, len(rows))
	for _, row := range rows {
		items = append(items, GlobalPersonToDTO(row))
	}
	return items
}
