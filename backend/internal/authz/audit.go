package authz

import (
	"context"
	"fmt"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/shared/ids"
)

const (
	AuditDecisionAuthorized = "AUTHORIZED"
	AuditDecisionDenied     = "DENIED"
)

type AuditLogStore interface {
	RecordAuthorizationAudit(ctx context.Context, entry AuthorizationAuditEntry) error
}

type AuthorizationAuditEntry struct {
	Actor           *Actor
	FallbackActorID string
	TenantID        string
	Permission      Permission
	Operation       string
	TargetType      string
	TargetID        string
	Decision        string
	Reason          string
	RequestMethod   string
	RequestPath     string
}

func (s *GORMStore) RecordAuthorizationAudit(ctx context.Context, entry AuthorizationAuditEntry) error {
	if s == nil || s.database == nil {
		return nil
	}
	operation := strings.TrimSpace(entry.Operation)
	if operation == "" {
		operation = "unknown"
	}
	decision := strings.TrimSpace(entry.Decision)
	if decision == "" {
		decision = AuditDecisionAuthorized
	}

	actorID := strings.TrimSpace(entry.FallbackActorID)
	actorRecordID := ""
	actorTenantID := ""
	if entry.Actor != nil {
		if strings.TrimSpace(entry.Actor.ID) != "" {
			actorID = strings.TrimSpace(entry.Actor.ID)
		}
		actorRecordID = strings.TrimSpace(entry.Actor.RecordID)
		actorTenantID = strings.TrimSpace(entry.Actor.TenantID)
	}
	tenantID := strings.TrimSpace(entry.TenantID)
	if tenantID == "" {
		tenantID = actorTenantID
	}

	now := time.Now().UTC()
	row := AuthzAuditLog{
		ID:             ids.New(),
		OccurredAt:     now,
		ActorID:        actorID,
		ActorRecordID:  actorRecordID,
		TenantID:       tenantID,
		PermissionCode: string(entry.Permission),
		Operation:      operation,
		TargetType:     strings.TrimSpace(entry.TargetType),
		TargetID:       strings.TrimSpace(entry.TargetID),
		Decision:       decision,
		Reason:         strings.TrimSpace(entry.Reason),
		RequestMethod:  strings.TrimSpace(entry.RequestMethod),
		RequestPath:    strings.TrimSpace(entry.RequestPath),
		CreatedAt:      now,
	}
	if err := s.database.WithContext(ctx).Create(&row).Error; err != nil {
		return fmt.Errorf("record authorization audit log: %w", err)
	}
	return nil
}
