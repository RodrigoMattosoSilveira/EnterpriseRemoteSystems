package authentication

import "time"

// Account is the application-global authentication identity for one human.
//
// ActorID is retained during Bite 30C only as the legacy/default actor pointer
// used by pre-30C clients and session responses. The authoritative ownership
// relation is auth_account_actors, which allows one Account to control many
// tenant Actors while preserving a single global Actor for Application
// Administrators. Bite 30J removes this compatibility column after all callers
// have cut over.
type Account struct {
	ID                 string     `gorm:"type:text;primaryKey"`
	ActorID            string     `gorm:"type:text;not null;uniqueIndex"`
	Login              string     `gorm:"type:text;not null;uniqueIndex"`
	PasswordHash       string     `gorm:"type:text;not null"`
	Active             bool       `gorm:"not null;index"`
	MustChangePassword bool       `gorm:"not null"`
	LastLoginAt        *time.Time `gorm:"type:datetime"`
	PasswordChangedAt  *time.Time `gorm:"type:datetime"`
	CreatedAt          time.Time  `gorm:"not null"`
	UpdatedAt          time.Time  `gorm:"not null"`
}

func (Account) TableName() string { return "auth_user_accounts" }

// AccountPerson binds an ordinary Authentication Account to the one global
// Person represented by all of its tenant Actors. Application Administrator
// accounts intentionally have no row in this table.
type AccountPerson struct {
	AccountID string    `gorm:"type:text;primaryKey"`
	PersonID  string    `gorm:"type:text;not null;uniqueIndex"`
	CreatedAt time.Time `gorm:"not null"`
	UpdatedAt time.Time `gorm:"not null"`
}

func (AccountPerson) TableName() string { return "auth_account_people" }

const (
	AccountActorScopeGlobal = "GLOBAL"
	AccountActorScopeTenant = "TENANT"
)

// AccountActor is the authoritative Account -> Actor ownership relation.
// Tenant bindings identify exactly one Tenant and, when the Actor represents a
// Person, exactly one Person-Tenant Membership. Global bindings have neither.
type AccountActor struct {
	AccountID    string    `gorm:"type:text;primaryKey;uniqueIndex:ux_auth_account_actor,priority:1;index"`
	ActorID      string    `gorm:"type:text;primaryKey;uniqueIndex:ux_auth_account_actor,priority:2;uniqueIndex;index"`
	ScopeType    string    `gorm:"type:text;not null;index"`
	TenantID     *string   `gorm:"type:text;index"`
	MembershipID *string   `gorm:"type:text;index"`
	Primary      bool      `gorm:"column:is_primary;not null;default:false;index"`
	CreatedAt    time.Time `gorm:"not null"`
	UpdatedAt    time.Time `gorm:"not null"`
}

func (AccountActor) TableName() string { return "auth_account_actors" }

type Session struct {
	ID         string     `gorm:"type:text;primaryKey"`
	AccountID  string     `gorm:"type:text;not null;index"`
	TokenHash  string     `gorm:"type:text;not null;uniqueIndex"`
	ExpiresAt  time.Time  `gorm:"type:datetime;not null;index"`
	LastSeenAt time.Time  `gorm:"type:datetime;not null"`
	RevokedAt  *time.Time `gorm:"type:datetime;index"`
	UserAgent  string     `gorm:"type:text"`
	IPAddress  string     `gorm:"type:text"`
	CreatedAt  time.Time  `gorm:"not null"`
	UpdatedAt  time.Time  `gorm:"not null"`
}

func (Session) TableName() string { return "auth_sessions" }

type PasswordResetToken struct {
	ID        string     `gorm:"type:text;primaryKey"`
	AccountID string     `gorm:"type:text;not null;index"`
	TokenHash string     `gorm:"type:text;not null;uniqueIndex"`
	ExpiresAt time.Time  `gorm:"type:datetime;not null;index"`
	UsedAt    *time.Time `gorm:"type:datetime;index"`
	CreatedAt time.Time  `gorm:"not null"`
}

func (PasswordResetToken) TableName() string { return "auth_password_reset_tokens" }

const (
	ReactivationRequestStatusPending  = "PENDING"
	ReactivationRequestStatusApproved = "APPROVED"
	ReactivationRequestStatusRejected = "REJECTED"

	ReactivationRequestSourceSelf        = "SELF"
	ReactivationRequestSourceTenantAdmin = "TENANT_ADMIN"
)

// AccountReactivationRequest records a request to restore an inactive global
// Authentication Account. The request never changes tenant Actor bindings.
// Application Administrators are the only identities allowed to approve or
// reject it. Repeated requests while one is pending refresh the audit context
// rather than creating an unbounded queue of duplicate requests.
type AccountReactivationRequest struct {
	ID                 string     `gorm:"type:text;primaryKey"`
	AccountID          string     `gorm:"type:text;not null;index"`
	Status             string     `gorm:"type:text;not null;index"`
	RequestedByType    string     `gorm:"type:text;not null"`
	RequestedByActorID *string    `gorm:"type:text;index"`
	RequestedTenantID  *string    `gorm:"type:text;index"`
	UserAgent          string     `gorm:"type:text"`
	IPAddress          string     `gorm:"type:text"`
	FirstRequestedAt   time.Time  `gorm:"type:datetime;not null"`
	LastRequestedAt    time.Time  `gorm:"type:datetime;not null;index"`
	RequestCount       int        `gorm:"not null;default:1"`
	ReviewedByActorID  *string    `gorm:"type:text;index"`
	ReviewedAt         *time.Time `gorm:"type:datetime;index"`
	ReviewReason       string     `gorm:"type:text"`
	CreatedAt          time.Time  `gorm:"not null"`
	UpdatedAt          time.Time  `gorm:"not null"`
}

func (AccountReactivationRequest) TableName() string { return "auth_account_reactivation_requests" }
