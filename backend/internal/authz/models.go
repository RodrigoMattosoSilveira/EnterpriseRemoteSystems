package authz

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

type AuthzActor struct {
	ID             string    `gorm:"type:text;primaryKey"`
	ActorKey       string    `gorm:"type:text;not null;uniqueIndex"`
	DisplayName    string    `gorm:"type:text"`
	PersonID       *string   `gorm:"type:text;index"`
	CollaboratorID *string   `gorm:"type:text;index"`
	Active         bool      `gorm:"not null;default:true;index"`
	CreatedAt      time.Time `gorm:"not null"`
	UpdatedAt      time.Time `gorm:"not null"`
}

func (AuthzActor) TableName() string { return "authz_actors" }

type AuthzRole struct {
	ID          string    `gorm:"type:text;primaryKey"`
	Code        string    `gorm:"type:text;not null;uniqueIndex"`
	Label       string    `gorm:"type:text;not null"`
	Description string    `gorm:"type:text"`
	ScopeType   string    `gorm:"type:text;not null;index"`
	Active      bool      `gorm:"not null;default:true;index"`
	CreatedAt   time.Time `gorm:"not null"`
	UpdatedAt   time.Time `gorm:"not null"`
}

func (AuthzRole) TableName() string { return "authz_roles" }

type AuthzPermission struct {
	Code        string    `gorm:"type:text;primaryKey"`
	Label       string    `gorm:"type:text;not null"`
	Description string    `gorm:"type:text"`
	CreatedAt   time.Time `gorm:"not null"`
	UpdatedAt   time.Time `gorm:"not null"`
}

func (AuthzPermission) TableName() string { return "authz_permissions" }

type AuthzRolePermission struct {
	RoleID         string    `gorm:"type:text;primaryKey"`
	PermissionCode string    `gorm:"type:text;primaryKey"`
	CreatedAt      time.Time `gorm:"not null"`
}

func (AuthzRolePermission) TableName() string { return "authz_role_permissions" }

type AuthzActorRoleGrant struct {
	ID                 string    `gorm:"type:text;primaryKey"`
	ActorID            string    `gorm:"type:text;not null;uniqueIndex:ux_authz_actor_role_tenant,priority:1;index"`
	RoleID             string    `gorm:"type:text;not null;uniqueIndex:ux_authz_actor_role_tenant,priority:2;index"`
	TenantID           string    `gorm:"type:text;not null;default:*;uniqueIndex:ux_authz_actor_role_tenant,priority:3;index"`
	Active             bool      `gorm:"not null;default:true;index"`
	LifecycleSuspended bool      `gorm:"column:lifecycle_suspended;not null;default:false;index"`
	CreatedAt          time.Time `gorm:"not null"`
	UpdatedAt          time.Time `gorm:"not null"`
}

func (AuthzActorRoleGrant) TableName() string { return "authz_actor_role_grants" }

type AuthzAuditLog struct {
	ID             string    `gorm:"type:text;primaryKey"`
	OccurredAt     time.Time `gorm:"not null;index"`
	ActorID        string    `gorm:"type:text;index"`
	ActorRecordID  string    `gorm:"type:text"`
	TenantID       string    `gorm:"type:text;index"`
	PermissionCode string    `gorm:"type:text"`
	Operation      string    `gorm:"type:text;not null;index"`
	TargetType     string    `gorm:"type:text;index:idx_authz_audit_target,priority:1"`
	TargetID       string    `gorm:"type:text;index:idx_authz_audit_target,priority:2"`
	Decision       string    `gorm:"type:text;not null;index"`
	Reason         string    `gorm:"type:text"`
	MetadataJSON   string    `gorm:"type:text"`
	RequestMethod  string    `gorm:"type:text"`
	RequestPath    string    `gorm:"type:text"`
	CreatedAt      time.Time `gorm:"not null"`
}

type TenantSupportAccessLease struct {
	ID                  string     `gorm:"type:text;primaryKey"`
	TenantID            string     `gorm:"type:text;not null;index"`
	ApplicationActorID  string     `gorm:"type:text;not null;index"`
	RequestedByActorID  string     `gorm:"type:text;not null"`
	RequestedAt         time.Time  `gorm:"not null;index"`
	ExpiresAt           time.Time  `gorm:"not null;index"`
	Reason              string     `gorm:"type:text;not null"`
	Status              string     `gorm:"type:text;not null;index"`
	ApprovedAt          *time.Time `gorm:"index"`
	ApprovedByActorID   *string    `gorm:"type:text"`
	TerminatedAt        *time.Time `gorm:"index"`
	TerminatedByActorID *string    `gorm:"type:text"`
	TerminationReason   string     `gorm:"type:text"`
	CreatedAt           time.Time  `gorm:"not null"`
	UpdatedAt           time.Time  `gorm:"not null"`
}

func (TenantSupportAccessLease) TableName() string { return "tenant_support_access_leases" }

type TenantSupportAccessLeasePermission struct {
	LeaseID        string    `gorm:"type:text;primaryKey"`
	PermissionCode string    `gorm:"type:text;primaryKey"`
	CreatedAt      time.Time `gorm:"not null"`
}

func (TenantSupportAccessLeasePermission) TableName() string {
	return "tenant_support_access_lease_permissions"
}

type TenantSupportAccessLeaseEvent struct {
	ID           string    `gorm:"type:text;primaryKey"`
	LeaseID      string    `gorm:"type:text;not null;index"`
	EventType    string    `gorm:"type:text;not null;index"`
	ActorID      string    `gorm:"type:text;not null;index"`
	OccurredAt   time.Time `gorm:"not null;index"`
	MetadataJSON string    `gorm:"type:text"`
	CreatedAt    time.Time `gorm:"not null"`
}

func (TenantSupportAccessLeaseEvent) TableName() string {
	return "tenant_support_access_lease_events"
}

var ErrImmutableAuditLog = errors.New("authorization audit logs are immutable")

func (AuthzAuditLog) TableName() string { return "authz_audit_logs" }

func (AuthzAuditLog) BeforeUpdate(tx *gorm.DB) error {
	return ErrImmutableAuditLog
}

func (AuthzAuditLog) BeforeDelete(tx *gorm.DB) error {
	return ErrImmutableAuditLog
}
