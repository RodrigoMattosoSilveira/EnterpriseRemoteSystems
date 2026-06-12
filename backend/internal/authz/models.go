package authz

import "time"

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
	ID        string    `gorm:"type:text;primaryKey"`
	ActorID   string    `gorm:"type:text;not null;uniqueIndex:ux_authz_actor_role_tenant,priority:1;index"`
	RoleID    string    `gorm:"type:text;not null;uniqueIndex:ux_authz_actor_role_tenant,priority:2;index"`
	TenantID  string    `gorm:"type:text;not null;default:*;uniqueIndex:ux_authz_actor_role_tenant,priority:3;index"`
	Active    bool      `gorm:"not null;default:true;index"`
	CreatedAt time.Time `gorm:"not null"`
	UpdatedAt time.Time `gorm:"not null"`
}

func (AuthzActorRoleGrant) TableName() string { return "authz_actor_role_grants" }
