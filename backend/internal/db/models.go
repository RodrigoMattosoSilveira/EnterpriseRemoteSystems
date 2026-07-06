package db

import "time"

type BaseModel struct {
	ID        string    `gorm:"type:text;primaryKey" json:"id"`
	CreatedAt time.Time `gorm:"not null" json:"createdAt"`
	UpdatedAt time.Time `gorm:"not null" json:"updatedAt"`
}

const DefaultTenantID = "default"

type Tenant struct {
	BaseModel

	Code        string `gorm:"type:text;not null;uniqueIndex" json:"code"`
	Name        string `gorm:"type:text;not null" json:"name"`
	Description string `gorm:"type:text" json:"description,omitempty"`
	Active      bool   `gorm:"not null;default:true;index" json:"active"`

	ReferenceData         []ReferenceData        `gorm:"foreignKey:TenantID" json:"referenceData,omitempty"`
	People                []Person               `gorm:"foreignKey:TenantID" json:"people,omitempty"`
	Collaborators         []CollaboratorJourney  `gorm:"foreignKey:TenantID" json:"collaborators,omitempty"`
	Expenses              []Expense              `gorm:"foreignKey:TenantID" json:"expenses,omitempty"`
	ExpensePriceListItems []ExpensePriceListItem `gorm:"foreignKey:TenantID" json:"expensePriceListItems,omitempty"`
	GoldPrices            []GoldPrice            `gorm:"foreignKey:TenantID" json:"goldPrices,omitempty"`
	WorkPeriods           []WorkPeriod           `gorm:"foreignKey:TenantID" json:"workPeriods,omitempty"`
	WorkPeriodAssignments []WorkPeriodAssignment `gorm:"foreignKey:TenantID" json:"workPeriodAssignments,omitempty"`
	GoldProductionEntries []GoldProductionEntry  `gorm:"foreignKey:TenantID" json:"goldProductionEntries,omitempty"`
	AccrualRuns           []AccrualRun           `gorm:"foreignKey:TenantID" json:"accrualRuns,omitempty"`
	AccrualItems          []AccrualItem          `gorm:"foreignKey:TenantID" json:"accrualItems,omitempty"`
	LedgerEntries         []LedgerEntry          `gorm:"foreignKey:TenantID" json:"ledgerEntries,omitempty"`
	JourneySettlements    []JourneySettlement    `gorm:"foreignKey:TenantID" json:"journeySettlements,omitempty"`
	LedgerReceipts        []LedgerReceipt        `gorm:"foreignKey:TenantID" json:"ledgerReceipts,omitempty"`
	TenantSettings        []TenantSetting        `gorm:"foreignKey:TenantID" json:"tenantSettings,omitempty"`
}

type TenantSetting struct {
	BaseModel

	TenantID    string `gorm:"type:text;not null;default:default;uniqueIndex:ux_tenant_settings_tenant_key,priority:1;index" json:"tenantId"`
	Key         string `gorm:"type:text;not null;uniqueIndex:ux_tenant_settings_tenant_key,priority:2" json:"key"`
	Value       string `gorm:"type:text;not null" json:"value"`
	Description string `gorm:"type:text" json:"description,omitempty"`
	UpdatedBy   string `gorm:"type:text;not null" json:"updatedBy"`

	Tenant Tenant `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
}

type CollaboratorJourney struct {
	BaseModel

	TenantID string `gorm:"type:text;not null;default:default;index" json:"tenantId"`
	PersonID string `gorm:"type:text;not null;index" json:"personId"`

	JourneyStartDate time.Time `gorm:"type:date;not null" json:"journeyStartDate"`
	DefaultEndDate   time.Time `gorm:"type:date;not null" json:"defaultEndDate"`
	ExtensionDays    int       `gorm:"not null;default:0" json:"extensionDays"`
	ProjectedEndDate time.Time `gorm:"type:date;not null;index" json:"projectedEndDate"`

	PaymentMethodID                string   `gorm:"type:text;not null;index" json:"paymentMethodId"`
	PaymentValue                   float64  `gorm:"not null" json:"paymentValue"` // Deprecated compatibility field. Use the explicit payment amount fields below.
	FixedMonthlyBRLAmount          *float64 `gorm:"column:fixed_monthly_brl_amount" json:"fixedMonthlyBrlAmount,omitempty"`
	DailyBRLAmount                 *float64 `gorm:"column:daily_brl_amount" json:"dailyBrlAmount,omitempty"`
	GoldCommissionPercent          *float64 `gorm:"column:gold_commission_percent" json:"goldCommissionPercent,omitempty"`
	TimeOffGoldSplitPercent        *float64 `gorm:"column:time_off_gold_split_percent" json:"timeOffGoldSplitPercent,omitempty"`
	SickDayOffReplacementGoldGrams *float64 `gorm:"column:sick_day_off_replacement_gold_grams" json:"sickDayOffReplacementGoldGrams,omitempty"`
	PlanningAvailability           string   `gorm:"column:planning_availability;type:text;not null;default:ACTIVE;index" json:"planningAvailability"`

	SectorID   string `gorm:"type:text;not null;index" json:"sectorId"`
	LocationID string `gorm:"type:text;not null;index" json:"locationId"`
	TaskID     string `gorm:"type:text;not null;index" json:"taskId"`
	StatusID   string `gorm:"type:text;not null;index" json:"statusId"`

	Notes    string     `gorm:"type:text" json:"notes,omitempty"`
	ClosedAt *time.Time `json:"closedAt,omitempty"`

	Tenant             Tenant              `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
	Person             Person              `gorm:"foreignKey:PersonID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"person,omitempty"`
	PaymentMethod      ReferenceData       `gorm:"foreignKey:PaymentMethodID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"paymentMethod,omitempty"`
	Sector             ReferenceData       `gorm:"foreignKey:SectorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"sector,omitempty"`
	Location           ReferenceData       `gorm:"foreignKey:LocationID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"location,omitempty"`
	Task               ReferenceData       `gorm:"foreignKey:TaskID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"task,omitempty"`
	Status             ReferenceData       `gorm:"foreignKey:StatusID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"status,omitempty"`
	JourneySettlements []JourneySettlement `gorm:"foreignKey:CollaboratorID" json:"journeySettlements,omitempty"`
	LedgerReceipts     []LedgerReceipt     `gorm:"foreignKey:CollaboratorID" json:"ledgerReceipts,omitempty"`
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

	Tenant Tenant `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
}

type Person struct {
	BaseModel

	TenantID string `gorm:"type:text;not null;default:default;uniqueIndex:ux_people_tenant_cpf,priority:1;uniqueIndex:ux_people_tenant_rg,priority:1;uniqueIndex:ux_people_tenant_cellular,priority:1;uniqueIndex:ux_people_tenant_email,priority:1;uniqueIndex:ux_people_tenant_pix_key,priority:1;index" json:"tenantId"`

	FirstName string `gorm:"type:text;not null" json:"firstName"`
	LastName  string `gorm:"type:text;not null" json:"lastName"`
	Nickname  string `gorm:"type:text;not null" json:"nickname"`

	CPF      string `gorm:"column:cpf;type:text;not null;uniqueIndex:ux_people_tenant_cpf,priority:2" json:"cpf"`
	RG       string `gorm:"column:rg;type:text;not null;uniqueIndex:ux_people_tenant_rg,priority:2" json:"rg"`
	Cellular string `gorm:"type:text;not null;uniqueIndex:ux_people_tenant_cellular,priority:2" json:"cellular"`
	Email    string `gorm:"type:text;not null;uniqueIndex:ux_people_tenant_email,priority:2" json:"email"`

	Street1 string `gorm:"type:text" json:"street1,omitempty"`
	Street2 string `gorm:"type:text" json:"street2,omitempty"`
	State   string `gorm:"type:text" json:"state,omitempty"`
	City    string `gorm:"type:text" json:"city,omitempty"`
	CEP     string `gorm:"column:cep;type:text" json:"cep,omitempty"`
	Country string `gorm:"type:text;not null;default:Brasil" json:"country"`

	BankName        string  `gorm:"type:text" json:"bankName,omitempty"`
	BankNumber      string  `gorm:"type:text" json:"bankNumber,omitempty"`
	CheckingAccount string  `gorm:"type:text" json:"checkingAccount,omitempty"`
	PIXKey          *string `gorm:"column:pix_key;type:text;uniqueIndex:ux_people_tenant_pix_key,priority:2" json:"pixKey,omitempty"`

	EmergencyName     string `gorm:"type:text" json:"emergencyName,omitempty"`
	EmergencyCellular string `gorm:"type:text" json:"emergencyCellular,omitempty"`
	EmergencyEmail    string `gorm:"type:text" json:"emergencyEmail,omitempty"`

	ProfileCompletionStatus string `gorm:"type:text;not null;default:PERSONAL_ONLY;index" json:"profileCompletionStatus"`
	CanCreateCollaborator   bool   `gorm:"not null;default:false;index" json:"canCreateCollaborator"`

	StatusID string `gorm:"type:text;not null;index" json:"statusId"`
	Notes    string `gorm:"type:text" json:"notes,omitempty"`

	Tenant   Tenant                `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
	Status   ReferenceData         `gorm:"foreignKey:StatusID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"status,omitempty"`
	Journeys []CollaboratorJourney `gorm:"foreignKey:PersonID" json:"journeys,omitempty"`
}

type ExpensePriceListItem struct {
	BaseModel

	TenantID                  string  `gorm:"type:text;not null;default:default;index:idx_expense_price_list_items_tenant_type_active_sort,priority:1" json:"tenantId"`
	ItemType                  string  `gorm:"type:text;not null;index:idx_expense_price_list_items_tenant_type_active_sort,priority:2" json:"itemType"`
	Code                      string  `gorm:"type:text;not null" json:"code"`
	Description               string  `gorm:"type:text;not null" json:"description"`
	UnitPriceBRL              float64 `gorm:"column:unit_price_brl;not null" json:"unitPriceBrl"`
	Active                    bool    `gorm:"not null;default:true;index:idx_expense_price_list_items_tenant_type_active_sort,priority:3" json:"active"`
	SortOrder                 int     `gorm:"not null;default:0;index:idx_expense_price_list_items_tenant_type_active_sort,priority:4" json:"sortOrder"`
	SupersededPriceListItemID *string `gorm:"type:text;index" json:"supersededPriceListItemId,omitempty"`

	Tenant   Tenant    `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
	Expenses []Expense `gorm:"foreignKey:PriceListItemID" json:"expenses,omitempty"`
}

type GoldPrice struct {
	BaseModel

	TenantID   string  `gorm:"type:text;not null;default:default;index:idx_gold_prices_tenant_active_date,priority:1" json:"tenantId"`
	PriceDate  string  `gorm:"type:date;not null;index:idx_gold_prices_tenant_active_date,priority:3" json:"priceDate"`
	BRLPerGram float64 `gorm:"column:brl_per_gram;not null" json:"brlPerGram"`
	RecordedBy string  `gorm:"type:text;not null" json:"recordedBy"`
	Notes      string  `gorm:"type:text" json:"notes,omitempty"`
	Active     bool    `gorm:"not null;default:true;index:idx_gold_prices_tenant_active_date,priority:2" json:"active"`

	Tenant   Tenant    `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
	Expenses []Expense `gorm:"foreignKey:GoldPriceID" json:"expenses,omitempty"`
}

type Expense struct {
	BaseModel

	TenantID          string    `gorm:"type:text;not null;default:default;index" json:"tenantId"`
	CollaboratorID    string    `gorm:"type:text;not null;index" json:"collaboratorId"`
	ExpenseCategoryID string    `gorm:"type:text;not null;index" json:"expenseCategoryId"`
	ValueUnitID       string    `gorm:"type:text;not null;index" json:"valueUnitId"`
	Amount            float64   `gorm:"not null" json:"amount"`
	ExpenseDate       time.Time `gorm:"type:date;not null;index" json:"expenseDate"`
	Description       string    `gorm:"type:text" json:"description,omitempty"`
	Active            bool      `gorm:"not null;default:true;index" json:"active"`

	PriceListItemID        *string  `gorm:"type:text;index" json:"priceListItemId,omitempty"`
	PriceListItemCode      string   `gorm:"type:text;index" json:"priceListItemCode,omitempty"`
	ItemType               string   `gorm:"type:text;index" json:"itemType,omitempty"`
	ItemDescription        string   `gorm:"type:text" json:"itemDescription,omitempty"`
	Quantity               *float64 `json:"quantity,omitempty"`
	UnitPriceBRL           *float64 `gorm:"column:unit_price_brl" json:"unitPriceBrl,omitempty"`
	CurrencyCode           string   `gorm:"type:text;index" json:"currencyCode,omitempty"`
	GoldPriceID            *string  `gorm:"type:text;index" json:"goldPriceId,omitempty"`
	GoldBRLPerGram         *float64 `gorm:"column:gold_brl_per_gram" json:"goldBrlPerGram,omitempty"`
	GoldPriceDate          string   `gorm:"type:date" json:"goldPriceDate,omitempty"`
	UnitPriceAmount        *float64 `json:"unitPriceAmount,omitempty"`
	TotalAmount            *float64 `json:"totalAmount,omitempty"`
	CalculationMethod      string   `gorm:"type:text" json:"calculationMethod,omitempty"`
	CalculationDetailsJSON string   `gorm:"type:text" json:"calculationDetailsJson,omitempty"`

	Tenant          Tenant                `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
	Collaborator    CollaboratorJourney   `gorm:"foreignKey:CollaboratorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"collaborator,omitempty"`
	ExpenseCategory ReferenceData         `gorm:"foreignKey:ExpenseCategoryID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"expenseCategory,omitempty"`
	ValueUnit       ReferenceData         `gorm:"foreignKey:ValueUnitID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"valueUnit,omitempty"`
	PriceListItem   *ExpensePriceListItem `gorm:"foreignKey:PriceListItemID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"priceListItem,omitempty"`
	GoldPrice       *GoldPrice            `gorm:"foreignKey:GoldPriceID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"goldPrice,omitempty"`
}

type JourneySettlement struct {
	BaseModel

	TenantID            string     `gorm:"type:text;not null;default:default;uniqueIndex:ux_journey_settlements_request,priority:1;index" json:"tenantId"`
	CollaboratorID      string     `gorm:"type:text;not null;uniqueIndex:ux_journey_settlements_request,priority:2;index" json:"collaboratorId"`
	SettlementType      string     `gorm:"type:text;not null;index" json:"settlementType"`
	RequestID           string     `gorm:"type:text;not null;uniqueIndex:ux_journey_settlements_request,priority:3" json:"requestId"`
	Status              string     `gorm:"type:text;not null;default:POSTED;index" json:"status"`
	EffectiveDate       time.Time  `gorm:"type:date;not null;index" json:"effectiveDate"`
	BRLAmount           float64    `gorm:"column:brl_amount;not null;default:0" json:"brlAmount"`
	GoldGramAmount      float64    `gorm:"column:gold_gram_amount;not null;default:0" json:"goldGramAmount"`
	Notes               string     `gorm:"type:text" json:"notes,omitempty"`
	ReasonCode          string     `gorm:"type:text;index" json:"reasonCode,omitempty"`
	ReasonText          string     `gorm:"type:text" json:"reasonText,omitempty"`
	AuthorizedBy        string     `gorm:"type:text;index" json:"authorizedBy,omitempty"`
	AuthorizedAt        *time.Time `json:"authorizedAt,omitempty"`
	SecondApprovedBy    string     `gorm:"type:text;index" json:"secondApprovedBy,omitempty"`
	SecondApprovedAt    *time.Time `json:"secondApprovedAt,omitempty"`
	SecondApprovalNotes string     `gorm:"type:text" json:"secondApprovalNotes,omitempty"`

	Tenant       Tenant              `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
	Collaborator CollaboratorJourney `gorm:"foreignKey:CollaboratorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"collaborator,omitempty"`
}

type LedgerReceipt struct {
	BaseModel

	TenantID           string     `gorm:"type:text;not null;default:default;uniqueIndex:ux_ledger_receipts_tenant_number,priority:1;index" json:"tenantId"`
	CollaboratorID     string     `gorm:"type:text;not null;index" json:"collaboratorId"`
	LedgerEntryID      string     `gorm:"type:text;not null;uniqueIndex" json:"ledgerEntryId"`
	ReceiptNumber      *string    `gorm:"type:text;uniqueIndex:ux_ledger_receipts_tenant_number,priority:2" json:"receiptNumber,omitempty"`
	ReceiptType        string     `gorm:"type:text;not null;default:LEDGER_DEBIT;index" json:"receiptType"`
	Status             string     `gorm:"type:text;not null;default:PENDING_ISSUE;index" json:"status"`
	IssuedAt           *time.Time `json:"issuedAt,omitempty"`
	IssuedBy           string     `gorm:"type:text;index" json:"issuedBy,omitempty"`
	PrintedAt          *time.Time `json:"printedAt,omitempty"`
	SignedAt           *time.Time `json:"signedAt,omitempty"`
	ReturnedAt         *time.Time `json:"returnedAt,omitempty"`
	ReceivedBy         string     `gorm:"type:text;index" json:"receivedBy,omitempty"`
	SignedDocumentRef  string     `gorm:"type:text" json:"signedDocumentRef,omitempty"`
	CancelledAt        *time.Time `json:"cancelledAt,omitempty"`
	CancelledBy        string     `gorm:"type:text;index" json:"cancelledBy,omitempty"`
	CancellationReason string     `gorm:"type:text" json:"cancellationReason,omitempty"`
	Notes              string     `gorm:"type:text" json:"notes,omitempty"`

	Tenant       Tenant              `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
	Collaborator CollaboratorJourney `gorm:"foreignKey:CollaboratorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"collaborator,omitempty"`
	LedgerEntry  LedgerEntry         `gorm:"foreignKey:LedgerEntryID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"ledgerEntry,omitempty"`
}

type WorkPeriod struct {
	BaseModel

	TenantID        string     `gorm:"type:text;not null;default:default;uniqueIndex:ux_work_period_tenant_date_code,priority:1;index" json:"tenantId"`
	WorkDate        time.Time  `gorm:"type:date;not null;uniqueIndex:ux_work_period_tenant_date_code,priority:2;index" json:"workDate"`
	PeriodCode      string     `gorm:"type:text;not null;uniqueIndex:ux_work_period_tenant_date_code,priority:3;index" json:"periodCode"`
	Name            string     `gorm:"type:text;not null" json:"name"`
	StartsAt        time.Time  `gorm:"not null;index" json:"startsAt"`
	EndsAt          time.Time  `gorm:"not null;index" json:"endsAt"`
	Status          string     `gorm:"type:text;not null;default:PLANNING;index" json:"status"`
	InformedAt      *time.Time `json:"informedAt,omitempty"`
	AccrualOpenedAt *time.Time `json:"accrualOpenedAt,omitempty"`
	ClosedAt        *time.Time `json:"closedAt,omitempty"`

	Tenant      Tenant                 `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
	Assignments []WorkPeriodAssignment `gorm:"foreignKey:WorkPeriodID" json:"assignments,omitempty"`
	AccrualRuns []AccrualRun           `gorm:"foreignKey:WorkPeriodID" json:"accrualRuns,omitempty"`
}

type WorkPeriodAssignment struct {
	BaseModel

	TenantID                   string  `gorm:"type:text;not null;default:default;uniqueIndex:ux_work_period_assignments_active_collaborator,priority:1;index" json:"tenantId"`
	WorkPeriodID               string  `gorm:"type:text;not null;uniqueIndex:ux_work_period_assignments_active_collaborator,priority:2;index" json:"workPeriodId"`
	CollaboratorID             string  `gorm:"type:text;not null;uniqueIndex:ux_work_period_assignments_active_collaborator,priority:3;index" json:"collaboratorId"`
	PlannedStatus              string  `gorm:"type:text;not null;index" json:"plannedStatus"`
	PlanningAvailability       string  `gorm:"type:text;not null;default:ACTIVE;index" json:"planningAvailability"`
	ActualStatus               *string `gorm:"type:text" json:"actualStatus,omitempty"`
	ReplacementForAssignmentID *string `gorm:"type:text;index" json:"replacementForAssignmentId,omitempty"`
	SectorID                   string  `gorm:"type:text;not null;index" json:"sectorId"`
	LocationID                 string  `gorm:"type:text;not null;index" json:"locationId"`
	TaskID                     string  `gorm:"type:text;not null;index" json:"taskId"`
	Active                     bool    `gorm:"not null;default:true;uniqueIndex:ux_work_period_assignments_active_collaborator,priority:4;index" json:"active"`

	Tenant                   Tenant                `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
	WorkPeriod               WorkPeriod            `gorm:"foreignKey:WorkPeriodID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"workPeriod,omitempty"`
	Collaborator             CollaboratorJourney   `gorm:"foreignKey:CollaboratorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"collaborator,omitempty"`
	ReplacementForAssignment *WorkPeriodAssignment `gorm:"foreignKey:ReplacementForAssignmentID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"replacementForAssignment,omitempty"`
	Sector                   ReferenceData         `gorm:"foreignKey:SectorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"sector,omitempty"`
	Location                 ReferenceData         `gorm:"foreignKey:LocationID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"location,omitempty"`
	Task                     ReferenceData         `gorm:"foreignKey:TaskID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"task,omitempty"`
}

type GoldProductionEntry struct {
	BaseModel

	TenantID          string    `gorm:"type:text;not null;default:default;uniqueIndex:ux_gold_production_entries_active_period_location_date,priority:1;index" json:"tenantId"`
	WorkPeriodID      string    `gorm:"type:text;not null;uniqueIndex:ux_gold_production_entries_active_period_location_date,priority:2;index" json:"workPeriodId"`
	LocationID        string    `gorm:"type:text;not null;uniqueIndex:ux_gold_production_entries_active_period_location_date,priority:3;index" json:"locationId"`
	ProductionDate    time.Time `gorm:"type:date;not null;uniqueIndex:ux_gold_production_entries_active_period_location_date,priority:4;index" json:"productionDate"`
	GoldGramsProduced float64   `gorm:"not null" json:"goldGramsProduced"`
	Active            bool      `gorm:"not null;default:true;uniqueIndex:ux_gold_production_entries_active_period_location_date,priority:5;index" json:"active"`
	Notes             string    `gorm:"type:text" json:"notes,omitempty"`

	Tenant     Tenant        `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
	WorkPeriod WorkPeriod    `gorm:"foreignKey:WorkPeriodID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"workPeriod,omitempty"`
	Location   ReferenceData `gorm:"foreignKey:LocationID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"location,omitempty"`
}

type AccrualRun struct {
	BaseModel

	TenantID     string    `gorm:"type:text;not null;default:default;index" json:"tenantId"`
	WorkPeriodID string    `gorm:"type:text;not null;index" json:"workPeriodId"`
	Status       string    `gorm:"type:text;not null;index" json:"status"`
	AccrualDate  time.Time `gorm:"type:date;not null;index" json:"accrualDate"`
	Notes        string    `gorm:"type:text" json:"notes,omitempty"`

	Tenant     Tenant        `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
	WorkPeriod WorkPeriod    `gorm:"foreignKey:WorkPeriodID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"workPeriod,omitempty"`
	Items      []AccrualItem `gorm:"foreignKey:AccrualRunID" json:"items,omitempty"`
}

type AccrualItem struct {
	BaseModel

	TenantID               string   `gorm:"type:text;not null;default:default;index" json:"tenantId"`
	AccrualRunID           string   `gorm:"type:text;not null;index" json:"accrualRunId"`
	WorkPeriodID           string   `gorm:"type:text;not null;index" json:"workPeriodId"`
	WorkPeriodAssignmentID *string  `gorm:"type:text;index" json:"workPeriodAssignmentId,omitempty"`
	CollaboratorID         string   `gorm:"type:text;not null;index" json:"collaboratorId"`
	CalculationType        string   `gorm:"type:text;not null;index" json:"calculationType"`
	Direction              string   `gorm:"type:text;not null;default:CREDIT;index" json:"direction"`
	BRLAmount              *float64 `gorm:"column:brl_amount" json:"brlAmount,omitempty"`
	GoldGramAmount         *float64 `gorm:"column:gold_gram_amount" json:"goldGramAmount,omitempty"`
	Status                 string   `gorm:"type:text;not null;index" json:"status"`
	PendingReason          string   `gorm:"type:text;index" json:"pendingReason,omitempty"`
	Description            string   `gorm:"type:text" json:"description,omitempty"`

	Tenant               Tenant                `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
	AccrualRun           AccrualRun            `gorm:"foreignKey:AccrualRunID;constraint:OnUpdate:Restrict,OnDelete:Cascade;" json:"accrualRun,omitempty"`
	WorkPeriod           WorkPeriod            `gorm:"foreignKey:WorkPeriodID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"workPeriod,omitempty"`
	WorkPeriodAssignment *WorkPeriodAssignment `gorm:"foreignKey:WorkPeriodAssignmentID;constraint:OnUpdate:Restrict,OnDelete:SET NULL;" json:"workPeriodAssignment,omitempty"`
	Collaborator         CollaboratorJourney   `gorm:"foreignKey:CollaboratorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"collaborator,omitempty"`
}

type LedgerEntry struct {
	BaseModel

	TenantID             string     `gorm:"type:text;not null;default:default;uniqueIndex:ux_ledger_tenant_source_unit_direction,priority:1;index" json:"tenantId"`
	CollaboratorID       string     `gorm:"type:text;not null;index" json:"collaboratorId"`
	ValueUnitID          string     `gorm:"type:text;not null;uniqueIndex:ux_ledger_tenant_source_unit_direction,priority:4;index" json:"valueUnitId"`
	EntryType            string     `gorm:"type:text;not null;index" json:"entryType"`
	Direction            string     `gorm:"type:text;not null;uniqueIndex:ux_ledger_tenant_source_unit_direction,priority:5;index" json:"direction"`
	Amount               float64    `gorm:"not null" json:"amount"`
	EffectiveDate        time.Time  `gorm:"type:date;not null;index" json:"effectiveDate"`
	SourceType           string     `gorm:"type:text;not null;uniqueIndex:ux_ledger_tenant_source_unit_direction,priority:2;index" json:"sourceType"`
	SourceID             string     `gorm:"type:text;not null;uniqueIndex:ux_ledger_tenant_source_unit_direction,priority:3;index" json:"sourceId"`
	Description          string     `gorm:"type:text" json:"description,omitempty"`
	Active               bool       `gorm:"not null;default:true;index" json:"active"`
	CorrectionType       string     `gorm:"type:text;not null;default:ORIGINAL;index" json:"correctionType"`
	RelatedEntryID       *string    `gorm:"type:text;index" json:"relatedEntryId,omitempty"`
	CorrectionReason     string     `gorm:"type:text" json:"correctionReason,omitempty"`
	CorrectionReasonCode string     `gorm:"type:text;index" json:"correctionReasonCode,omitempty"`
	CorrectionReasonText string     `gorm:"type:text" json:"correctionReasonText,omitempty"`
	AuthorizedBy         string     `gorm:"type:text;index" json:"authorizedBy,omitempty"`
	AuthorizedAt         *time.Time `json:"authorizedAt,omitempty"`
	SecondApprovedBy     string     `gorm:"type:text;index" json:"secondApprovedBy,omitempty"`
	SecondApprovedAt     *time.Time `json:"secondApprovedAt,omitempty"`
	SecondApprovalNotes  string     `gorm:"type:text" json:"secondApprovalNotes,omitempty"`

	Tenant       Tenant              `gorm:"foreignKey:TenantID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"tenant,omitempty"`
	Collaborator CollaboratorJourney `gorm:"foreignKey:CollaboratorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"collaborator,omitempty"`
	ValueUnit    ReferenceData       `gorm:"foreignKey:ValueUnitID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"valueUnit,omitempty"`
	Receipt      *LedgerReceipt      `gorm:"foreignKey:LedgerEntryID" json:"receipt,omitempty"`
}
