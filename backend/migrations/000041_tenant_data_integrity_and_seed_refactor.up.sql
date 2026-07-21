PRAGMA foreign_keys = ON;

-- Tenant identity is immutable and tenant codes are unique regardless of case.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tenants_code_nocase ON tenants(code COLLATE NOCASE);

CREATE TRIGGER IF NOT EXISTS trg_tenants_id_immutable
BEFORE UPDATE OF id ON tenants
FOR EACH ROW
WHEN NEW.id <> OLD.id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_tenants_code_normalized_insert
BEFORE INSERT ON tenants
FOR EACH ROW
WHEN NEW.code <> UPPER(TRIM(NEW.code)) OR LENGTH(TRIM(NEW.code)) = 0
BEGIN
  SELECT RAISE(ABORT, 'tenant_code_must_be_normalized');
END;

CREATE TRIGGER IF NOT EXISTS trg_tenants_code_normalized_update
BEFORE UPDATE OF code ON tenants
FOR EACH ROW
WHEN NEW.code <> UPPER(TRIM(NEW.code)) OR LENGTH(TRIM(NEW.code)) = 0
BEGIN
  SELECT RAISE(ABORT, 'tenant_code_must_be_normalized');
END;

-- Every tenant-owned row must reference a real tenant, and historical data
-- cannot be moved between tenants after creation.
CREATE TRIGGER IF NOT EXISTS trg_reference_data_tenant_exists_insert
BEFORE INSERT ON reference_data
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_reference_data_tenant_immutable
BEFORE UPDATE OF tenant_id ON reference_data
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_people_tenant_exists_insert
BEFORE INSERT ON people
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_people_tenant_immutable
BEFORE UPDATE OF tenant_id ON people
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_collaborator_journeys_tenant_exists_insert
BEFORE INSERT ON collaborator_journeys
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_collaborator_journeys_tenant_immutable
BEFORE UPDATE OF tenant_id ON collaborator_journeys
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_expenses_tenant_exists_insert
BEFORE INSERT ON expenses
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_expenses_tenant_immutable
BEFORE UPDATE OF tenant_id ON expenses
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_expense_price_list_items_tenant_exists_insert
BEFORE INSERT ON expense_price_list_items
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_expense_price_list_items_tenant_immutable
BEFORE UPDATE OF tenant_id ON expense_price_list_items
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_gold_prices_tenant_exists_insert
BEFORE INSERT ON gold_prices
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_gold_prices_tenant_immutable
BEFORE UPDATE OF tenant_id ON gold_prices
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_entries_tenant_exists_insert
BEFORE INSERT ON ledger_entries
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_entries_tenant_immutable
BEFORE UPDATE OF tenant_id ON ledger_entries
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_journey_settlements_tenant_exists_insert
BEFORE INSERT ON journey_settlements
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_journey_settlements_tenant_immutable
BEFORE UPDATE OF tenant_id ON journey_settlements
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_receipts_tenant_exists_insert
BEFORE INSERT ON ledger_receipts
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_receipts_tenant_immutable
BEFORE UPDATE OF tenant_id ON ledger_receipts
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_work_periods_tenant_exists_insert
BEFORE INSERT ON work_periods
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_work_periods_tenant_immutable
BEFORE UPDATE OF tenant_id ON work_periods
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_work_period_assignments_tenant_exists_insert
BEFORE INSERT ON work_period_assignments
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_work_period_assignments_tenant_immutable
BEFORE UPDATE OF tenant_id ON work_period_assignments
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_gold_production_entries_tenant_exists_insert
BEFORE INSERT ON gold_production_entries
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_gold_production_entries_tenant_immutable
BEFORE UPDATE OF tenant_id ON gold_production_entries
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_accrual_runs_tenant_exists_insert
BEFORE INSERT ON accrual_runs
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_accrual_runs_tenant_immutable
BEFORE UPDATE OF tenant_id ON accrual_runs
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_accrual_items_tenant_exists_insert
BEFORE INSERT ON accrual_items
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_accrual_items_tenant_immutable
BEFORE UPDATE OF tenant_id ON accrual_items
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_tenant_settings_tenant_exists_insert
BEFORE INSERT ON tenant_settings
FOR EACH ROW
WHEN LENGTH(TRIM(NEW.tenant_id)) = 0 OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

CREATE TRIGGER IF NOT EXISTS trg_tenant_settings_tenant_immutable
BEFORE UPDATE OF tenant_id ON tenant_settings
FOR EACH ROW
WHEN NEW.tenant_id <> OLD.tenant_id
BEGIN
  SELECT RAISE(ABORT, 'tenant_id_immutable');
END;

-- Authorization grants use * only for application-scoped roles. All other
-- grant scopes must point to an existing tenant.
CREATE TRIGGER IF NOT EXISTS trg_authz_grants_tenant_scope_insert
BEFORE INSERT ON authz_actor_role_grants
FOR EACH ROW
WHEN
  (NEW.tenant_id <> '*' AND NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id))
  OR EXISTS (
    SELECT 1 FROM authz_roles
    WHERE id = NEW.role_id
      AND ((scope_type = 'APPLICATION' AND NEW.tenant_id <> '*')
        OR (scope_type <> 'APPLICATION' AND NEW.tenant_id = '*'))
  )
BEGIN
  SELECT RAISE(ABORT, 'authorization_tenant_scope_invalid');
END;

CREATE TRIGGER IF NOT EXISTS trg_authz_grants_tenant_scope_update
BEFORE UPDATE OF tenant_id, role_id ON authz_actor_role_grants
FOR EACH ROW
WHEN
  (NEW.tenant_id <> '*' AND NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id))
  OR EXISTS (
    SELECT 1 FROM authz_roles
    WHERE id = NEW.role_id
      AND ((scope_type = 'APPLICATION' AND NEW.tenant_id <> '*')
        OR (scope_type <> 'APPLICATION' AND NEW.tenant_id = '*'))
  )
BEGIN
  SELECT RAISE(ABORT, 'authorization_tenant_scope_invalid');
END;

-- Audit rows may use an empty or global scope, but a specific tenant snapshot
-- must identify a tenant that exists.
CREATE TRIGGER IF NOT EXISTS trg_authz_audit_tenant_exists_insert
BEFORE INSERT ON authz_audit_logs
FOR EACH ROW
WHEN LENGTH(TRIM(COALESCE(NEW.tenant_id, ''))) > 0
  AND NEW.tenant_id <> '*'
  AND NOT EXISTS (SELECT 1 FROM tenants WHERE id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'tenant_integrity_violation');
END;

-- Core relationships must remain inside the owning tenant.
CREATE TRIGGER IF NOT EXISTS trg_people_same_tenant_insert
BEFORE INSERT ON people
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.status_id AND r.tenant_id = NEW.tenant_id AND r.type = 'person_status')
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_people_same_tenant_update
BEFORE UPDATE ON people
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.status_id AND r.tenant_id = NEW.tenant_id AND r.type = 'person_status')
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_collaborator_journeys_same_tenant_insert
BEFORE INSERT ON collaborator_journeys
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM people p WHERE p.id = NEW.person_id AND p.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.payment_method_id AND r.tenant_id = NEW.tenant_id AND r.type = 'method')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.sector_id AND r.tenant_id = NEW.tenant_id AND r.type = 'sector')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.location_id AND r.tenant_id = NEW.tenant_id AND r.type = 'location')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.task_id AND r.tenant_id = NEW.tenant_id AND r.type = 'task')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.status_id AND r.tenant_id = NEW.tenant_id AND r.type = 'collaborator_status')
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_collaborator_journeys_same_tenant_update
BEFORE UPDATE ON collaborator_journeys
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM people p WHERE p.id = NEW.person_id AND p.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.payment_method_id AND r.tenant_id = NEW.tenant_id AND r.type = 'method')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.sector_id AND r.tenant_id = NEW.tenant_id AND r.type = 'sector')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.location_id AND r.tenant_id = NEW.tenant_id AND r.type = 'location')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.task_id AND r.tenant_id = NEW.tenant_id AND r.type = 'task')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.status_id AND r.tenant_id = NEW.tenant_id AND r.type = 'collaborator_status')
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_expenses_same_tenant_insert
BEFORE INSERT ON expenses
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.expense_category_id AND r.tenant_id = NEW.tenant_id AND r.type = 'expense_category')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.value_unit_id AND r.tenant_id = NEW.tenant_id AND r.type = 'value_unit')
  OR (NEW.price_list_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM expense_price_list_items p WHERE p.id = NEW.price_list_item_id AND p.tenant_id = NEW.tenant_id))
  OR (NEW.gold_price_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gold_prices g WHERE g.id = NEW.gold_price_id AND g.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_expenses_same_tenant_update
BEFORE UPDATE ON expenses
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.expense_category_id AND r.tenant_id = NEW.tenant_id AND r.type = 'expense_category')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.value_unit_id AND r.tenant_id = NEW.tenant_id AND r.type = 'value_unit')
  OR (NEW.price_list_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM expense_price_list_items p WHERE p.id = NEW.price_list_item_id AND p.tenant_id = NEW.tenant_id))
  OR (NEW.gold_price_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gold_prices g WHERE g.id = NEW.gold_price_id AND g.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_expense_price_list_items_same_tenant_insert
BEFORE INSERT ON expense_price_list_items
FOR EACH ROW
WHEN (NEW.superseded_price_list_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM expense_price_list_items p WHERE p.id = NEW.superseded_price_list_item_id AND p.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_expense_price_list_items_same_tenant_update
BEFORE UPDATE ON expense_price_list_items
FOR EACH ROW
WHEN (NEW.superseded_price_list_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM expense_price_list_items p WHERE p.id = NEW.superseded_price_list_item_id AND p.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_entries_same_tenant_insert
BEFORE INSERT ON ledger_entries
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.value_unit_id AND r.tenant_id = NEW.tenant_id AND r.type = 'value_unit')
  OR (NEW.related_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.related_entry_id AND l.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_entries_same_tenant_update
BEFORE UPDATE ON ledger_entries
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.value_unit_id AND r.tenant_id = NEW.tenant_id AND r.type = 'value_unit')
  OR (NEW.related_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.related_entry_id AND l.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_work_period_assignments_same_tenant_insert
BEFORE INSERT ON work_period_assignments
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM work_periods w WHERE w.id = NEW.work_period_id AND w.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.sector_id AND r.tenant_id = NEW.tenant_id AND r.type = 'sector')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.location_id AND r.tenant_id = NEW.tenant_id AND r.type = 'location')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.task_id AND r.tenant_id = NEW.tenant_id AND r.type = 'task')
  OR (NEW.replacement_for_assignment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work_period_assignments a WHERE a.id = NEW.replacement_for_assignment_id AND a.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_work_period_assignments_same_tenant_update
BEFORE UPDATE ON work_period_assignments
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM work_periods w WHERE w.id = NEW.work_period_id AND w.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.sector_id AND r.tenant_id = NEW.tenant_id AND r.type = 'sector')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.location_id AND r.tenant_id = NEW.tenant_id AND r.type = 'location')
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.task_id AND r.tenant_id = NEW.tenant_id AND r.type = 'task')
  OR (NEW.replacement_for_assignment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work_period_assignments a WHERE a.id = NEW.replacement_for_assignment_id AND a.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_gold_production_entries_same_tenant_insert
BEFORE INSERT ON gold_production_entries
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM work_periods w WHERE w.id = NEW.work_period_id AND w.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.location_id AND r.tenant_id = NEW.tenant_id AND r.type = 'location')
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_gold_production_entries_same_tenant_update
BEFORE UPDATE ON gold_production_entries
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM work_periods w WHERE w.id = NEW.work_period_id AND w.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM reference_data r WHERE r.id = NEW.location_id AND r.tenant_id = NEW.tenant_id AND r.type = 'location')
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_accrual_runs_same_tenant_insert
BEFORE INSERT ON accrual_runs
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM work_periods w WHERE w.id = NEW.work_period_id AND w.tenant_id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_accrual_runs_same_tenant_update
BEFORE UPDATE ON accrual_runs
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM work_periods w WHERE w.id = NEW.work_period_id AND w.tenant_id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_accrual_items_same_tenant_insert
BEFORE INSERT ON accrual_items
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM accrual_runs a WHERE a.id = NEW.accrual_run_id AND a.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM work_periods w WHERE w.id = NEW.work_period_id AND w.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR (NEW.work_period_assignment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work_period_assignments a WHERE a.id = NEW.work_period_assignment_id AND a.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_accrual_items_same_tenant_update
BEFORE UPDATE ON accrual_items
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM accrual_runs a WHERE a.id = NEW.accrual_run_id AND a.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM work_periods w WHERE w.id = NEW.work_period_id AND w.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR (NEW.work_period_assignment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work_period_assignments a WHERE a.id = NEW.work_period_assignment_id AND a.tenant_id = NEW.tenant_id))
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_journey_settlements_same_tenant_insert
BEFORE INSERT ON journey_settlements
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_journey_settlements_same_tenant_update
BEFORE UPDATE ON journey_settlements
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_receipts_same_tenant_insert
BEFORE INSERT ON ledger_receipts
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.ledger_entry_id AND l.tenant_id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;

CREATE TRIGGER IF NOT EXISTS trg_ledger_receipts_same_tenant_update
BEFORE UPDATE ON ledger_receipts
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM collaborator_journeys c WHERE c.id = NEW.collaborator_id AND c.tenant_id = NEW.tenant_id)
  OR NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = NEW.ledger_entry_id AND l.tenant_id = NEW.tenant_id)
BEGIN
  SELECT RAISE(ABORT, 'cross_tenant_reference');
END;
