package currentaccounts

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
)

const SecondPersonApprovalPolicyKey = "current_accounts.require_second_person_approval_for_sensitive_operations"

func optionalApprovalTime(approvedBy string, now time.Time) *time.Time {
	if strings.TrimSpace(approvedBy) == "" {
		return nil
	}
	return &now
}

func parseBoolSetting(value string) bool {
	parsed, err := strconv.ParseBool(strings.TrimSpace(value))
	return err == nil && parsed
}

func formatBoolSetting(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

func (s *service) GetSecondPersonApprovalPolicy(ctx context.Context, tenantID string) (*SecondPersonApprovalPolicyDTO, error) {
	tenantID = normalizedTenantID(ctx, tenantID)
	row, err := s.repo.GetTenantSettingRow(ctx, tenantID, SecondPersonApprovalPolicyKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &SecondPersonApprovalPolicyDTO{TenantID: tenantID, Required: false}, nil
		}
		return nil, err
	}
	return mapSecondPersonApprovalPolicy(ctx, row), nil
}

func (s *service) UpdateSecondPersonApprovalPolicy(ctx context.Context, tenantID, updatedBy string, req UpdateSecondPersonApprovalPolicyRequest) (*SecondPersonApprovalPolicyDTO, error) {
	tenantID = normalizedTenantID(ctx, tenantID)
	row, err := s.repo.UpsertTenantSetting(ctx, tenantID, SecondPersonApprovalPolicyKey, formatBoolSetting(req.Required), "Require second-person approval for sensitive current-account operations", updatedBy)
	if err != nil {
		return nil, err
	}
	return mapSecondPersonApprovalPolicy(ctx, row), nil
}

func mapSecondPersonApprovalPolicy(ctx context.Context, row *db.TenantSetting) *SecondPersonApprovalPolicyDTO {
	if row == nil {
		return &SecondPersonApprovalPolicyDTO{TenantID: tenantctx.TenantID(ctx), Required: false}
	}
	result := &SecondPersonApprovalPolicyDTO{
		TenantID:  row.TenantID,
		Required:  parseBoolSetting(row.Value),
		UpdatedBy: row.UpdatedBy,
	}
	if !row.UpdatedAt.IsZero() {
		result.UpdatedAt = row.UpdatedAt.UTC().Format(time.RFC3339)
	}
	return result
}

func (s *service) sensitiveOperationsRequireSecondApproval(ctx context.Context, tenantID string) (bool, error) {
	value, err := s.repo.GetTenantSetting(ctx, tenantID, SecondPersonApprovalPolicyKey)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	return parseBoolSetting(value), nil
}

func (s *service) requireSecondApprovalWhenConfigured(ctx context.Context, tenantID string, req CorrectionReasonRequest, authorizedBy string) error {
	required, err := s.sensitiveOperationsRequireSecondApproval(ctx, tenantID)
	if err != nil {
		return err
	}
	if !required {
		return nil
	}
	fields := map[string]string{}
	validateRequiredSecondApproval(fields, req, authorizedBy)
	if len(fields) > 0 {
		return ValidationError{Fields: fields}
	}
	return nil
}

func normalizedTenantID(ctx context.Context, tenantID string) string {
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		return tenantctx.TenantID(ctx)
	}
	return tenantID
}
