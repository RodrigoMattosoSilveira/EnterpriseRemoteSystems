package db

import "time"

type BaseModel struct {
	ID        string    `gorm:"type:text;primaryKey" json:"id"`
	CreatedAt time.Time `gorm:"not null" json:"createdAt"`
	UpdatedAt time.Time `gorm:"not null" json:"updatedAt"`
}

type CollaboratorJourney struct {
	BaseModel

	TenantID string `gorm:"type:text;not null;default:default;index" json:"tenantId"`
	PersonID string `gorm:"type:text;not null;index" json:"personId"`

	JourneyStartDate time.Time `gorm:"type:date;not null" json:"journeyStartDate"`
	DefaultEndDate   time.Time `gorm:"type:date;not null" json:"defaultEndDate"`
	ExtensionDays    int       `gorm:"not null;default:0" json:"extensionDays"`
	ProjectedEndDate time.Time `gorm:"type:date;not null;index" json:"projectedEndDate"`

	PaymentMethodID string  `gorm:"type:text;not null;index" json:"paymentMethodId"`
	PaymentValue    float64 `gorm:"not null" json:"paymentValue"`

	SectorID   string `gorm:"type:text;not null;index" json:"sectorId"`
	LocationID string `gorm:"type:text;not null;index" json:"locationId"`
	TaskID     string `gorm:"type:text;not null;index" json:"taskId"`
	StatusID   string `gorm:"type:text;not null;index" json:"statusId"`

	Notes    string     `gorm:"type:text" json:"notes,omitempty"`
	ClosedAt *time.Time `json:"closedAt,omitempty"`

	Person        Person        `gorm:"foreignKey:PersonID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"person,omitempty"`
	PaymentMethod ReferenceData `gorm:"foreignKey:PaymentMethodID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"paymentMethod,omitempty"`
	Sector        ReferenceData `gorm:"foreignKey:SectorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"sector,omitempty"`
	Location      ReferenceData `gorm:"foreignKey:LocationID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"location,omitempty"`
	Task          ReferenceData `gorm:"foreignKey:TaskID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"task,omitempty"`
	Status        ReferenceData `gorm:"foreignKey:StatusID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"status,omitempty"`
}

type ReferenceData struct {
	BaseModel
	TenantID     string `gorm:"type:text;not null;default:default;uniqueIndex:ux_reference_tenant_type_code,priority:1;uniqueIndex:ux_reference_tenant_type_label,priority:1;index:idx_reference_tenant_type_active_sort,priority:1" json:"tenantId"`
	Type         string `gorm:"type:text;not null;uniqueIndex:ux_reference_tenant_type_code,priority:2;uniqueIndex:ux_reference_tenant_type_label,priority:2;index:idx_reference_tenant_type_active_sort,priority:2" json:"type"`
	Code         string `gorm:"type:text;not null;uniqueIndex:ux_reference_tenant_type_code,priority:3" json:"code"`
	Label        string `gorm:"type:text;not null;uniqueIndex:ux_reference_tenant_type_label,priority:3" json:"label"`
	Description  string `gorm:"type:text" json:"description,omitempty"`
	Active       bool   `gorm:"not null;default:true;index:idx_reference_tenant_type_active_sort,priority:3" json:"active"`
	SortOrder    int    `gorm:"not null;default:0;index:idx_reference_tenant_type_active_sort,priority:4" json:"sortOrder"`
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
	City    string `gorm:"type:text" json:"city,omitempty"`
	CEP     string `gorm:"column:cep;type:text" json:"cep,omitempty"`
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

	Status   ReferenceData         `gorm:"foreignKey:StatusID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"status,omitempty"`
	Journeys []CollaboratorJourney `gorm:"foreignKey:PersonID" json:"journeys,omitempty"`
}
