package db

import "time"

type BaseModel struct {
	ID        string    `gorm:"type:text;primaryKey" json:"id"`
	CreatedAt time.Time `gorm:"not null" json:"createdAt"`
	UpdatedAt time.Time `gorm:"not null" json:"updatedAt"`
}

type ReferenceData struct {
	BaseModel
	Type         string `gorm:"type:text;not null;uniqueIndex:ux_reference_type_code;index:idx_reference_type_active_sort,priority:1" json:"type"`
	Code         string `gorm:"type:text;not null;uniqueIndex:ux_reference_type_code" json:"code"`
	Label        string `gorm:"type:text;not null" json:"label"`
	Description  string `gorm:"type:text" json:"description,omitempty"`
	Active       bool   `gorm:"not null;default:true;index:idx_reference_type_active_sort,priority:2" json:"active"`
	SortOrder    int    `gorm:"not null;default:0;index:idx_reference_type_active_sort,priority:3" json:"sortOrder"`
	MetadataJSON string `gorm:"type:text" json:"metadataJson,omitempty"`
}

type Person struct {
	BaseModel

	FirstName string `gorm:"type:text;not null" json:"firstName"`
	LastName  string `gorm:"type:text;not null" json:"lastName"`
	Nickname  string `gorm:"type:text;not null" json:"nickname"`

	CPF      string `gorm:"column:cpf;type:text;not null;uniqueIndex" json:"cpf"`
	RG       string `gorm:"column:rg;type:text;not null;uniqueIndex" json:"rg"`
	Cellular string `gorm:"type:text;not null;uniqueIndex" json:"cellular"`
	Email    string `gorm:"type:text;not null;uniqueIndex" json:"email"`

	Street1 string `gorm:"type:text" json:"street1,omitempty"`
	Street2 string `gorm:"type:text" json:"street2,omitempty"`
	State   string `gorm:"type:text" json:"state,omitempty"`
	CEP     string `gorm:"column:cep;type:text" json:"cep,omitempty"`
	City    string `gorm:"type:text" json:"city,omitempty"`
	Country string `gorm:"type:text;not null;default:Brasil" json:"country"`

	BankName        string  `gorm:"type:text" json:"bankName,omitempty"`
	BankNumber      string  `gorm:"type:text" json:"bankNumber,omitempty"`
	CheckingAccount string  `gorm:"type:text" json:"checkingAccount,omitempty"`
	PIXKey          *string `gorm:"column:pix_key;type:text;uniqueIndex" json:"pixKey,omitempty"`

	EmergencyName     string `gorm:"type:text" json:"emergencyName,omitempty"`
	EmergencyCellular string `gorm:"type:text" json:"emergencyCellular,omitempty"`
	EmergencyEmail    string `gorm:"type:text" json:"emergencyEmail,omitempty"`

	ProfileCompletionStatus string `gorm:"type:text;not null;default:PERSONAL_ONLY;index" json:"profileCompletionStatus"`
	CanCreateCollaborator   bool   `gorm:"not null;default:false;index" json:"canCreateCollaborator"`

	StatusID string `gorm:"type:text;not null;index" json:"statusId"`
	Notes    string `gorm:"type:text" json:"notes,omitempty"`

	Status ReferenceData `gorm:"foreignKey:StatusID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"status,omitempty"`
	// Journeys []CollaboratorJourney `gorm:"foreignKey:PersonID" json:"journeys,omitempty"`
}
