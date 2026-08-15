package authentication

import (
	"context"
	"fmt"
	"strings"
	"time"

	appdb "enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

type reactivationRequestProjection struct {
	AccountReactivationRequest
	Login            string
	GlobalPersonName string
}

func (r *GORMRepository) FindPersonAuthentication(ctx context.Context, tenantID string, personID string) (PersonAuthenticationRecord, error) {
	tenantID = strings.TrimSpace(tenantID)
	personID = strings.TrimSpace(personID)
	if tenantID == "" || personID == "" {
		return PersonAuthenticationRecord{}, gorm.ErrRecordNotFound
	}

	if err := appdb.EnsureGlobalPersonMembershipFoundation(r.database.WithContext(ctx)); err != nil {
		return PersonAuthenticationRecord{}, err
	}

	var person appdb.Person
	result := r.database.WithContext(ctx).
		Where("id = ? AND tenant_id = ?", personID, tenantID).
		Limit(1).
		Find(&person)
	if result.Error != nil {
		return PersonAuthenticationRecord{}, fmt.Errorf("find tenant Person for authentication: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return PersonAuthenticationRecord{}, gorm.ErrRecordNotFound
	}

	type membershipProjection struct {
		ID       string
		PersonID string
		Code     string
	}
	var membership membershipProjection
	membershipResult := r.database.WithContext(ctx).
		Table("person_tenant_memberships m").
		Select("m.id, m.person_id, r.code").
		Joins("JOIN reference_data r ON r.id = m.status_id AND r.tenant_id = m.tenant_id AND r.type = ?", "person_status").
		Where("m.legacy_person_id = ? AND m.tenant_id = ?", person.ID, tenantID).
		Limit(1).
		Scan(&membership)
	if membershipResult.Error != nil {
		return PersonAuthenticationRecord{}, fmt.Errorf("find Person-Tenant Membership for authentication: %w", membershipResult.Error)
	}
	if membershipResult.RowsAffected == 0 || strings.TrimSpace(membership.ID) == "" || !strings.EqualFold(strings.TrimSpace(membership.Code), "ACTIVE") {
		return PersonAuthenticationRecord{}, ErrPersonMembershipRequired
	}

	record := PersonAuthenticationRecord{
		TenantID:       tenantID,
		LegacyPersonID: person.ID,
		GlobalPersonID: membership.PersonID,
		MembershipID:   membership.ID,
		Login:          normalizeLogin(person.Email),
	}

	var accountPerson AccountPerson
	accountResult := r.database.WithContext(ctx).
		Where("person_id = ?", membership.PersonID).
		Limit(1).
		Find(&accountPerson)
	if accountResult.Error != nil {
		return PersonAuthenticationRecord{}, fmt.Errorf("find Authentication Account for Person: %w", accountResult.Error)
	}
	if accountResult.RowsAffected == 0 {
		return record, nil
	}

	var binding AccountActor
	bindingResult := r.database.WithContext(ctx).
		Where("account_id = ? AND scope_type = ? AND tenant_id = ? AND membership_id = ?", accountPerson.AccountID, AccountActorScopeTenant, tenantID, membership.ID).
		Limit(1).
		Find(&binding)
	if bindingResult.Error != nil {
		return PersonAuthenticationRecord{}, fmt.Errorf("find current Tenant Actor binding: %w", bindingResult.Error)
	}
	if bindingResult.RowsAffected == 0 {
		// Do not expose the existence or state of a global Account that has not
		// yet been enabled for this tenant.
		return record, nil
	}

	var account Account
	if err := r.database.WithContext(ctx).First(&account, "id = ?", accountPerson.AccountID).Error; err != nil {
		return PersonAuthenticationRecord{}, fmt.Errorf("find enabled Authentication Account: %w", err)
	}
	record.AccountID = account.ID
	record.Enabled = true
	record.AccountActive = account.Active
	return record, nil
}

func (r *GORMRepository) CreateOrRefreshReactivationRequest(
	ctx context.Context,
	accountID string,
	source string,
	requesterActorID string,
	tenantID string,
	userAgent string,
	ipAddress string,
	now time.Time,
) (ReactivationRequestRecord, error) {
	accountID = strings.TrimSpace(accountID)
	source = strings.TrimSpace(source)
	requesterActorID = strings.TrimSpace(requesterActorID)
	tenantID = strings.TrimSpace(tenantID)
	if accountID == "" {
		return ReactivationRequestRecord{}, gorm.ErrRecordNotFound
	}

	var requestID string
	err := r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var account Account
		if err := tx.First(&account, "id = ?", accountID).Error; err != nil {
			return err
		}
		if account.Active {
			return ErrAccountAlreadyActive
		}

		var pending AccountReactivationRequest
		result := tx.Where("account_id = ? AND status = ?", accountID, ReactivationRequestStatusPending).
			Order("created_at DESC").Limit(1).Find(&pending)
		if result.Error != nil {
			return fmt.Errorf("find pending account reactivation request: %w", result.Error)
		}
		requester := nullableString(requesterActorID)
		tenant := nullableString(tenantID)
		if result.RowsAffected > 0 {
			requestID = pending.ID
			// Preserve the original request context for auditability. Repeated
			// requests only advance the last-requested timestamp and count.
			updates := map[string]any{
				"last_requested_at": now,
				"request_count":     pending.RequestCount + 1,
				"updated_at":        now,
			}
			return tx.Model(&AccountReactivationRequest{}).Where("id = ?", pending.ID).Updates(updates).Error
		}

		request := AccountReactivationRequest{
			ID:                 ids.New(),
			AccountID:          accountID,
			Status:             ReactivationRequestStatusPending,
			RequestedByType:    source,
			RequestedByActorID: requester,
			RequestedTenantID:  tenant,
			UserAgent:          strings.TrimSpace(userAgent),
			IPAddress:          strings.TrimSpace(ipAddress),
			FirstRequestedAt:   now,
			LastRequestedAt:    now,
			RequestCount:       1,
			CreatedAt:          now,
			UpdatedAt:          now,
		}
		if err := tx.Create(&request).Error; err != nil {
			return fmt.Errorf("create account reactivation request: %w", err)
		}
		requestID = request.ID
		return nil
	})
	if err != nil {
		return ReactivationRequestRecord{}, err
	}
	return r.findReactivationRequest(ctx, requestID)
}

func (r *GORMRepository) ListReactivationRequests(ctx context.Context) ([]ReactivationRequestRecord, error) {
	var rows []reactivationRequestProjection
	if err := r.reactivationRequestQuery(ctx).
		Order("CASE rr.status WHEN 'PENDING' THEN 0 ELSE 1 END, rr.last_requested_at DESC").
		Limit(200).
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("list account reactivation requests: %w", err)
	}
	result := make([]ReactivationRequestRecord, 0, len(rows))
	for _, row := range rows {
		result = append(result, mapReactivationRequestProjection(row))
	}
	return result, nil
}

func (r *GORMRepository) ReviewReactivationRequest(
	ctx context.Context,
	requestID string,
	reviewerActorID string,
	approve bool,
	reason string,
	now time.Time,
) (ReactivationRequestRecord, error) {
	requestID = strings.TrimSpace(requestID)
	reviewerActorID = strings.TrimSpace(reviewerActorID)
	reason = strings.TrimSpace(reason)
	if requestID == "" {
		return ReactivationRequestRecord{}, gorm.ErrRecordNotFound
	}

	err := r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var request AccountReactivationRequest
		if err := tx.First(&request, "id = ?", requestID).Error; err != nil {
			return err
		}
		if request.Status != ReactivationRequestStatusPending {
			return ErrReactivationNotPending
		}

		status := ReactivationRequestStatusRejected
		if approve {
			var account Account
			if err := tx.First(&account, "id = ?", request.AccountID).Error; err != nil {
				return err
			}
			if account.Active {
				return ErrAccountAlreadyActive
			}

			status = ReactivationRequestStatusApproved
			result := tx.Model(&Account{}).Where("id = ?", request.AccountID).Updates(map[string]any{
				"active":     true,
				"updated_at": now,
			})
			if result.Error != nil {
				return fmt.Errorf("reactivate Authentication Account: %w", result.Error)
			}
			if result.RowsAffected == 0 {
				return gorm.ErrRecordNotFound
			}
			// A reactivation always starts from a clean session boundary. Actor
			// ownership remains unchanged.
			if err := revokeSessions(tx, request.AccountID, now); err != nil {
				return err
			}
		}

		reviewer := nullableString(reviewerActorID)
		result := tx.Model(&AccountReactivationRequest{}).
			Where("id = ? AND status = ?", request.ID, ReactivationRequestStatusPending).
			Updates(map[string]any{
				"status":               status,
				"reviewed_by_actor_id": reviewer,
				"reviewed_at":          now,
				"review_reason":        reason,
				"updated_at":           now,
			})
		if result.Error != nil {
			return fmt.Errorf("review account reactivation request: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return ErrReactivationNotPending
		}
		return nil
	})
	if err != nil {
		return ReactivationRequestRecord{}, err
	}
	return r.findReactivationRequest(ctx, requestID)
}

func (r *GORMRepository) findReactivationRequest(ctx context.Context, requestID string) (ReactivationRequestRecord, error) {
	var row reactivationRequestProjection
	result := r.reactivationRequestQuery(ctx).Where("rr.id = ?", strings.TrimSpace(requestID)).Limit(1).Scan(&row)
	if result.Error != nil {
		return ReactivationRequestRecord{}, fmt.Errorf("find account reactivation request: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ReactivationRequestRecord{}, gorm.ErrRecordNotFound
	}
	return mapReactivationRequestProjection(row), nil
}

func (r *GORMRepository) reactivationRequestQuery(ctx context.Context) *gorm.DB {
	return r.database.WithContext(ctx).
		Table("auth_account_reactivation_requests rr").
		Select(`rr.*, a.login,
			TRIM(COALESCE(gp.first_name, '') || ' ' || COALESCE(gp.last_name, '')) AS global_person_name`).
		Joins("JOIN auth_user_accounts a ON a.id = rr.account_id").
		Joins("LEFT JOIN auth_account_people ap ON ap.account_id = a.id").
		Joins("LEFT JOIN global_people gp ON gp.id = ap.person_id")
}

func mapReactivationRequestProjection(row reactivationRequestProjection) ReactivationRequestRecord {
	return ReactivationRequestRecord{
		AccountReactivationRequest: row.AccountReactivationRequest,
		Login:                      row.Login,
		GlobalPersonName:           strings.TrimSpace(row.GlobalPersonName),
	}
}

func nullableString(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}
