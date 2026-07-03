# Enterprise Remote Systems — Comprehensive Test Plan

## 1. Purpose

This test plan defines a structured validation approach for **Enterprise Remote Systems (ERS)** so testing can be handed to a professional Testing Software Engineer.

The plan focuses on validating the end-to-end business workflows that matter most before production readiness:

1. Person onboarding
2. Collaborator onboarding
3. Work planning and work period assignment
4. Earnings/current account/ledger behavior
5. Expense creation and deduction
6. Receipt generation and return
7. Journey completion and settlement
8. Authorization, tenant isolation, and auditability
9. Environment promotion and regression stability

The goal is to move beyond “tests pass” and establish confidence that ERS behaves correctly under realistic operational scenarios.

---

## 2. System Overview

ERS manages People and Collaborators through a Journey lifecycle. A Person must be complete and eligible before becoming a Collaborator. A Collaborator works through a Journey, has Work Period planning, earns value, incurs expenses, maintains a Current Account balance, may receive PIX or other payouts, and must return signed receipts for deductions or sensitive account movements.

The system currently supports:

- People records
- Collaborator Journeys
- Reference data
- Expenses
- Current Accounts
- Ledger Entries
- Work Periods
- Work Period Assignments
- Receipts
- Authorization roles/grants
- Authorization Admin UI
- Authorization audit logs
- Multi-tenant data separation
- Development, Test, and Production deployments

---

## 3. Test Objectives

The test effort should validate that:

- Users can complete all core business workflows successfully.
- Invalid or incomplete data is rejected at the right layer.
- Financial movements are reflected correctly in ledger/current account state.
- Sensitive operations require authorization.
- Tenant isolation is enforced.
- Receipt requirements are enforced for all deductions and settlements.
- Journey completion produces correct final balances and obligations.
- E2E flows remain stable across local, DEV, TST, and PRD.
- Migrations are idempotent and safe across environments.
- The application is usable and understandable from the UI.

---

## 4. Test Levels

### 4.1 Unit Tests

Backend unit tests should validate service-level rules, repository behavior, authorization decisions, ledger calculations, and validation logic.

Examples:

- CPF/RG/cellular/email validation
- Duplicate Person detection
- Collaborator eligibility rules
- Expense validation
- Ledger debit/credit calculations
- Authorization role resolution
- Tenant ownership checks
- Receipt state transitions
- Journey completion calculations

### 4.2 Integration Tests

Integration tests should validate API handlers, database migrations, persistence behavior, and cross-module workflows.

Examples:

- Create Person → Create Collaborator
- Create Collaborator → Assign Work Period
- Create Expense → Ledger Entry → Receipt
- Receipt print → Receipt signed return
- Journey close → settlement ledger entries → receipts
- Authorization admin grant/revoke → protected route behavior

### 4.3 End-to-End Tests

E2E tests should validate real user workflows through the React frontend and API.

Existing Playwright tests already cover portions of:

- People creation
- Collaborator creation
- Expense creation/update/delete
- Receipts
- Authorization admin flow

This plan expands E2E coverage into full lifecycle validation.

### 4.4 Exploratory Testing

The Testing Engineer should perform guided exploratory sessions around risky areas:

- Duplicate data
- Authorization edge cases
- Current account balances
- Journey completion
- Receipt obligations
- Browser refresh/back-button behavior
- Long-running collaborator histories
- Multi-tenant access boundaries

---

## 5. Environments

### 5.1 Local

Used by developers and test engineers for fast validation.

Expected checks:

```bash
cd backend
go test ./...

cd ../frontend
npm run check
npm run test:e2e
```

### 5.2 Development

Used for automatic promotion validation after merging to `development`.

Validate:

- Container startup
- Migrations
- Health endpoint
- Smoke tests
- Playwright E2E
- Backend logs

### 5.3 Test

Used for release-candidate validation.

Validate:

- Full functional regression
- Smoke and E2E
- Manual workflow validation
- Data migration integrity

### 5.4 Production

Used only for smoke, health, and controlled operational checks.

Validate:

- Health endpoint
- Deployment health
- No unexpected migration failures
- No authorization bootstrap surprises
- No noisy backend errors

---

## 6. Test Data Strategy

### 6.1 Data Principles

Test data should be:

- Unique per run
- Tenant-scoped
- Easy to identify
- Safe to delete or ignore
- Representative of Brazilian operational data

Use prefixes such as:

```text
e2e-person-*
e2e-collaborator-*
e2e-expense-*
e2e-authz-*
manual-test-*
```

### 6.2 Person Test Data

Include combinations of:

- Valid CPF
- Duplicate CPF
- Valid RG
- Duplicate RG
- Valid Brazilian cellular
- Invalid cellular
- Valid email
- Duplicate email
- PIX key present
- PIX key missing
- Required fields missing
- Incomplete profile
- Complete profile
- Active status
- Inactive status

### 6.3 Collaborator Test Data

Include:

- Eligible complete Person
- Incomplete Person
- Person already attached to active Journey
- Person with inactive status
- Collaborator with active Journey
- Collaborator with closed Journey
- Collaborator near Journey end
- Collaborator past Journey end
- Collaborator with extension days

### 6.4 Financial Test Data

Include:

- Expense in BRL
- Expense in grams of gold
- Ledger debit
- Ledger credit
- Correction
- Reversal
- Replacement transfer
- PIX payout
- Gold zeroing
- Partial payout
- Journey settlement

### 6.5 Authorization Test Data

Include:

- Bootstrap application admin
- Tenant admin
- Earnings operator
- Expenses operator
- Unauthorized actor
- Actor with no grants
- Actor with revoked grant
- Actor assigned to one tenant attempting another tenant
- Person self-service actor linked to a Person
- Person self-service actor attempting another Person

---

## 7. Core Workflow Test Suites

The following sections define the main workflow-based test suites.

---

## 8. Onboarding Workflow Test Suite

### 8.1 Person Creation

#### Objective

Validate that a Person can be created only when required fields and uniqueness rules are satisfied.

#### Positive Cases

| Test ID | Scenario | Expected Result |
|---|---|---|
| ONB-PER-001 | Create Person with all required fields | Person is created and detail page opens |
| ONB-PER-002 | Create Person with valid Brazilian cellular | Person is created |
| ONB-PER-003 | Create Person with valid CPF, RG, email, cellular | Person is saved correctly |
| ONB-PER-004 | Create Person with PIX key | PIX key is saved |
| ONB-PER-005 | Create Person without optional future-only fields | Person is created if current required fields are present |

#### Negative Cases

| Test ID | Scenario | Expected Result |
|---|---|---|
| ONB-PER-101 | Missing first name | Validation error |
| ONB-PER-102 | Missing last name | Validation error |
| ONB-PER-103 | Missing nickname | Validation error under current rules |
| ONB-PER-104 | Missing CPF | Validation error |
| ONB-PER-105 | Missing RG | Validation error |
| ONB-PER-106 | Missing cellular | Validation error |
| ONB-PER-107 | Missing email | Validation error |
| ONB-PER-108 | Invalid Brazilian cellular | Validation error |
| ONB-PER-109 | Duplicate CPF in same tenant | Rejected |
| ONB-PER-110 | Duplicate RG in same tenant | Rejected |
| ONB-PER-111 | Duplicate cellular in same tenant | Rejected |
| ONB-PER-112 | Duplicate email in same tenant | Rejected |
| ONB-PER-113 | Duplicate PIX key in same tenant | Rejected |
| ONB-PER-114 | Duplicate CPF in different tenant | Allowed if tenant-scoped uniqueness is intended |
| ONB-PER-115 | Unauthorized actor creates Person | 401/403 |
| ONB-PER-116 | Actor from another tenant creates Person in wrong tenant | Rejected |

### 8.2 Person Update

#### Objective

Validate update behavior, especially duplicate checks excluding the current Person.

| Test ID | Scenario | Expected Result |
|---|---|---|
| ONB-PER-UPD-001 | Update own name fields | Success |
| ONB-PER-UPD-002 | Update CPF to same value | Success |
| ONB-PER-UPD-003 | Update CPF to another Person’s CPF | Rejected |
| ONB-PER-UPD-004 | Update RG to another Person’s RG | Rejected |
| ONB-PER-UPD-005 | Update email to another Person’s email | Rejected |
| ONB-PER-UPD-006 | Update cellular to another Person’s cellular | Rejected |
| ONB-PER-UPD-007 | Person self-service actor updates own Person | Success |
| ONB-PER-UPD-008 | Person self-service actor updates another Person | Rejected |
| ONB-PER-UPD-009 | Unauthorized actor updates Person | Rejected |

### 8.3 Collaborator Creation

#### Objective

Validate conversion from Person to Collaborator/Journey.

#### Positive Cases

| Test ID | Scenario | Expected Result |
|---|---|---|
| ONB-COL-001 | Create Collaborator from eligible complete Person | Collaborator Journey created |
| ONB-COL-002 | Eligible Person appears in dropdown | Person is selectable |
| ONB-COL-003 | Collaborator detail displays Person nickname/name | Correct display |
| ONB-COL-004 | Collaborator Journey start date recorded | Correct date |
| ONB-COL-005 | Journey end date calculated as start date + 90 days + extension days | Correct end date |

#### Negative Cases

| Test ID | Scenario | Expected Result |
|---|---|---|
| ONB-COL-101 | Incomplete Person not eligible | Cannot create Collaborator |
| ONB-COL-102 | Inactive Person not eligible | Rejected |
| ONB-COL-103 | Person already has active Journey | Rejected |
| ONB-COL-104 | Missing Person selection | Save disabled or rejected |
| ONB-COL-105 | Unauthorized actor creates Collaborator | Rejected |
| ONB-COL-106 | Actor without collaborator create permission | Rejected |
| ONB-COL-107 | Actor from another tenant attempts creation | Rejected |

---

## 9. Work Planning Workflow Test Suite

### 9.1 Work Period Creation

#### Objective

Validate Work Period definitions and daily planning rules.

| Test ID | Scenario | Expected Result |
|---|---|---|
| WPL-PER-001 | Create valid Work Period | Work Period created |
| WPL-PER-002 | Create duplicate Work Period for same date/tenant if prohibited | Rejected |
| WPL-PER-003 | Create Work Period with invalid date | Rejected |
| WPL-PER-004 | Unauthorized actor creates Work Period | Rejected |
| WPL-PER-005 | Earnings role creates Work Period | Allowed if role model says so |
| WPL-PER-006 | Expenses-only role creates Work Period | Rejected |

### 9.2 Work Period Assignment

#### Objective

Validate that Collaborators can be assigned to work periods according to business rules.

#### Critical Business Rule

A Collaborator works only **one Work Period per day**. Financial projections through Journey end must therefore use **one remaining potential Work Period per remaining calendar day**, not multiple periods per day.

#### Positive Cases

| Test ID | Scenario | Expected Result |
|---|---|---|
| WPL-ASG-001 | Assign active Collaborator to Work Period | Assignment succeeds |
| WPL-ASG-002 | Assignment appears in Work Period planning UI | Visible |
| WPL-ASG-003 | Assignment contributes to future earnings projection | Projection updates |
| WPL-ASG-004 | Assignment respects tenant scope | Tenant data only |

#### Negative Cases

| Test ID | Scenario | Expected Result |
|---|---|---|
| WPL-ASG-101 | Assign inactive Collaborator | Rejected |
| WPL-ASG-102 | Assign closed Journey Collaborator | Rejected |
| WPL-ASG-103 | Assign same Collaborator twice to same day | Rejected |
| WPL-ASG-104 | Assign Collaborator to two Work Periods on same date | Rejected |
| WPL-ASG-105 | Assign Collaborator past Journey end if not allowed | Rejected |
| WPL-ASG-106 | Unauthorized actor creates assignment | Rejected |
| WPL-ASG-107 | Actor from another tenant assigns Collaborator | Rejected |

### 9.3 Journey Days Remaining Indicator

#### Objective

Validate visual Journey remaining-day indicators.

#### Rules

- More than 30 days remaining: bold green
- 8 through 30 days remaining: bold yellow
- 7 days or fewer, including overdue: bold red

#### Required Screens

Validate indicator on:

- Collaborator list
- Collaborator detail
- Work Period planning
- Expense preparation
- Current/Future Earnings views

#### Cases

| Test ID | Scenario | Expected Result |
|---|---|---|
| WPL-JDY-001 | 31+ days remaining | Bold green |
| WPL-JDY-002 | 30 days remaining | Bold yellow |
| WPL-JDY-003 | 8 days remaining | Bold yellow |
| WPL-JDY-004 | 7 days remaining | Bold red |
| WPL-JDY-005 | 0 days remaining | Bold red |
| WPL-JDY-006 | Overdue Journey | Bold red |
| WPL-JDY-007 | Extension days added | End date and indicator update |

---

## 10. Expense Workflow Test Suite

### 10.1 Expense Creation

#### Objective

Validate that expenses are created only for valid active Collaborators and valid categories.

#### Positive Cases

| Test ID | Scenario | Expected Result |
|---|---|---|
| EXP-CRE-001 | Create BRL Expense for active Collaborator | Expense created |
| EXP-CRE-002 | Create grams-of-gold Expense for active Collaborator | Expense created |
| EXP-CRE-003 | Create Expense with category Canteen | Success |
| EXP-CRE-004 | Create Expense with category Flight | Success |
| EXP-CRE-005 | Create Expense with category Cargo | Success |
| EXP-CRE-006 | Create Expense with category Other | Success |
| EXP-CRE-007 | Expense appears in list | Visible |
| EXP-CRE-008 | Expense detail opens from list | Correct details |
| EXP-CRE-009 | Expense creates ledger debit if implemented | Current Account updated |
| EXP-CRE-010 | Expense creates receipt obligation if deduction | Receipt appears outstanding |

#### Negative Cases

| Test ID | Scenario | Expected Result |
|---|---|---|
| EXP-CRE-101 | Missing Collaborator | Rejected |
| EXP-CRE-102 | Missing category | Rejected |
| EXP-CRE-103 | Inactive category | Rejected |
| EXP-CRE-104 | Inactive Collaborator | Rejected |
| EXP-CRE-105 | Closed Collaborator Journey | Rejected |
| EXP-CRE-106 | Negative amount | Rejected |
| EXP-CRE-107 | Zero amount | Rejected |
| EXP-CRE-108 | Invalid currency/unit | Rejected |
| EXP-CRE-109 | Unauthorized actor creates Expense | Rejected |
| EXP-CRE-110 | Earnings-only actor creates Expense | Rejected |
| EXP-CRE-111 | Actor from another tenant creates Expense | Rejected |

### 10.2 Expense Filters and Pagination

| Test ID | Scenario | Expected Result |
|---|---|---|
| EXP-LST-001 | Filter by Collaborator | Only matching expenses |
| EXP-LST-002 | Filter by category | Only matching expenses |
| EXP-LST-003 | Filter by date range | Only matching expenses |
| EXP-LST-004 | Pagination first page | Correct number |
| EXP-LST-005 | Pagination next page | No duplicates |
| EXP-LST-006 | Soft-deleted Expense hidden by default | Hidden |

### 10.3 Expense Update

| Test ID | Scenario | Expected Result |
|---|---|---|
| EXP-UPD-001 | Update amount before finalization | Success if allowed |
| EXP-UPD-002 | Update category | Success if allowed |
| EXP-UPD-003 | Update to inactive category | Rejected |
| EXP-UPD-004 | Update unauthorized | Rejected |
| EXP-UPD-005 | Update after receipt returned if prohibited | Rejected |
| EXP-UPD-006 | Ledger correction required if financial effect changed | Correct correction entry |

### 10.4 Expense Soft Delete

| Test ID | Scenario | Expected Result |
|---|---|---|
| EXP-DEL-001 | Soft delete draft Expense | Success |
| EXP-DEL-002 | Soft-deleted Expense removed from default list | Hidden |
| EXP-DEL-003 | Delete unauthorized | Rejected |
| EXP-DEL-004 | Delete posted ledger Expense if prohibited | Rejected |
| EXP-DEL-005 | Delete posted ledger Expense if allowed via correction | Correction created and audited |

---

## 11. Current Account and Ledger Test Suite

### 11.1 Ledger Integrity

#### Objective

Validate that all account-impacting actions create correct immutable ledger records.

| Test ID | Scenario | Expected Result |
|---|---|---|
| LED-001 | Expense creates debit | Debit appears in ledger |
| LED-002 | Earnings create credit | Credit appears in ledger |
| LED-003 | PIX payout creates debit | Debit appears |
| LED-004 | Gold zeroing creates debit/conversion movement | Correct ledger entry |
| LED-005 | Correction creates reversal metadata | Correction linked |
| LED-006 | Replacement transfer creates expected entries | Balanced result |
| LED-007 | Ledger balance equals sum of entries | Current Account correct |
| LED-008 | Ledger entries are tenant-scoped | No cross-tenant leakage |
| LED-009 | Ledger entry cannot be silently deleted | Rejected or impossible |
| LED-010 | Sensitive ledger operations audited | Authz audit entry created |

### 11.2 Current Account Summary

| Test ID | Scenario | Expected Result |
|---|---|---|
| CUR-001 | New Collaborator current account | Zero or expected initial balance |
| CUR-002 | Expense updates current account | Balance decreases |
| CUR-003 | Earnings update current account | Balance increases |
| CUR-004 | PIX payout updates current account | BRL balance decreases |
| CUR-005 | Gold conversion uses most recent tenant conversion | Correct BRL result |
| CUR-006 | Account summary reflects all PIX remittances | Complete history |
| CUR-007 | Closed Journey account remains readable | Read-only or settlement state |
| CUR-008 | Unauthorized actor reads summary | Rejected |
| CUR-009 | Expenses role reads summary | Allowed if role model permits |
| CUR-010 | Actor from another tenant reads summary | Rejected |

---

## 12. Receipt Workflow Test Suite

### 12.1 Receipt Generation

#### Business Rule

Every debit from a Collaborator current account must generate a receipt signed and returned. This applies to:

- BRL payouts
- Gold zeroing/payouts
- Expenses
- Replacement transfers
- Corrections
- Closing settlements

| Test ID | Scenario | Expected Result |
|---|---|---|
| RCP-GEN-001 | Expense deduction generates receipt | Outstanding receipt created |
| RCP-GEN-002 | PIX payout generates receipt | Outstanding receipt created |
| RCP-GEN-003 | Gold zeroing generates receipt | Outstanding receipt created |
| RCP-GEN-004 | Correction debit generates receipt | Outstanding receipt created |
| RCP-GEN-005 | Journey settlement debit generates receipt | Outstanding receipt created |
| RCP-GEN-006 | Non-debit informational operation does not generate receipt | No receipt |
| RCP-GEN-007 | Receipt contains correct amount/unit | Correct |
| RCP-GEN-008 | Receipt references source ledger entry | Correct |

### 12.2 Receipt Print/Open

| Test ID | Scenario | Expected Result |
|---|---|---|
| RCP-PRN-001 | Outstanding receipt visible | Appears in outstanding list |
| RCP-PRN-002 | Open receipt detail | Correct details |
| RCP-PRN-003 | Print receipt | Print/export works |
| RCP-PRN-004 | Unauthorized actor prints receipt | Rejected |
| RCP-PRN-005 | Receipt print operation audited | Audit log created |

### 12.3 Receipt Signed Return

| Test ID | Scenario | Expected Result |
|---|---|---|
| RCP-RET-001 | Mark receipt signed/returned | Receipt no longer outstanding |
| RCP-RET-002 | Returned receipt remains in history | Visible in history if supported |
| RCP-RET-003 | Return without required metadata | Rejected if required |
| RCP-RET-004 | Return already returned receipt | Idempotent or rejected consistently |
| RCP-RET-005 | Unauthorized actor returns receipt | Rejected |
| RCP-RET-006 | Signed return audited | Audit log created |

---

## 13. Journey Completion Workflow Test Suite

### 13.1 Journey End Calculation

#### Rule

Journey end date = start date + 90 days + extension days.

| Test ID | Scenario | Expected Result |
|---|---|---|
| JRN-END-001 | Journey with no extension | End = start + 90 days |
| JRN-END-002 | Journey with extension days | End = start + 90 + extension |
| JRN-END-003 | Extension updated | End date recalculated |
| JRN-END-004 | Negative extension if invalid | Rejected |
| JRN-END-005 | Overdue Journey | Marked/indicated correctly |

### 13.2 Pre-Completion Validation

#### Objective

Before closing a Journey, the system should detect unresolved obligations.

| Test ID | Scenario | Expected Result |
|---|---|---|
| JRN-PRE-001 | Attempt close with outstanding receipt | Rejected or warning requiring resolution |
| JRN-PRE-002 | Attempt close with unsettled balance | Settlement flow required |
| JRN-PRE-003 | Attempt close with pending expense | Rejected or included in settlement |
| JRN-PRE-004 | Attempt close with future Work Period assignments | Rejected or requires cleanup |
| JRN-PRE-005 | Unauthorized actor attempts close | Rejected |
| JRN-PRE-006 | Actor from another tenant attempts close | Rejected |

### 13.3 Closing Settlement

#### Objective

Validate final account settlement at Journey completion.

| Test ID | Scenario | Expected Result |
|---|---|---|
| JRN-CLS-001 | Close Journey with zero balance | Journey closes cleanly |
| JRN-CLS-002 | Close Journey with positive BRL balance | Settlement payout required |
| JRN-CLS-003 | Close Journey with negative BRL balance | Settlement deduction/receivable recorded |
| JRN-CLS-004 | Close Journey with gold balance | Gold zeroing/conversion required |
| JRN-CLS-005 | Close Journey with mixed BRL/gold balance | Correct settlement entries |
| JRN-CLS-006 | Closing creates ledger entries | Correct entries |
| JRN-CLS-007 | Closing creates required receipts | Outstanding receipts created |
| JRN-CLS-008 | Closing operation audited | Authz audit entry created |
| JRN-CLS-009 | Closed Journey no longer accepts expenses | Rejected |
| JRN-CLS-010 | Closed Journey no longer accepts Work Period assignment | Rejected |
| JRN-CLS-011 | Closed Journey remains readable | Detail/history available |

### 13.4 Post-Completion Behavior

| Test ID | Scenario | Expected Result |
|---|---|---|
| JRN-POST-001 | Collaborator appears closed/inactive | Correct status |
| JRN-POST-002 | Current account is read-only or settlement-only | Correct behavior |
| JRN-POST-003 | New Journey for same Person if allowed | Defined behavior |
| JRN-POST-004 | Duplicate active Journey still blocked | Rejected |
| JRN-POST-005 | Historical ledger remains visible | Visible |
| JRN-POST-006 | Historical receipts remain visible | Visible |
| JRN-POST-007 | Journey completion reflected in lists | Correct display |

---

## 14. Authorization and Security Test Suite

### 14.1 Role-Based Access

Validate the agreed role model.

#### Roles

- Application Admin
- Tenant Admin
- Earnings role
- Expenses role
- Person self-service actor
- Unauthorized actor

| Test ID | Scenario | Expected Result |
|---|---|---|
| AUTH-001 | Application Admin can access all tenants | Allowed |
| AUTH-002 | Tenant Admin can access own tenant | Allowed |
| AUTH-003 | Tenant Admin cannot access another tenant | Rejected |
| AUTH-004 | Earnings role can read tenant collaborator records | Allowed |
| AUTH-005 | Earnings role can create/update planning | Allowed |
| AUTH-006 | Earnings role cannot perform expenses-only operations | Rejected |
| AUTH-007 | Expenses role can create expenses | Allowed |
| AUTH-008 | Expenses role can read current account summary | Allowed |
| AUTH-009 | Expenses role cannot manage authorization | Rejected |
| AUTH-010 | Unauthorized actor receives 403 | Rejected |
| AUTH-011 | Missing actor receives 401 | Rejected |
| AUTH-012 | Revoked role no longer permits access | Rejected |
| AUTH-013 | Person self-service reads own profile | Allowed |
| AUTH-014 | Person self-service reads another profile | Rejected |

### 14.2 Authorization Admin UI

| Test ID | Scenario | Expected Result |
|---|---|---|
| AUTH-ADM-001 | Authorization Admin page loads for admin | Visible |
| AUTH-ADM-002 | Roles visible | Visible |
| AUTH-ADM-003 | Permissions visible | Visible |
| AUTH-ADM-004 | Create actor | Actor appears |
| AUTH-ADM-005 | Grant role | Grant appears |
| AUTH-ADM-006 | Revoke role | Grant disappears |
| AUTH-ADM-007 | Revoked grant not shown as active | Hidden |
| AUTH-ADM-008 | Non-admin opens page | Rejected or unauthorized UI |
| AUTH-ADM-009 | Operations audited | Audit logs created |

### 14.3 Authorization Audit Logs

| Test ID | Scenario | Expected Result |
|---|---|---|
| AUTH-AUD-001 | Sensitive operation allowed | Audit log records allowed decision |
| AUTH-AUD-002 | Sensitive operation denied | Audit log records denied decision |
| AUTH-AUD-003 | Receipt print audited | Present |
| AUTH-AUD-004 | Receipt return audited | Present |
| AUTH-AUD-005 | Ledger correction audited | Present |
| AUTH-AUD-006 | Journey close audited | Present |
| AUTH-AUD-007 | Authz actor create audited | Present |
| AUTH-AUD-008 | Role grant audited | Present |
| AUTH-AUD-009 | Role revoke audited | Present |
| AUTH-AUD-010 | Audit logs tenant-scoped | Correct isolation |

---

## 15. Multi-Tenant Isolation Test Suite

| Test ID | Scenario | Expected Result |
|---|---|---|
| TEN-001 | Tenant A Person invisible to Tenant B | Isolated |
| TEN-002 | Tenant A Collaborator invisible to Tenant B | Isolated |
| TEN-003 | Tenant A Expense invisible to Tenant B | Isolated |
| TEN-004 | Tenant A Ledger invisible to Tenant B | Isolated |
| TEN-005 | Tenant A Receipt invisible to Tenant B | Isolated |
| TEN-006 | Tenant A Work Period invisible to Tenant B | Isolated |
| TEN-007 | Tenant A reference data not mutable by Tenant B | Rejected |
| TEN-008 | Duplicate CPF allowed across tenants if intended | Allowed |
| TEN-009 | Actor with tenant grant cannot override header to another tenant | Rejected |
| TEN-010 | Application Admin can intentionally access multiple tenants | Allowed |

---

## 16. Reference Data Test Suite

| Test ID | Scenario | Expected Result |
|---|---|---|
| REF-001 | Create reference data | Success |
| REF-002 | Duplicate reference data in same tenant/type | Rejected |
| REF-003 | Same reference data in another tenant | Allowed if tenant-scoped |
| REF-004 | Deactivate category | Hidden or inactive |
| REF-005 | Inactive expense category rejected for Expense | Rejected |
| REF-006 | Reactivate category | Usable again |
| REF-007 | Unauthorized actor manages reference data | Rejected |

---

## 17. Migration and Deployment Test Suite

### 17.1 Migration Idempotency

| Test ID | Scenario | Expected Result |
|---|---|---|
| MIG-001 | Fresh DB applies all migrations | Success |
| MIG-002 | Existing DB skips applied migrations | Success |
| MIG-003 | Re-run container startup | No duplicate migration failure |
| MIG-004 | Migration chain 000000 through latest present | Complete |
| MIG-005 | Seed data idempotent | No duplicate constraint errors |

### 17.2 Environment Promotion

| Test ID | Scenario | Expected Result |
|---|---|---|
| DEP-001 | Push issue branch | CI passes |
| DEP-002 | Merge to development | DEV deploys |
| DEP-003 | DEV smoke | Pass |
| DEP-004 | DEV E2E | Pass |
| DEP-005 | Promote to test | TST deploys |
| DEP-006 | TST smoke | Pass |
| DEP-007 | Promote to production | PRD deploys |
| DEP-008 | PRD smoke | Pass |
| DEP-009 | Backend logs clean after deployment | No unexpected errors |

---

## 18. UI/UX Test Suite

| Test ID | Scenario | Expected Result |
|---|---|---|
| UI-001 | Navigation links visible based on role | Correct |
| UI-002 | Unauthorized pages show useful error | Clear |
| UI-003 | Form validation messages readable | Clear |
| UI-004 | Save buttons disabled when required fields missing | Correct |
| UI-005 | Loading states visible | Correct |
| UI-006 | Error states visible | Correct |
| UI-007 | Lists empty state readable | Correct |
| UI-008 | Detail pages handle missing records | Not blank |
| UI-009 | Browser refresh preserves page behavior | Correct |
| UI-010 | Back button does not duplicate submissions | Correct |
| UI-011 | Mobile/tablet layout acceptable if supported | Acceptable |

---

## 19. Non-Functional Test Areas

### 19.1 Performance

Initial targets should be practical rather than strict:

| Area | Target |
|---|---|
| People list | Loads under 2 seconds with 500 records |
| Collaborator list | Loads under 2 seconds with 500 records |
| Expense list | Loads under 2 seconds with 1,000 records |
| Current account summary | Loads under 2 seconds with 1,000 ledger entries |
| Authorization admin page | Loads under 2 seconds with 100 actors |

### 19.2 Reliability

Validate:

- No blank screens on API errors
- No duplicate submissions on double-click
- No inconsistent UI after failed save
- E2E tests stable across repeated runs
- Logs do not contain expected-control-flow errors

### 19.3 Security

Validate:

- Missing actor rejected
- Unauthorized actor rejected
- Revoked grants no longer work
- Tenant header manipulation blocked
- Sensitive operations audited
- No sensitive fields leaked in frontend logs
- No raw stack traces exposed to users

---

## 20. Regression Suite

The minimum regression suite before promotion should include:

```text
1. Backend: go test ./...
2. Frontend: npm run check
3. E2E: npm run test:e2e
4. DEV smoke
5. DEV deployed E2E
6. Backend log review
```

Core E2E regression scenarios:

```text
1. Frontend root responds
2. Create Person
3. Required-field validation
4. Duplicate CPF validation
5. Valid Brazilian cellular
6. Create Collaborator from eligible Person
7. Create Expense for active Collaborator
8. Open Expense detail
9. Expense filters/pagination
10. Expense update/soft delete
11. Reject Expense for non-active Collaborator
12. Expense client validation
13. Outstanding receipt open/return flow
14. Authorization admin actor create/grant/revoke
```

Recommended expanded E2E additions:

```text
15. Work Period planning assignment
16. Prevent duplicate same-day Work Period assignment
17. Journey days remaining indicator
18. Current account summary after expense
19. Current account summary after payout
20. Journey close with zero balance
21. Journey close with positive balance requiring settlement
22. Journey close blocked by outstanding receipt
23. Person self-service own-profile access
24. Cross-tenant access rejection
25. Authorization audit log visibility
```

---

## 21. Defect Reporting Standard

Each defect should include:

```text
Title
Environment
Build/commit SHA
Role/actor used
Tenant used
Preconditions
Steps to reproduce
Expected result
Actual result
Screenshots/video
API request/response if relevant
Backend logs if relevant
Severity
Business impact
Suggested regression test
```

Severity guide:

| Severity | Meaning |
|---|---|
| Critical | Data loss, financial corruption, unauthorized sensitive access, production outage |
| High | Core workflow blocked, incorrect ledger/receipt/journey result |
| Medium | Workflow workaround exists but behavior is wrong |
| Low | Cosmetic, wording, non-blocking UI issue |

---

## 22. Acceptance Criteria Before Production Readiness

ERS should not be considered production-ready until:

```text
1. All backend tests pass.
2. Frontend type/lint/check passes.
3. E2E suite passes locally and in DEV.
4. DEV, TST, and PRD smoke checks pass.
5. No unexpected migration errors.
6. No unexplained backend log errors after deployment.
7. People onboarding workflow validated.
8. Collaborator onboarding workflow validated.
9. Work planning workflow validated.
10. Expense workflow validated.
11. Receipt workflow validated.
12. Current account/ledger calculations validated.
13. Journey completion workflow validated.
14. Authorization role model validated.
15. Tenant isolation validated.
16. Sensitive operations produce audit logs.
17. Financial debit operations produce receipts.
18. Test engineer signs off on release candidate.
```

---

## 23. Initial Execution Roadmap

### Phase 1 — Stabilize Automated Regression

Duration: 1–2 weeks

Focus:

- Review existing backend tests
- Review existing Playwright tests
- Remove brittle locators
- Add stable `data-testid` values where appropriate
- Ensure local and DEV E2E behave consistently
- Define reusable test data helpers

Deliverables:

- Stable local E2E
- Stable DEV E2E
- Regression test inventory
- Defect backlog

### Phase 2 — Core Workflow Validation

Duration: 2–3 weeks

Focus:

- Onboarding workflow
- Work planning workflow
- Expense workflow
- Receipt workflow
- Current account workflow

Deliverables:

- Manual test cases
- Automated coverage recommendations
- High-risk defect report
- Updated E2E coverage

### Phase 3 — Journey Completion and Financial Integrity

Duration: 2–3 weeks

Focus:

- Journey close
- Settlement behavior
- Ledger correctness
- Receipt obligations
- Audit logs

Deliverables:

- Journey completion test suite
- Ledger validation matrix
- Settlement validation matrix
- Production readiness risks

### Phase 4 — Security, Tenant Isolation, and Release Certification

Duration: 1–2 weeks

Focus:

- Authorization matrix
- Tenant boundary testing
- Audit log validation
- Environment promotion validation
- Final release signoff

Deliverables:

- Authorization test report
- Tenant isolation test report
- Release candidate signoff checklist
- Known issues list

---

## 24. Recommended First Tasks for Testing Engineer

1. Clone the repository and run all local checks.
2. Review current E2E suite and identify fragile selectors.
3. Build a test data catalog.
4. Create a role/permission test matrix.
5. Create onboarding manual test cases.
6. Create work planning manual test cases.
7. Create expense and receipt manual test cases.
8. Create journey completion manual test cases.
9. Validate DEV deployment logs after a clean promotion.
10. Produce a first risk report after one exploratory testing pass.

---

## 25. Open Questions for Product/Engineering

The Testing Engineer should clarify these before finalizing expected results:

1. Can a Person have multiple historical Journeys, as long as only one is active?
2. Can expenses be edited after ledger posting?
3. Can expenses be deleted after receipt generation?
4. Should Journey close be blocked by outstanding receipts?
5. Should Journey close automatically generate settlement receipts?
6. What is the exact expected behavior for negative final balances?
7. What is the exact expected behavior for gold balances at close?
8. Are PIX payouts fully implemented or still pending?
9. Should expense grams-of-gold deductions use a conversion rate or stay as gold balance only?
10. Which roles are allowed to perform Journey close?
11. Which roles are allowed to perform ledger correction?
12. Which screens should be accessible to Person self-service users?
13. Should production keep temporary header-based actor support until real login is complete?
14. What minimum audit log retention is required?
15. What receipt artifact format is required for operational use?

---

## 26. Suggested Test Case Management Structure

Recommended folders:

```text
ERS
├── 01 Smoke
├── 02 Onboarding
│   ├── People
│   └── Collaborators
├── 03 Work Planning
├── 04 Expenses
├── 05 Current Account and Ledger
├── 06 Receipts
├── 07 Journey Completion
├── 08 Authorization
├── 09 Tenant Isolation
├── 10 Reference Data
├── 11 Migration and Deployment
├── 12 UI/UX
└── 13 Regression
```

Each test case should include:

```text
ID
Title
Priority
Type: Manual / Automated / Candidate for Automation
Preconditions
Test data
Steps
Expected result
Actual result
Status
Defect link
Notes
```

---

## 27. Automation Recommendations

Prioritize automation for:

```text
1. Smoke tests
2. Person creation and validation
3. Collaborator creation
4. Expense creation
5. Receipt return
6. Authorization admin grant/revoke
7. Role access denial
8. Cross-tenant denial
9. Current account balance after expense
10. Journey close happy path
11. Journey close blocked by outstanding receipt
```

Avoid automating too early:

```text
1. Highly volatile UI layouts
2. Workflows with unsettled product rules
3. Complex financial edge cases before expected result formulas are finalized
4. Screens still undergoing redesign
```

---

## 28. Final Recommendation

The testing handoff should begin with a professional tester validating the four most important operational journeys:

```text
1. Onboard Person → create Collaborator Journey
2. Plan Work Period → assign Collaborator → verify projected/current earnings behavior
3. Create Expense → verify Current Account debit → verify Receipt obligation → return signed Receipt
4. Complete Journey → settle final balances → verify Ledger, Receipts, Audit Logs, and closed-state behavior
```

Once those journeys are stable manually, the highest-value paths should become automated Playwright E2E tests and backend integration tests.
