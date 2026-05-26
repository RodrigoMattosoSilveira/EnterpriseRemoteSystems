package people

type PersonDTO struct {
	ID string `json:"id"`

	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Nickname  string `json:"nickname"`

	CPF      string `json:"cpf"`
	RG       string `json:"rg"`
	Cellular string `json:"cellular"`
	Email    string `json:"email"`

	Street1 string `json:"street1,omitempty"`
	Street2 string `json:"street2,omitempty"`
	State   string `json:"state,omitempty"`
	CEP     string `json:"cep,omitempty"`
	City    string `json:"city,omitempty"`
	Country string `json:"country"`

	BankName        string `json:"bankName,omitempty"`
	BankNumber      string `json:"bankNumber,omitempty"`
	CheckingAccount string `json:"checkingAccount,omitempty"`
	PIXKey          string `json:"pixKey,omitempty"`

	EmergencyName     string `json:"emergencyName,omitempty"`
	EmergencyCellular string `json:"emergencyCellular,omitempty"`
	EmergencyEmail    string `json:"emergencyEmail,omitempty"`

	ProfileCompletionStatus string   `json:"profileCompletionStatus"`
	CanCreateCollaborator   bool     `json:"canCreateCollaborator"`
	MissingSections         []string `json:"missingSections,omitempty"`

	StatusID    string `json:"statusId"`
	StatusLabel string `json:"statusLabel,omitempty"`
	Notes       string `json:"notes,omitempty"`

	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type CreatePersonRequest struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Nickname  string `json:"nickname"`

	CPF      string `json:"cpf"`
	RG       string `json:"rg"`
	Cellular string `json:"cellular"`
	Email    string `json:"email"`

	StatusID string `json:"statusId"`
	PIXKey   string `json:"pixKey"`
}

type UpdatePersonRequest struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Nickname  string `json:"nickname"`

	CPF      string `json:"cpf"`
	RG       string `json:"rg"`
	Cellular string `json:"cellular"`
	Email    string `json:"email"`

	Street1 string `json:"street1,omitempty"`
	Street2 string `json:"street2,omitempty"`
	State   string `json:"state,omitempty"`
	CEP     string `json:"cep,omitempty"`
	City    string `json:"city,omitempty"`
	Country string `json:"country,omitempty"`

	BankName        string `json:"bankName,omitempty"`
	BankNumber      string `json:"bankNumber,omitempty"`
	CheckingAccount string `json:"checkingAccount,omitempty"`
	PIXKey          string `json:"pixKey,omitempty"`

	EmergencyName     string `json:"emergencyName,omitempty"`
	EmergencyCellular string `json:"emergencyCellular,omitempty"`
	EmergencyEmail    string `json:"emergencyEmail,omitempty"`

	StatusID string `json:"statusId"`
	Notes    string `json:"notes,omitempty"`
}

type PersonListFilter struct {
	Search                  string `query:"search"`
	StatusID                string `query:"statusId"`
	ProfileCompletionStatus string `query:"profileCompletionStatus"`
	CanCreateCollaborator   *bool  `query:"canCreateCollaborator"`
	Page                    int    `query:"page"`
	PageSize                int    `query:"pageSize"`
}
