package authentication

import "time"

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
