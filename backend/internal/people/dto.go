package people

type PersonDTO struct {
	ID             string `json:"id"`
	GlobalPersonID string `json:"globalPersonId"`
	MembershipID   string `json:"membershipId"`
	TenantID       string `json:"tenantId"`

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
	City    string `json:"city,omitempty"`
	CEP     string `json:"cep,omitempty"`
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

	Street1 string `json:"street1"`
	Street2 string `json:"street2"`
	State   string `json:"state"`
	CEP     string `json:"cep"`
	City    string `json:"city"`
	Country string `json:"country"`

	BankName        string `json:"bankName"`
	BankNumber      string `json:"bankNumber"`
	CheckingAccount string `json:"checkingAccount"`
	PIXKey          string `json:"pixKey"`

	EmergencyName     string `json:"emergencyName"`
	EmergencyCellular string `json:"emergencyCellular"`
	EmergencyEmail    string `json:"emergencyEmail"`

	StatusID string `json:"statusId"`
	Notes    string `json:"notes"`
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

// GlobalPersonDTO is the deliberately minimal global-directory projection used
// by a Tenant Administrator to locate a Person before creating a Membership.
// It never exposes address, banking, emergency, membership, Actor, Collaborator,
// role, financial, or other-tenant relationship data.
type GlobalPersonDTO struct {
	ID string `json:"id"`

	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Nickname  string `json:"nickname"`

	CPF      string `json:"cpf"`
	RG       string `json:"rg"`
	Cellular string `json:"cellular"`
	Email    string `json:"email"`
}

type GlobalPersonSearchFilter struct {
	Search   string `query:"search"`
	Page     int    `query:"page"`
	PageSize int    `query:"pageSize"`
}

type CreatePersonMembershipRequest struct {
	PersonID string `json:"personId"`
	StatusID string `json:"statusId"`
	Notes    string `json:"notes"`
}
