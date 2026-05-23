# Enterprise Remote Systems — Master Architecture Package

## 1. Executive Summary

This application is a mobile-first business system for managing collaborators working for a company with remote operations. It tracks:

- people under contract or eligible to return,
- collaborator work journeys,
- mine-well production,
- gold prices,
- price lists for mercantile goods and services,
- earnings accruals,
- expenses,
- current-account balances in both Real and grams of gold,
- projected earnings through the end of the current journey,
- journey closeout and payout.

The target stack is:

- **Backend:** Golang + Fiber
- **Database:** SQLite + GORM
- **Frontend:** React, mobile-first, desktop-capable
- **Architecture style:** modular monolith with clean domain boundaries

This system is not a simple CRUD application. It is a hybrid of workforce management, payroll, production-linked commission accounting, mercantile expense tracking, and dual-currency ledger management.

---

## 2. Product Goals

The system must allow an administrator and planner to:

1. Maintain permanent records for people and collaborator journeys.
2. Track collaborator assignments and planning by work period.
3. Accrue earnings based on daily wages, salary, or production commission.
4. Record collaborator expenses in either Real or grams of gold.
5. View current-account summaries and details in both currencies.
6. Estimate projected earnings through the projected end of a collaborator’s current journey.
7. Support sick-day and license substitution rules involving daily wagers and commissioned collaborators.
8. Revert erroneous ledger transactions without destructive deletion.
9. Zero out gold balances on request during a journey.
10. Close a work journey and compute payout obligations.

---

## 3. Key Assumptions and Clarifications

The source requirements are strong, but several operational rules must be made explicit for implementation.

### 3.1 Non-destructive records

The following records are never physically deleted:

- Person
- Collaborator
- Current Account Entry
- Mine Well Production
- Gold Price
- Price List Items
- Reference Data

Instead, records are managed with status flags, activity flags, effective dates, or reversal records.

### 3.2 Modular monolith first

The recommended architecture is a **modular monolith**, not microservices, because:

- business rules are tightly coupled,
- SQLite is the requested database,
- deployment simplicity matters for remote operations,
- transaction safety across accounting workflows is easier in one process,
- future extraction to services remains possible.

### 3.3 Ledger is the source of truth

Balances are derived from immutable current-account entries and reversals, not from mutable balance fields.

### 3.4 Dual-currency ledger

The system tracks accounting in two units:

- **BRL (Real)**
- **Gold grams**

A current-account entry belongs to exactly one currency. Summaries compute balances separately for each currency.

### 3.5 Salary accrual cadence

Because salary is specified as a monthly salary, but work planning operates in daily work periods, the design assumes:

- monthly salary is normalized to a **daily accrual rate** for daily projected earning calculations,
- the normalization formula is configurable,
- the default formula is `monthly_salary / 30`.

### 3.6 Daily period model

Mine-well production is recorded by:

- date
- period
- well

Each period is a 12-hour shift. The plan/accrual engine uses a formal `work_period` entity to anchor planning and earnings.

### 3.7 Commission basis

Commissioned collaborators earn based on:

- assigned work well,
- work period,
- recorded well production,
- collaborator commission percentage.

If required production is missing, accrual status remains `pending` until production is recorded.

### 3.8 Sick-day and license rules

The specification implies substitution-based earnings transfer logic. The implementation will support explicit substitution links so every exception is auditable.

### 3.9 Work journey lifecycle

A collaborator journey has:

- start date,
- default end date = start date + 90 days,
- extension days,
- projected end date = default end + extension days,
- status transitions,
- closure workflow.

### 3.10 Role model

Initial recommended roles:

- **Administrator**: full access
- **Planner**: planning, accrual, production support
- **Mercantile Operator**: expense entry, read summaries
- **Finance Viewer**: read-only reports and ledgers

---

## 4. Architecture Overview

## 4.1 High-level architecture

```text
React Mobile-First Frontend
        |
        v
Fiber HTTP API
        |
        v
Application Layer / Use Cases
        |
        v
Domain Modules
  - Auth
  - People
  - Collaborators
  - Reference Data
  - Work Period Planning
  - Mine Production
  - Gold Pricing
  - Price List
  - Expenses
  - Earnings
  - Current Account Ledger
  - Journey Closure
  - Reports
        |
        v
GORM Repositories
        |
        v
SQLite
```

## 4.2 Recommended module boundaries

1. **auth**
2. **people**
3. **collaborators**
4. **reference_data**
5. **work_periods**
6. **planning**
7. **mine_production**
8. **gold_prices**
9. **price_list**
10. **expenses**
11. **earnings**
12. **ledger**
13. **journey_closure**
14. **reports**
15. **audit**

---

## 5. Core Domain Model

## 5.1 Person

Permanent identity and contact record.

### Fields

- id
- name
- address
- phone
- email
- cpf
- bank_data
- pix_key
- emergency_contact_name
- emergency_contact_phone
- emergency_contact_notes
- status
- created_at
- updated_at
- archived_at nullable

### Constraints

- unique(name)
- unique(phone)
- unique(email)
- unique(cpf)
- unique(pix_key)

### Notes

A person may have many collaborator journeys over time.

---

## 5.2 Collaborator Journey

Represents a specific contractual work journey for a person.

### Fields

- id
- person_id
- journey_start_date
- default_end_date
- extension_days
- projected_end_date
- payment_method_id
- payment_value
- sector_id
- location_id
- task_id
- status_id
- notes
- created_at
- updated_at
- closed_at nullable

### Derived values

- `default_end_date = journey_start_date + 90 days`
- `projected_end_date = default_end_date + extension_days`

### Constraints

- no physical deletion
- one person may have multiple journeys across time
- optional rule: only one active collaborator journey per person at a time

---

## 5.3 Mine Well Production

Production recorded for a specific well and period.

### Fields

- id
- work_date
- period_code
- location_id
- grams_produced
- comments
- created_by
- created_at
- updated_at

### Constraints

- unique(work_date, period_code, location_id)
- location must be a mine-well type location

---

## 5.4 Gold Price

Daily gold reference price.

### Fields

- id
- quote_date
- quoted_at_time
- price_brl_per_gram
- source_name
- comments
- created_by
- created_at
- updated_at

### Constraints

- unique(quote_date)

### Notes

Default rule: use most recent quote at time of transaction.

---

## 5.5 Price List Item

Catalog of goods and services.

### Fields

- id
- code
- name
- description
- category
- price_brl
- active
- created_at
- updated_at

### Derived field at runtime

- `price_gold_grams = price_brl / latest_gold_price_brl_per_gram`

### Notes

Gold price equivalent is usually computed dynamically and optionally snapshot into expense line items.

---

## 5.6 Current Account Entry

Immutable ledger entry representing a credit or debit in one currency.

### Fields

- id
- reverted_entry_id nullable
- collaborator_id
- entry_date
- source_type
- source_id nullable
- method_id nullable
- currency_code
- cd_flag
- item_description
- quantity
- unit_price
- total_price
- comments
- status
- created_by
- created_at

### Allowed source types

- earning_accrual
- expense
- reversal
- zero_out
- journey_close
- manual_adjustment

### Allowed currencies

- BRL
- GOLD_GRAMS

### Allowed cd_flag

- CREDIT
- DEBIT

### Constraints

- quantity > 0
- total_price >= 0
- reversal entries reference original entry
- original entries are not edited after posting

---

## 5.7 Work Period

A plan/accrual anchor for operational periods.

### Fields

- id
- work_date
- period_code
- starts_at
- ends_at
- status
- created_at
- updated_at

### Status

- planned
- informed
- accrued
- locked

### Constraints

- unique(work_date, period_code)

---

## 5.8 Work Plan Item

Operational assignment of a collaborator for a work period.

### Fields

- id
- work_period_id
- collaborator_id
- include_flag
- sector_id
- location_id
- task_id
- method_id
- payment_value_snapshot
- assignment_status
- substituted_for_collaborator_id nullable
- exception_type nullable
- comments
- created_at
- updated_at

### assignment_status

- planned
- worked
- sick
- license
- absent
- excluded

### exception_type

- none
- sick_substitution
- license_substitution

---

## 5.9 Expense Transaction

Header record for an expense operation.

### Fields

- id
- collaborator_id
- expense_date
- currency_code
- total_amount
- category
- collaborator_agreement
- comments
- created_by
- created_at
- updated_at

### Categories

- canteen
- pix
- flights
- pay_daily_wager
- diverse

---

## 5.10 Expense Item

Line item under an expense transaction.

### Fields

- id
- expense_id
- price_list_item_id nullable
- item_name_snapshot
- quantity
- unit_price
- total_price
- comments
- created_at

---

## 5.11 Earning Accrual Batch

Tracks the accrual operation for a work period.

### Fields

- id
- work_period_id
- accrual_status
- comments
- created_by
- created_at
- updated_at

### accrual_status

- draft
- pending_production
- posted
- partially_posted
- reverted

---

## 5.12 Earning Accrual Item

One collaborator’s earnings computation for a period.

### Fields

- id
- accrual_batch_id
- collaborator_id
- method_id
- currency_code
- calculation_basis_json
- gross_amount
- transfer_amount
- net_amount
- ledger_entry_id nullable
- status
- comments
- created_at

---

## 5.13 Reference Data

Configurable lookup tables.

Recommended generic table structure:

- id
- type
- code
- label
- description
- active
- sort_order
- metadata_json
- created_at
- updated_at

Supported types:

- sector
- location
- task
- method
- person_status
- collaborator_status
- expense_category
- period_code
- ledger_currency
- ledger_cd_flag

---

## 6. Business Rules Matrix

## 6.1 Person rules

- Person records are permanent.
- Name, phone, email, CPF, and PIX must be unique if present.
- A person can move across statuses without deleting history.

## 6.2 Collaborator rules

- A collaborator journey is created from a person.
- Default journey length is 90 days.
- Extension days may be added by the administrator.
- Projected end date is recalculated on extension change.
- One person should generally have at most one active journey.
- After journey end, business policy may enforce a minimum 30-day wait before a new journey. This should be configurable as a validation rule, with override permission for administrators.

## 6.3 Earnings rules

### Daily wages

- Earns daily rate for each worked period/day according to plan/accrual rules.
- Currency is BRL unless business later adds another rule.

### Salary

- Earns daily normalized value based on monthly salary.
- Currency is BRL.

### Commission

- Earns in gold grams.
- Amount is tied to recorded production for assigned well and period.
- Formula: `grams_produced * collaborator_percentage`.
- Accrual waits if production is missing.

## 6.4 Sick-day rules

For commissioned collaborator:

- May take up to 3 sick days.
- Still earns full daily commission.
- Pays 1 gram gold to substitute daily wager.
- Substitute daily wager also earns normal daily wages.

System interpretation:

- one commission credit for sick collaborator,
- one gold debit for sick collaborator labeled `Pay Daily Wager - Sick Substitution`,
- one gold credit for substitute daily wager labeled `Sick Substitution Payment`,
- one BRL wage credit for substitute daily wager.

## 6.5 License rules

For commissioned collaborator:

- May take a license through default end of journey.
- Earns half of daily commission.
- Other half goes to substitute daily wager.
- Substitute daily wager does not earn normal daily wages for that substitution period.

System interpretation:

- commissioned collaborator gets half commission credit,
- substitute gets half commission credit,
- substitute receives no daily wage credit for those substituted periods.

## 6.6 Expense rules

- Expenses can be recorded in BRL or gold grams.
- Expense line items snapshot unit and total prices at entry time.
- Gold-priced expenses use current quote basis at transaction time.
- PIX expenses are BRL-only.
- Daily wager substitution payments may be generated automatically by earnings/accrual rules rather than manually entered.

## 6.7 Ledger rules

- Every financial effect becomes one or more immutable ledger entries.
- Reversal is additive, never destructive.
- Balances are computed as sum(credits) - sum(debits) per currency.
- Reversed entries remain visible with status markers.

## 6.8 Zero rules

- Zeroing gold means paying out current positive gold balance during an active journey.
- A zero operation creates a debit entry that offsets the available gold credit balance.
- Zero cannot exceed available positive gold balance unless admin override is allowed.

## 6.9 Journey close rules

- Closing a journey computes current BRL and gold balances.
- Positive balances are payable.
- Closing creates payout ledger entries to offset balances.
- After close, collaborator status becomes finished.

---

## 7. SQLite / GORM Schema Proposal

## 7.1 Tables

1. users
2. roles
3. user_roles
4. people
5. collaborator_journeys
6. reference_data
7. work_periods
8. work_plan_items
9. mine_well_productions
10. gold_prices
11. price_list_items
12. expense_transactions
13. expense_items
14. earning_accrual_batches
15. earning_accrual_items
16. current_account_entries
17. audit_logs
18. attachments (optional future)

## 7.2 Example table definitions

### people

- id TEXT PK
- name TEXT NOT NULL UNIQUE
- address TEXT
- phone TEXT UNIQUE
- email TEXT UNIQUE
- cpf TEXT UNIQUE
- bank_data TEXT
- pix_key TEXT UNIQUE
- emergency_contact_name TEXT
- emergency_contact_phone TEXT
- emergency_contact_notes TEXT
- status_id TEXT NOT NULL
- created_at DATETIME NOT NULL
- updated_at DATETIME NOT NULL

### collaborator_journeys

- id TEXT PK
- person_id TEXT NOT NULL FK people(id)
- journey_start_date DATE NOT NULL
- default_end_date DATE NOT NULL
- extension_days INTEGER NOT NULL DEFAULT 0
- projected_end_date DATE NOT NULL
- payment_method_id TEXT NOT NULL FK reference_data(id)
- payment_value NUMERIC NOT NULL
- sector_id TEXT NOT NULL FK reference_data(id)
- location_id TEXT NOT NULL FK reference_data(id)
- task_id TEXT NOT NULL FK reference_data(id)
- status_id TEXT NOT NULL FK reference_data(id)
- notes TEXT
- closed_at DATETIME NULL
- created_at DATETIME NOT NULL
- updated_at DATETIME NOT NULL

### work_periods

- id TEXT PK
- work_date DATE NOT NULL
- period_code TEXT NOT NULL
- starts_at DATETIME NULL
- ends_at DATETIME NULL
- status TEXT NOT NULL
- created_at DATETIME NOT NULL
- updated_at DATETIME NOT NULL
- UNIQUE(work_date, period_code)

### work_plan_items

- id TEXT PK
- work_period_id TEXT NOT NULL FK work_periods(id)
- collaborator_id TEXT NOT NULL FK collaborator_journeys(id)
- include_flag BOOLEAN NOT NULL DEFAULT true
- sector_id TEXT NOT NULL
- location_id TEXT NOT NULL
- task_id TEXT NOT NULL
- method_id TEXT NOT NULL
- payment_value_snapshot NUMERIC NOT NULL
- assignment_status TEXT NOT NULL
- substituted_for_collaborator_id TEXT NULL
- exception_type TEXT NULL
- comments TEXT
- created_at DATETIME NOT NULL
- updated_at DATETIME NOT NULL

### mine_well_productions

- id TEXT PK
- work_date DATE NOT NULL
- period_code TEXT NOT NULL
- location_id TEXT NOT NULL
- grams_produced NUMERIC NOT NULL
- comments TEXT
- created_by TEXT NOT NULL
- created_at DATETIME NOT NULL
- updated_at DATETIME NOT NULL
- UNIQUE(work_date, period_code, location_id)

### gold_prices

- id TEXT PK
- quote_date DATE NOT NULL UNIQUE
- quoted_at_time TEXT
- price_brl_per_gram NUMERIC NOT NULL
- source_name TEXT
- comments TEXT
- created_by TEXT NOT NULL
- created_at DATETIME NOT NULL
- updated_at DATETIME NOT NULL

### price_list_items

- id TEXT PK
- code TEXT UNIQUE
- name TEXT NOT NULL UNIQUE
- description TEXT
- category TEXT NOT NULL
- price_brl NUMERIC NOT NULL
- active BOOLEAN NOT NULL DEFAULT true
- created_at DATETIME NOT NULL
- updated_at DATETIME NOT NULL

### expense_transactions

- id TEXT PK
- collaborator_id TEXT NOT NULL FK collaborator_journeys(id)
- expense_date DATE NOT NULL
- currency_code TEXT NOT NULL
- total_amount NUMERIC NOT NULL
- category TEXT NOT NULL
- collaborator_agreement BOOLEAN NOT NULL DEFAULT false
- comments TEXT
- created_by TEXT NOT NULL
- created_at DATETIME NOT NULL
- updated_at DATETIME NOT NULL

### expense_items

- id TEXT PK
- expense_id TEXT NOT NULL FK expense_transactions(id)
- price_list_item_id TEXT NULL FK price_list_items(id)
- item_name_snapshot TEXT NOT NULL
- quantity NUMERIC NOT NULL
- unit_price NUMERIC NOT NULL
- total_price NUMERIC NOT NULL
- comments TEXT
- created_at DATETIME NOT NULL

### earning_accrual_batches

- id TEXT PK
- work_period_id TEXT NOT NULL FK work_periods(id)
- accrual_status TEXT NOT NULL
- comments TEXT
- created_by TEXT NOT NULL
- created_at DATETIME NOT NULL
- updated_at DATETIME NOT NULL

### earning_accrual_items

- id TEXT PK
- accrual_batch_id TEXT NOT NULL FK earning_accrual_batches(id)
- collaborator_id TEXT NOT NULL FK collaborator_journeys(id)
- method_id TEXT NOT NULL
- currency_code TEXT NOT NULL
- calculation_basis_json TEXT NOT NULL
- gross_amount NUMERIC NOT NULL
- transfer_amount NUMERIC NOT NULL DEFAULT 0
- net_amount NUMERIC NOT NULL
- ledger_entry_id TEXT NULL
- status TEXT NOT NULL
- comments TEXT
- created_at DATETIME NOT NULL

### current_account_entries

- id TEXT PK
- reverted_entry_id TEXT NULL FK current_account_entries(id)
- collaborator_id TEXT NOT NULL FK collaborator_journeys(id)
- entry_date DATE NOT NULL
- source_type TEXT NOT NULL
- source_id TEXT NULL
- method_id TEXT NULL
- currency_code TEXT NOT NULL
- cd_flag TEXT NOT NULL
- item_description TEXT NOT NULL
- quantity NUMERIC NOT NULL DEFAULT 1
- unit_price NUMERIC NOT NULL
- total_price NUMERIC NOT NULL
- comments TEXT
- status TEXT NOT NULL DEFAULT 'active'
- created_by TEXT NOT NULL
- created_at DATETIME NOT NULL

### audit_logs

- id TEXT PK
- actor_user_id TEXT NOT NULL
- action TEXT NOT NULL
- entity_type TEXT NOT NULL
- entity_id TEXT NOT NULL
- before_json TEXT
- after_json TEXT
- created_at DATETIME NOT NULL

---

## 8. API Design

All APIs should be versioned under `/api/v1`.

## 8.1 Auth

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

## 8.2 People

- `GET /people`
- `POST /people`
- `GET /people/:id`
- `PUT /people/:id`
- `GET /people/:id/journeys`

## 8.3 Collaborator Journeys

- `GET /collaborators`
- `POST /collaborators`
- `GET /collaborators/:id`
- `PUT /collaborators/:id`
- `POST /collaborators/:id/extend`
- `POST /collaborators/:id/finish`
- `GET /collaborators/:id/projection`

## 8.4 Reference Data

- `GET /reference-data/:type`
- `POST /reference-data/:type`
- `PUT /reference-data/:type/:id`

## 8.5 Work Periods and Planning

- `GET /work-periods`
- `POST /work-periods`
- `GET /work-periods/:id`
- `POST /work-periods/:id/seed-from-previous`
- `GET /work-periods/:id/plan`
- `PUT /work-periods/:id/plan-items/:planItemId`
- `POST /work-periods/:id/inform`
- `POST /work-periods/:id/accrue`

## 8.6 Mine Production

- `GET /mine-productions`
- `POST /mine-productions`
- `PUT /mine-productions/:id`

## 8.7 Gold Prices

- `GET /gold-prices`
- `POST /gold-prices`
- `PUT /gold-prices/:id`
- `GET /gold-prices/latest`

## 8.8 Price List

- `GET /price-list`
- `POST /price-list`
- `PUT /price-list/:id`
- `GET /price-list/:id/price-preview?currency=BRL|GOLD_GRAMS`

## 8.9 Expenses

- `GET /expenses`
- `POST /expenses`
- `GET /expenses/:id`
- `POST /expenses/:id/revert`

## 8.10 Ledger / Current Account

- `GET /current-accounts/:collaboratorId/summary`
- `GET /current-accounts/:collaboratorId/entries`
- `GET /current-accounts/:collaboratorId/entries?currency=BRL`
- `GET /current-accounts/:collaboratorId/entries?currency=GOLD_GRAMS`
- `POST /current-accounts/entries/:id/revert`
- `POST /current-accounts/:collaboratorId/zero-gold`
- `POST /current-accounts/:collaboratorId/close`

## 8.11 Reports

- `GET /reports/dashboard`
- `GET /reports/collaborator-balances`
- `GET /reports/journeys-ending-soon`
- `GET /reports/pending-production-accruals`
- `GET /reports/mercantile-sales`

---

## 9. Frontend Information Architecture

The frontend should be a **React SPA** optimized for:

- phone-first usage,
- touch-friendly actions,
- readable cards and summaries,
- desktop expansion into split panes/tables.

## 9.1 Main navigation

1. Dashboard
2. People
3. Collaborators
4. Planning
5. Production
6. Gold Price
7. Mercantile / Expenses
8. Current Accounts
9. Reports
10. Settings

## 9.2 Mobile-first UI principles

- card-based layouts on small screens,
- bottom-safe action bars for primary actions,
- sticky summary panels,
- large tap targets,
- progressive disclosure for complex forms,
- desktop upgrades to table/grid views.

---

## 10. Screen Inventory

## 10.1 Login Screen

- username/email
- password
- sign in button

## 10.2 Dashboard

Widgets:

- active collaborators count
- journeys ending soon
- pending accruals due to missing production
- latest gold quote
- today’s expenses total
- negative balance alerts

## 10.3 People List

- search
- status filter
- add person
- person cards/table

## 10.4 Person Detail

- person profile
- contact info
- status
- journey history
- create collaborator journey action

## 10.5 Collaborator List

- active/finished filter
- payment method filter
- location filter
- projected-end range filter

## 10.6 Collaborator Detail

Sections:

- identity summary
- journey dates
- payment model
- assignment info
- status
- BRL balance summary
- gold balance summary
- projected earnings
- actions: extend, zero gold, close journey, open ledger, create expense

## 10.7 Planning Workspace

Three-stage workflow:

### Plan Tab

- load previous period plan
- include/exclude toggles
- add collaborators not in previous period
- assign sector/location/task/method
- mark sick/license/substitute

### Inform Tab

- print-friendly formatted assignment roster
- filter included collaborators only

### Accrual Tab

- compare plan vs actual
- mark worked/sick/license/absent
- show production dependency warnings
- post accrual batch

## 10.8 Mine Production Screen

- date
- period
- well
- grams produced
- comments
- list of recorded productions

## 10.9 Gold Price Screen

- date
- price BRL/gram
- source
- comments
- latest price card
- price history list

## 10.10 Price List Screen

- list items
- create/edit item
- dynamic gold equivalent preview based on latest quote

## 10.11 Expense Entry Screen

This is one of the key screens.

### Left/Top summary panel

- collaborator name
- projected journey end
- payment method
- BRL balance
- gold balance
- projected earnings
- substitution recipient information if relevant

### Form panel

- currency selector
- category selector
- multi-line item entry
- quantity
- unit price
- total price
- comments
- collaborator agreement checkbox
- save action

### Mobile behavior

- summary shown first,
- form stacked below,
- sticky running total.

## 10.12 Current Account Summary Screen

- BRL credits
- BRL debits
- BRL balance
- Gold credits
- Gold debits
- Gold balance
- projected earnings
- payout estimate

## 10.13 Current Account Detail Screen

- filter by currency
- filter by date
- filter by source type
- transaction timeline/cards on mobile
- table on desktop
- revert action for authorized users

## 10.14 Journey Close Screen

- collaborator summary
- current balances
- projected end info
- zero history
- payout preview
- confirm close action

## 10.15 Reports

- collaborator balances
- negative balances
- production-linked commissions pending
- mercantile sales by category
- collaborator journey calendar

---

## 11. Core Workflows

## 11.1 Create Person

1. Admin opens People.
2. Creates permanent person record.
3. Validation checks unique fields.
4. Person is saved with status.

## 11.2 Start Collaborator Journey

1. Admin selects Person.
2. Creates Collaborator Journey.
3. System computes default end date.
4. Admin sets payment method, value, sector, location, task.
5. Collaborator becomes active.

## 11.3 Extend Journey

1. Admin opens Collaborator Detail.
2. Adds extension days.
3. System recalculates projected end date.
4. Audit log captures change.

## 11.4 Plan Next Work Period

1. Planner creates/selects work period.
2. System seeds from previous period plan.
3. Previous included collaborators default to include.
4. Collaborators not in previous period default to exclude.
5. Planner adjusts statuses and substitutions.
6. Plan is saved.

## 11.5 Inform Collaborators

1. Planner opens Inform stage.
2. System renders print-friendly included list only.
3. Planner prints or exports the assignment roster.

## 11.6 Accrue Earnings

1. Planner opens Accrual stage.
2. Marks actual work outcomes.
3. System computes earnings by collaborator.
4. If commission production missing, related accrual items are pending.
5. Post accrual creates ledger entries.

## 11.7 Record Expense

1. Admin searches collaborator.
2. System displays summary and projected balances.
3. Admin chooses expense currency.
4. Admin adds one or more items.
5. System validates prices and totals.
6. Save posts expense header, lines, and debit ledger entries.

## 11.8 Revert Ledger Entry

1. Authorized user selects active ledger entry.
2. System creates opposite entry with `reverted_entry_id`.
3. Original entry remains visible.
4. Audit log is recorded.

## 11.9 Zero Gold

1. Admin views collaborator gold balance.
2. System computes available positive gold credit.
3. Admin confirms payout.
4. System posts offsetting debit ledger entry.

## 11.10 Close Journey

1. Admin opens close screen.
2. System calculates final BRL and gold balances.
3. System previews payout amounts.
4. Admin confirms.
5. System posts close entries and marks journey finished.

---

## 12. Earnings Engine Design

## 12.1 Calculation strategies

Implement strategy pattern by payment method:

- `DailyWageCalculator`
- `SalaryCalculator`
- `CommissionCalculator`

Each receives:

- collaborator journey
- plan item
- work period
- production data if needed
- latest relevant rules

Returns:

- currency
- gross amount
- transfer amount
- net amount
- basis metadata
- hold reason if pending

## 12.2 Daily wage calculation

```text
net_amount = configured daily wage amount
currency = BRL
```

## 12.3 Salary calculation

```text
daily_rate = monthly_salary / configured_salary_divisor
net_amount = daily_rate
currency = BRL
```

## 12.4 Commission calculation

```text
gross_amount = well_production_grams * collaborator_percentage
currency = GOLD_GRAMS
```

## 12.5 Sick substitution calculation

For commissioned collaborator on sick day:

- commissioned collaborator earns full commission credit,
- commissioned collaborator receives a gold debit of 1 gram,
- substitute daily wager receives gold credit of 1 gram,
- substitute daily wager also receives BRL wage credit.

## 12.6 License substitution calculation

For commissioned collaborator on license day:

- commissioned collaborator receives half commission credit,
- substitute daily wager receives half commission credit,
- substitute daily wager receives no BRL wage credit for that substituted work.

---

## 13. Expense Engine Design

## 13.1 Supported categories

- canteen
- pix
- flights
- pay_daily_wager
- diverse

## 13.2 Pricing behavior

- BRL entries use entered or catalog BRL price.
- Gold entries use either entered gold price or gold-equivalent from current quote.
- Every line stores a snapshot of quantity, unit price, and total price.

## 13.3 Validation rules

- currency required
- at least one item
- total must equal sum of lines
- PIX only in BRL
- agreement checkbox required

---

## 14. Ledger / Current Account Design

## 14.1 Summary formulas

For each currency independently:

```text
credits = sum(total_price where cd_flag = CREDIT and active)
debits  = sum(total_price where cd_flag = DEBIT and active)
balance = credits - debits
```

## 14.2 Projected earnings

Projected earnings should be computed separately from posted balances and shown as an estimate.

Recommended formula:

```text
projected_earnings = posted_earnings_to_date + estimated_remaining_earnings_to_projected_end
```

### Estimated remaining earnings by method

- daily wages: remaining eligible workdays × daily rate
- salary: remaining days × normalized daily salary
- commission: estimated based on configurable rolling average production or last known average

Because commission projection is uncertain, the UI should label it explicitly as estimated and show basis.

## 14.3 Reversal rules

- original entry stays immutable
- reversal entry mirrors source, currency, quantity, and amount
- reversal flips credit/debit
- both entries become linked

---

## 15. Security and Authentication

## 15.1 Recommended approach

- Fiber JWT authentication for API
- Refresh token support optional later
- Password-based login for internal users
- Role-based authorization middleware

## 15.2 Authorization matrix

### Administrator

- full CRUD on everything
- close journey
- zero gold
- revert entries
- manage reference data

### Planner

- work periods
- planning
- inform
- accrual
- view collaborator summaries

### Mercantile Operator

- create expenses
- view collaborator summaries
- view price list
- cannot close journey or revert accruals

### Finance Viewer

- read-only access to balances and reports

## 15.3 Audit requirements

Audit all:

- login/logout
- journey creation/extension/close
- accrual posting
- expense posting
- reversals
- zero operations
- reference-data changes

---

## 16. Suggested Backend Folder Structure

```text
/backend
  /cmd/server
    main.go
  /internal
    /app
      router.go
      middleware.go
      config.go
    /auth
      entity.go
      repository.go
      service.go
      handler.go
      middleware.go
    /people
      entity.go
      dto.go
      repository.go
      service.go
      handler.go
    /collaborators
      entity.go
      dto.go
      repository.go
      service.go
      handler.go
    /referencedata
      entity.go
      repository.go
      service.go
      handler.go
    /workperiods
      entity.go
      repository.go
      service.go
      handler.go
    /planning
      entity.go
      repository.go
      service.go
      handler.go
    /mineproduction
      entity.go
      repository.go
      service.go
      handler.go
    /goldprices
      entity.go
      repository.go
      service.go
      handler.go
    /pricelist
      entity.go
      repository.go
      service.go
      handler.go
    /expenses
      entity.go
      repository.go
      service.go
      handler.go
    /earnings
      calculators.go
      service.go
      accrual_service.go
    /ledger
      entity.go
      repository.go
      service.go
      projections.go
      handler.go
    /journeyclosure
      service.go
      handler.go
    /reports
      service.go
      handler.go
    /audit
      entity.go
      repository.go
      service.go
    /shared
      errors.go
      pagination.go
      money.go
      dates.go
      ids.go
  /migrations
  /test
```

---

## 17. Suggested Frontend Folder Structure

```text
/frontend
  /src
    /app
      router.tsx
      store.ts
      api.ts
      auth.ts
    /components
      /layout
      /forms
      /cards
      /tables
      /modals
      /summary
    /features
      /auth
      /dashboard
      /people
      /collaborators
      /planning
      /production
      /gold-prices
      /price-list
      /expenses
      /current-accounts
      /reports
      /settings
    /hooks
    /utils
    /types
    /styles
```

Recommended UI stack:

- React + TypeScript
- React Router
- TanStack Query
- React Hook Form + Zod
- Tailwind CSS or Bootstrap 5

Because you asked for React and mobile-first, **React + TypeScript + Tailwind** is the cleanest modern option.

---

## 18. Validation Rules

### Person

- required: name
- unique: name, phone, email, cpf, pix_key

### Collaborator Journey

- person required
- start date required
- payment method required
- payment value > 0
- location/task/sector required

### Production

- date required
- period required
- well required
- grams produced >= 0

### Gold Price

- one quote per date
- price > 0

### Expense

- collaborator required
- currency required
- at least one item
- quantity > 0
- unit price >= 0
- total must reconcile

### Reversal

- original entry must be active and not already fully reversed unless partial reversal is intentionally supported later

---

## 19. Reporting and Analytics

Recommended initial reports:

1. Active collaborators
2. Collaborators with negative BRL balance
3. Collaborators with negative gold balance
4. Journeys ending in next 7/15/30 days
5. Pending commission accrual due to missing production
6. Mercantile sales by category and period
7. Gold payouts by period
8. BRL payouts by period
9. Expense totals by collaborator and category
10. Production totals by well and period

---

## 20. Test Strategy

## 20.1 Backend tests

- unit tests for calculators and services
- repository tests against SQLite test DB
- Fiber handler tests with httptest
- golden JSON responses for critical endpoints if useful

### Highest-priority business-rule tests

1. 90-day journey default end calculation
2. extension recalculates projected end
3. 30-day return eligibility validation
4. daily wage accrual
5. salary daily normalization accrual
6. commission accrual from well production
7. accrual remains pending when production missing
8. sick substitution postings
9. license substitution postings
10. expense posting in BRL
11. expense posting in gold
12. reversal creation
13. zero gold operation
14. close journey ledger posting
15. projected earnings calculations

## 20.2 Frontend tests

- component tests for summary cards and forms
- integration tests for key workflows
- responsive layout checks

## 20.3 End-to-end tests

Recommended Playwright scenarios:

1. create person → create collaborator
2. plan period → accrue earnings
3. record gold price → price list preview → expense entry
4. view current account summary/detail
5. revert expense
6. zero gold
7. close journey

---

## 21. Deployment Recommendation

## 21.1 First production deployment

Use a single deployable service:

- Fiber backend serving API
- React frontend built as static assets
- SQLite file stored on durable disk
- daily backups

## 21.2 Docker layout

- one app container
- one mounted volume for SQLite DB
- one mounted volume for backups/logs

## 21.3 Backup strategy

Because SQLite is requested and operations are financially important:

- nightly DB backup
- pre-deploy backup
- exportable CSV/Excel reports for finance audit

## 21.4 Future evolution

If the system grows, extract these first:

- reporting
- auth
- pricing/integration adapters

---

## 22. Recommended MVP Scope

To ship safely, the MVP should include:

### MVP Module 1
- auth
- people
- collaborator journeys
- reference data

### MVP Module 2
- work periods
- planning
- mine production
- gold prices

### MVP Module 3
- earnings accrual engine
- expense entry
- ledger summary/detail

### MVP Module 4
- reversals
- zero gold
- close journey
- reports

---

## 23. Main Risks and How the Design Handles Them

### Risk 1: business-rule ambiguity
Handled via explicit calculator strategies and audit metadata.

### Risk 2: dual-currency confusion
Handled by one-currency-per-ledger-entry and independent balance summaries.

### Risk 3: remote-site operational mistakes
Handled by reversal-based accounting, not deletion.

### Risk 4: missing production data
Handled via pending accrual batches.

### Risk 5: overcomplicated architecture too early
Handled by modular monolith first.

---

## 24. Final Recommendation

Build this as a **modular monolith** with:

- Fiber backend
- SQLite + GORM
- React + TypeScript frontend
- immutable ledger design
- explicit planning/accrual workflow
- reversible financial postings
- strong audit trail

This is the right architecture for the current requirements and leaves room for future extraction and scaling.

---

## 25. Best Next Deliverable

The best immediate follow-up is:

1. **ERD + relational schema**
2. **OpenAPI-style REST contract**
3. **production folder skeleton with starter code**
4. **database migrations + GORM models**
5. **React route/page skeleton**

That would turn this blueprint into an implementation-ready package.

---

## 26. ERD (Entity Relationship Design)

Below is the recommended logical ERD for the first production version.

```text
users ──< user_roles >── roles

people ──< collaborator_journeys ──< work_plan_items >── work_periods
   │                │                       │
   │                │                       └──── references reference_data for sector/location/task/method
   │                │
   │                ├──< expense_transactions ──< expense_items >── price_list_items
   │                │
   │                ├──< earning_accrual_items >── earning_accrual_batches >── work_periods
   │                │
   │                └──< current_account_entries >── current_account_entries (self via reverted_entry_id)
   │
   └── status via reference_data(person_status)

mine_well_productions >── work_periods
mine_well_productions ──> reference_data(location)

gold_prices

price_list_items

reference_data

audit_logs ──> users
```

### 26.1 Relationship summary

#### Identity and contract

- **Person 1:N CollaboratorJourney**
  - One person can have many work journeys over time.
  - Only one active journey per person is recommended.

#### Planning

- **WorkPeriod 1:N WorkPlanItem**
- **CollaboratorJourney 1:N WorkPlanItem**
- **CollaboratorJourney 0..N substitute roles in WorkPlanItem** via `substituted_for_collaborator_id`

#### Production and accrual

- **WorkPeriod 1:N MineWellProduction**
- **WorkPeriod 1:N EarningAccrualBatch**
- **EarningAccrualBatch 1:N EarningAccrualItem**
- **CollaboratorJourney 1:N EarningAccrualItem**

#### Expenses

- **CollaboratorJourney 1:N ExpenseTransaction**
- **ExpenseTransaction 1:N ExpenseItem**
- **PriceListItem 0..N ExpenseItem**

#### Ledger

- **CollaboratorJourney 1:N CurrentAccountEntry**
- **CurrentAccountEntry 0..N self-reference** through `reverted_entry_id`

#### Reference data

The following entities point to `reference_data` rows:

- people.status_id
- collaborator_journeys.payment_method_id
- collaborator_journeys.sector_id
- collaborator_journeys.location_id
- collaborator_journeys.task_id
- collaborator_journeys.status_id
- work_plan_items.sector_id
- work_plan_items.location_id
- work_plan_items.task_id
- work_plan_items.method_id

---

## 27. Final Relational Schema

This section defines the implementation-grade schema for SQLite + GORM.

## 27.1 Naming and conventions

### Primary keys

Use string IDs (ULID recommended) for all primary keys:

- good for offline-safe generation,
- sortable by time,
- easier than auto-increment merges if imports happen later.

### Timestamps

All mutable business tables should have:

- created_at
- updated_at

### Soft delete policy

Do **not** soft-delete financial or historical records.

Use:

- `status`
- `active`
- `closed_at`
- reversal records

instead of deletion.

### Foreign keys

SQLite foreign keys must be enabled explicitly at connection time.

### Money and quantities

For SQLite, GORM will map decimal-like values to numeric/text depending on implementation. For accounting safety, the app layer should use fixed-precision decimal handling.

Recommended handling:

- Go type: decimal library or integer minor units where appropriate
- DB type labels: `NUMERIC`

For this schema document, all accounting amounts are shown as `NUMERIC(18,6)` conceptually.

---

## 27.2 Core tables

### users

Purpose: internal application users.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| username | TEXT | no | unique |
| email | TEXT | no | unique |
| password_hash | TEXT | no | |
| display_name | TEXT | no | |
| active | BOOLEAN | no | default true |
| last_login_at | DATETIME | yes | |
| created_at | DATETIME | no | |
| updated_at | DATETIME | no | |

Indexes:

- unique(username)
- unique(email)

---

### roles

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| code | TEXT | no | unique |
| label | TEXT | no | |
| created_at | DATETIME | no | |
| updated_at | DATETIME | no | |

Suggested seed values:

- ADMIN
- PLANNER
- MERCANTILE_OPERATOR
- FINANCE_VIEWER

---

### user_roles

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| user_id | TEXT | no | FK users(id) |
| role_id | TEXT | no | FK roles(id) |
| created_at | DATETIME | no | |

Indexes:

- unique(user_id, role_id)

---

### reference_data

Purpose: extensible lookup storage.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| type | TEXT | no | e.g. sector, location, task |
| code | TEXT | no | stable internal code |
| label | TEXT | no | UI label |
| description | TEXT | yes | |
| active | BOOLEAN | no | default true |
| sort_order | INTEGER | no | default 0 |
| metadata_json | TEXT | yes | optional rules |
| created_at | DATETIME | no | |
| updated_at | DATETIME | no | |

Indexes:

- unique(type, code)
- index(type, active, sort_order)

Suggested seeded `type` values:

- sector
- location
- task
- method
- person_status
- collaborator_status
- expense_category
- period_code
- ledger_currency
- ledger_cd_flag

---

### people

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| name | TEXT | no | unique |
| address | TEXT | yes | |
| phone | TEXT | yes | unique if not null |
| email | TEXT | yes | unique if not null |
| cpf | TEXT | yes | unique if not null |
| bank_data | TEXT | yes | |
| pix_key | TEXT | yes | unique if not null |
| emergency_contact_name | TEXT | yes | |
| emergency_contact_phone | TEXT | yes | |
| emergency_contact_notes | TEXT | yes | |
| status_id | TEXT | no | FK reference_data(id), type=person_status |
| notes | TEXT | yes | |
| created_at | DATETIME | no | |
| updated_at | DATETIME | no | |

Indexes:

- unique(name)
- unique(phone)
- unique(email)
- unique(cpf)
- unique(pix_key)
- index(status_id)

---

### collaborator_journeys

Purpose: a contractual work journey for one person.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| person_id | TEXT | no | FK people(id) |
| journey_start_date | DATE | no | |
| default_end_date | DATE | no | start + 90 days |
| extension_days | INTEGER | no | default 0 |
| projected_end_date | DATE | no | default_end + extension |
| payment_method_id | TEXT | no | FK reference_data(id), type=method |
| payment_value | NUMERIC | no | daily wage, monthly salary, or commission percentage |
| sector_id | TEXT | no | FK reference_data(id), type=sector |
| location_id | TEXT | no | FK reference_data(id), type=location |
| task_id | TEXT | no | FK reference_data(id), type=task |
| status_id | TEXT | no | FK reference_data(id), type=collaborator_status |
| notes | TEXT | yes | |
| closed_at | DATETIME | yes | |
| created_at | DATETIME | no | |
| updated_at | DATETIME | no | |

Indexes:

- index(person_id)
- index(status_id)
- index(projected_end_date)
- index(location_id)
- index(payment_method_id)
- recommended partial uniqueness in app logic: one active journey per person

Important application constraint:

- a person should not have more than one active collaborator journey at the same time.

Because SQLite partial uniqueness is awkward in portable GORM migrations, enforce this in service logic.

---

### work_periods

Purpose: operational 12-hour periods used for planning, informing, accrual, and production alignment.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| work_date | DATE | no | |
| period_code | TEXT | no | e.g. DAY, NIGHT or P1, P2 |
| starts_at | DATETIME | yes | |
| ends_at | DATETIME | yes | |
| status | TEXT | no | planned, informed, accrued, locked |
| seeded_from_work_period_id | TEXT | yes | self FK optional |
| created_at | DATETIME | no | |
| updated_at | DATETIME | no | |

Indexes:

- unique(work_date, period_code)
- index(status)

---

### work_plan_items

Purpose: collaborator assignments for a work period.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| work_period_id | TEXT | no | FK work_periods(id) |
| collaborator_id | TEXT | no | FK collaborator_journeys(id) |
| include_flag | BOOLEAN | no | default true |
| sector_id | TEXT | no | FK reference_data(id) |
| location_id | TEXT | no | FK reference_data(id) |
| task_id | TEXT | no | FK reference_data(id) |
| method_id | TEXT | no | FK reference_data(id) |
| payment_value_snapshot | NUMERIC | no | immutable planning snapshot |
| assignment_status | TEXT | no | planned, worked, sick, license, absent, excluded |
| substituted_for_collaborator_id | TEXT | yes | FK collaborator_journeys(id) |
| exception_type | TEXT | yes | none, sick_substitution, license_substitution |
| comments | TEXT | yes | |
| created_at | DATETIME | no | |
| updated_at | DATETIME | no | |

Indexes:

- index(work_period_id)
- index(collaborator_id)
- index(location_id)
- index(substituted_for_collaborator_id)
- recommended unique(work_period_id, collaborator_id)

---

### mine_well_productions

Purpose: recorded production per well for a given date/period.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| work_period_id | TEXT | no | FK work_periods(id) |
| work_date | DATE | no | denormalized for querying |
| period_code | TEXT | no | denormalized for querying |
| location_id | TEXT | no | FK reference_data(id), type=location |
| grams_produced | NUMERIC | no | |
| comments | TEXT | yes | |
| created_by | TEXT | no | FK users(id) |
| created_at | DATETIME | no | |
| updated_at | DATETIME | no | |

Indexes:

- unique(work_date, period_code, location_id)
- index(work_period_id)
- index(location_id)

Note:

- `location_id` should point only to mine-well-capable locations. This is best enforced in application rules or `metadata_json` on reference_data.

---

### gold_prices

Purpose: daily BRL per gram quote.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| quote_date | DATE | no | unique |
| quoted_at_time | TEXT | yes | e.g. 11:00 |
| price_brl_per_gram | NUMERIC | no | |
| source_name | TEXT | yes | approved source |
| comments | TEXT | yes | |
| created_by | TEXT | no | FK users(id) |
| created_at | DATETIME | no | |
| updated_at | DATETIME | no | |

Indexes:

- unique(quote_date)
- index(quote_date desc)

---

### price_list_items

Purpose: mercantile catalog.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| code | TEXT | yes | unique if used |
| name | TEXT | no | unique |
| description | TEXT | yes | |
| category_id | TEXT | no | FK reference_data(id), type=expense_category |
| price_brl | NUMERIC | no | base price in BRL |
| active | BOOLEAN | no | default true |
| created_at | DATETIME | no | |
| updated_at | DATETIME | no | |

Indexes:

- unique(name)
- unique(code)
- index(category_id, active)

Note:

- Gold price equivalent is computed dynamically or snapshotted at expense time, not stored here as a permanent column.

---

### expense_transactions

Purpose: expense header.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| collaborator_id | TEXT | no | FK collaborator_journeys(id) |
| expense_date | DATE | no | |
| currency_code | TEXT | no | BRL or GOLD_GRAMS |
| total_amount | NUMERIC | no | sum of items |
| category_id | TEXT | no | FK reference_data(id), type=expense_category |
| gold_price_id | TEXT | yes | FK gold_prices(id), when relevant |
| collaborator_agreement | BOOLEAN | no | default false |
| comments | TEXT | yes | |
| posted_ledger_group_id | TEXT | yes | optional grouping token |
| created_by | TEXT | no | FK users(id) |
| created_at | DATETIME | no | |
| updated_at | DATETIME | no | |

Indexes:

- index(collaborator_id)
- index(expense_date)
- index(category_id)
- index(currency_code)

---

### expense_items

Purpose: expense lines.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| expense_id | TEXT | no | FK expense_transactions(id) |
| price_list_item_id | TEXT | yes | FK price_list_items(id) |
| item_name_snapshot | TEXT | no | preserves historical meaning |
| quantity | NUMERIC | no | |
| unit_price | NUMERIC | no | in selected currency |
| total_price | NUMERIC | no | |
| comments | TEXT | yes | |
| created_at | DATETIME | no | |

Indexes:

- index(expense_id)
- index(price_list_item_id)

---

### earning_accrual_batches

Purpose: posting run for one work period.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| work_period_id | TEXT | no | FK work_periods(id) |
| accrual_status | TEXT | no | draft, pending_production, posted, partially_posted, reverted |
| comments | TEXT | yes | |
| created_by | TEXT | no | FK users(id) |
| created_at | DATETIME | no | |
| updated_at | DATETIME | no | |

Indexes:

- index(work_period_id)
- index(accrual_status)
- recommended unique(work_period_id) for one principal batch per period in MVP

---

### earning_accrual_items

Purpose: collaborator-by-collaborator accrual results.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| accrual_batch_id | TEXT | no | FK earning_accrual_batches(id) |
| collaborator_id | TEXT | no | FK collaborator_journeys(id) |
| work_plan_item_id | TEXT | yes | FK work_plan_items(id) |
| method_id | TEXT | no | FK reference_data(id) |
| currency_code | TEXT | no | BRL or GOLD_GRAMS |
| calculation_basis_json | TEXT | no | snapshot of formula inputs |
| gross_amount | NUMERIC | no | before transfer/split |
| transfer_amount | NUMERIC | no | amount transferred to substitute etc. |
| net_amount | NUMERIC | no | amount owed to collaborator |
| hold_reason | TEXT | yes | e.g. missing production |
| ledger_entry_id | TEXT | yes | FK current_account_entries(id), main credit if one-to-one |
| status | TEXT | no | pending, posted, held, reverted |
| comments | TEXT | yes | |
| created_at | DATETIME | no | |

Indexes:

- index(accrual_batch_id)
- index(collaborator_id)
- index(status)
- index(work_plan_item_id)

Note:

- special sick/license cases can create more than one ledger entry, so `ledger_entry_id` here is optional convenience only. The authoritative financial data remains in `current_account_entries`.

---

### current_account_entries

Purpose: immutable dual-currency ledger.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| reverted_entry_id | TEXT | yes | self FK |
| collaborator_id | TEXT | no | FK collaborator_journeys(id) |
| entry_date | DATE | no | |
| source_type | TEXT | no | earning_accrual, expense, reversal, zero_out, journey_close, manual_adjustment |
| source_id | TEXT | yes | origin record ID |
| ledger_group_id | TEXT | yes | groups multi-line posting |
| method_id | TEXT | yes | FK reference_data(id), when relevant |
| currency_code | TEXT | no | BRL or GOLD_GRAMS |
| cd_flag | TEXT | no | CREDIT or DEBIT |
| item_description | TEXT | no | user-readable reason |
| quantity | NUMERIC | no | usually 1 for credits |
| unit_price | NUMERIC | no | |
| total_price | NUMERIC | no | |
| comments | TEXT | yes | |
| status | TEXT | no | active, reversed |
| created_by | TEXT | no | FK users(id) |
| created_at | DATETIME | no | |

Indexes:

- index(collaborator_id, entry_date)
- index(currency_code, cd_flag)
- index(source_type, source_id)
- index(ledger_group_id)
- index(reverted_entry_id)

Important rules:

- no updates to financial meaning after posting
- reversal must create a new opposite entry
- `status` marks visibility state but does not remove the row

---

### audit_logs

Purpose: operational and financial audit trail.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| actor_user_id | TEXT | no | FK users(id) |
| action | TEXT | no | CREATE, UPDATE, POST, REVERT, CLOSE, LOGIN etc. |
| entity_type | TEXT | no | |
| entity_id | TEXT | no | |
| before_json | TEXT | yes | |
| after_json | TEXT | yes | |
| created_at | DATETIME | no | |

Indexes:

- index(actor_user_id)
- index(entity_type, entity_id)
- index(created_at)

---

## 27.3 Optional but recommended support tables

These are not mandatory for v1, but I recommend reserving them in the design.

### ledger_groups

Purpose: optional posting batch header for multi-line postings.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| source_type | TEXT | no | |
| source_id | TEXT | yes | |
| posting_date | DATE | no | |
| comments | TEXT | yes | |
| created_by | TEXT | no | FK users(id) |
| created_at | DATETIME | no | |

This helps for grouping multiple entries generated from one accrual or expense.

### system_settings

Purpose: configurable operational rules.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | TEXT | no | PK |
| key | TEXT | no | unique |
| value | TEXT | no | |
| description | TEXT | yes | |
| updated_by | TEXT | no | FK users(id) |
| updated_at | DATETIME | no | |

Recommended keys:

- `journey_default_days = 90`
- `return_wait_days = 30`
- `salary_daily_divisor = 30`
- `max_sick_days = 3`
- `commission_projection_basis = rolling_average`

---

## 27.4 Referential rules and business integrity rules

### Enforce in database where possible

1. Unique person identity/contact keys.
2. Unique work period `(work_date, period_code)`.
3. Unique mine-well production `(work_date, period_code, location_id)`.
4. Unique gold price per date.
5. Unique reference `(type, code)`.
6. Unique plan item per `(work_period_id, collaborator_id)`.

### Enforce in service layer

1. Only one active collaborator journey per person.
2. New journey should respect 30-day wait after prior finished journey unless override.
3. Only valid mine-well locations may be used for production-based commission.
4. PIX expenses must be BRL.
5. Zero-out cannot exceed positive available gold balance without override.
6. Reversal cannot be applied twice to the same posting unless partial reversals are later introduced.
7. Closed journey should not accept new expenses/accruals except authorized adjustments.

---

## 27.5 Suggested GORM model relationships

### Person
- has many CollaboratorJourneys

### CollaboratorJourney
- belongs to Person
- has many WorkPlanItems
- has many ExpenseTransactions
- has many EarningAccrualItems
- has many CurrentAccountEntries

### WorkPeriod
- has many WorkPlanItems
- has many MineWellProductions
- has one or many EarningAccrualBatches

### ExpenseTransaction
- belongs to CollaboratorJourney
- has many ExpenseItems

### EarningAccrualBatch
- belongs to WorkPeriod
- has many EarningAccrualItems

### CurrentAccountEntry
- belongs to CollaboratorJourney
- optionally belongs to a reverted original entry

---

## 27.6 Final schema recommendation

For implementation, the schema should use these **v1 canonical tables**:

1. users
2. roles
3. user_roles
4. reference_data
5. people
6. collaborator_journeys
7. work_periods
8. work_plan_items
9. mine_well_productions
10. gold_prices
11. price_list_items
12. expense_transactions
13. expense_items
14. earning_accrual_batches
15. earning_accrual_items
16. current_account_entries
17. audit_logs
18. system_settings

This gives enough structure to build the backend cleanly without premature complexity.

---

## 27.7 What this schema intentionally does not do yet

To keep v1 stable, the schema does **not** yet include:

- payroll export tables
- file attachments
- offline sync conflict tables
- multiple companies/tenants
- accounting journal export to external finance systems
- approval workflows beyond role authorization

Those can be added later without breaking the main ledger design.

---

## 28. Best Next Deliverable After Schema

The best next step is now:

1. **GORM model definitions**
2. **initial SQL migrations**
3. **Fiber route map and request/response DTOs**
4. **React page/route skeleton**

That sequence will move the project from architecture to implementable code.

---

## 29. GORM Models (Initial Implementation)

Below is a practical first-pass model set for Go + GORM + SQLite.

### 29.1 Recommended package layout

```text
/internal/db/models
  base.go
  user.go
  reference_data.go
  person.go
  collaborator_journey.go
  work_period.go
  work_plan_item.go
  mine_well_production.go
  gold_price.go
  price_list_item.go
  expense_transaction.go
  earning_accrual.go
  current_account_entry.go
  audit_log.go
  system_setting.go
```

---

### 29.2 Shared base and ID types

```go
package models

import "time"

type BaseModel struct {
	ID        string    `gorm:"type:text;primaryKey" json:"id"`
	CreatedAt time.Time `gorm:"not null" json:"createdAt"`
	UpdatedAt time.Time `gorm:"not null" json:"updatedAt"`
}
```

Recommended supporting conventions in application code:

- generate ULIDs in a GORM `BeforeCreate` hook or in service layer
- enable SQLite foreign keys on connection open
- use a decimal library in DTO/service logic for financial arithmetic

---

### 29.3 User, Role, UserRole

```go
package models

import "time"

type User struct {
	BaseModel
	Username     string     `gorm:"type:text;not null;uniqueIndex" json:"username"`
	Email        string     `gorm:"type:text;not null;uniqueIndex" json:"email"`
	PasswordHash string     `gorm:"type:text;not null" json:"-"`
	DisplayName  string     `gorm:"type:text;not null" json:"displayName"`
	Active       bool       `gorm:"not null;default:true" json:"active"`
	LastLoginAt  *time.Time `gorm:"type:datetime" json:"lastLoginAt,omitempty"`
	Roles        []Role     `gorm:"many2many:user_roles;" json:"roles,omitempty"`
}

type Role struct {
	BaseModel
	Code  string `gorm:"type:text;not null;uniqueIndex" json:"code"`
	Label string `gorm:"type:text;not null" json:"label"`
}

type UserRole struct {
	ID        string    `gorm:"type:text;primaryKey" json:"id"`
	UserID    string    `gorm:"type:text;not null;uniqueIndex:ux_user_role" json:"userId"`
	RoleID    string    `gorm:"type:text;not null;uniqueIndex:ux_user_role" json:"roleId"`
	CreatedAt time.Time `gorm:"not null" json:"createdAt"`

	User User `gorm:"foreignKey:UserID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"-"`
	Role Role `gorm:"foreignKey:RoleID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"-"`
}
```

---

### 29.4 ReferenceData

```go
package models

type ReferenceData struct {
	BaseModel
	Type         string `gorm:"type:text;not null;uniqueIndex:ux_reference_type_code;index:idx_reference_type_active_sort,priority:1" json:"type"`
	Code         string `gorm:"type:text;not null;uniqueIndex:ux_reference_type_code" json:"code"`
	Label        string `gorm:"type:text;not null" json:"label"`
	Description  string `gorm:"type:text" json:"description,omitempty"`
	Active       bool   `gorm:"not null;default:true;index:idx_reference_type_active_sort,priority:2" json:"active"`
	SortOrder    int    `gorm:"not null;default:0;index:idx_reference_type_active_sort,priority:3" json:"sortOrder"`
	MetadataJSON string `gorm:"type:text" json:"metadataJson,omitempty"`
}
```

---

### 29.5 Person

```go
package models

type Person struct {
	BaseModel
	Name                  string                 `gorm:"type:text;not null;uniqueIndex" json:"name"`
	Address               string                 `gorm:"type:text" json:"address,omitempty"`
	Phone                 *string                `gorm:"type:text;uniqueIndex" json:"phone,omitempty"`
	Email                 *string                `gorm:"type:text;uniqueIndex" json:"email,omitempty"`
	CPF                   *string                `gorm:"column:cpf;type:text;uniqueIndex" json:"cpf,omitempty"`
	BankData              string                 `gorm:"type:text" json:"bankData,omitempty"`
	PIXKey                *string                `gorm:"column:pix_key;type:text;uniqueIndex" json:"pixKey,omitempty"`
	EmergencyContactName  string                 `gorm:"type:text" json:"emergencyContactName,omitempty"`
	EmergencyContactPhone string                 `gorm:"type:text" json:"emergencyContactPhone,omitempty"`
	EmergencyContactNotes string                 `gorm:"type:text" json:"emergencyContactNotes,omitempty"`
	StatusID              string                 `gorm:"type:text;not null;index" json:"statusId"`
	Notes                 string                 `gorm:"type:text" json:"notes,omitempty"`
	Status                ReferenceData          `gorm:"foreignKey:StatusID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"status,omitempty"`
	Journeys              []CollaboratorJourney  `gorm:"foreignKey:PersonID" json:"journeys,omitempty"`
}
```

---

### 29.6 CollaboratorJourney

```go
package models

import "time"

type CollaboratorJourney struct {
	BaseModel
	PersonID          string        `gorm:"type:text;not null;index" json:"personId"`
	JourneyStartDate  time.Time     `gorm:"type:date;not null" json:"journeyStartDate"`
	DefaultEndDate    time.Time     `gorm:"type:date;not null" json:"defaultEndDate"`
	ExtensionDays     int           `gorm:"not null;default:0" json:"extensionDays"`
	ProjectedEndDate  time.Time     `gorm:"type:date;not null;index" json:"projectedEndDate"`
	PaymentMethodID   string        `gorm:"type:text;not null;index" json:"paymentMethodId"`
	PaymentValue      float64       `gorm:"type:numeric;not null" json:"paymentValue"`
	SectorID          string        `gorm:"type:text;not null" json:"sectorId"`
	LocationID        string        `gorm:"type:text;not null;index" json:"locationId"`
	TaskID            string        `gorm:"type:text;not null" json:"taskId"`
	StatusID          string        `gorm:"type:text;not null;index" json:"statusId"`
	Notes             string        `gorm:"type:text" json:"notes,omitempty"`
	ClosedAt          *time.Time    `gorm:"type:datetime" json:"closedAt,omitempty"`

	Person            Person        `gorm:"foreignKey:PersonID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"person,omitempty"`
	PaymentMethod     ReferenceData `gorm:"foreignKey:PaymentMethodID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"paymentMethod,omitempty"`
	Sector            ReferenceData `gorm:"foreignKey:SectorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"sector,omitempty"`
	Location          ReferenceData `gorm:"foreignKey:LocationID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"location,omitempty"`
	Task              ReferenceData `gorm:"foreignKey:TaskID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"task,omitempty"`
	Status            ReferenceData `gorm:"foreignKey:StatusID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"status,omitempty"`
}
```

---

### 29.7 WorkPeriod and WorkPlanItem

```go
package models

import "time"

type WorkPeriod struct {
	BaseModel
	WorkDate               time.Time  `gorm:"type:date;not null;uniqueIndex:ux_work_period_date_code" json:"workDate"`
	PeriodCode             string     `gorm:"type:text;not null;uniqueIndex:ux_work_period_date_code;index" json:"periodCode"`
	StartsAt               *time.Time `gorm:"type:datetime" json:"startsAt,omitempty"`
	EndsAt                 *time.Time `gorm:"type:datetime" json:"endsAt,omitempty"`
	Status                 string     `gorm:"type:text;not null;index" json:"status"`
	SeededFromWorkPeriodID *string    `gorm:"type:text" json:"seededFromWorkPeriodId,omitempty"`
	SeededFromWorkPeriod   *WorkPeriod `gorm:"foreignKey:SeededFromWorkPeriodID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"seededFromWorkPeriod,omitempty"`
	PlanItems              []WorkPlanItem `gorm:"foreignKey:WorkPeriodID" json:"planItems,omitempty"`
}

type WorkPlanItem struct {
	BaseModel
	WorkPeriodID                 string        `gorm:"type:text;not null;uniqueIndex:ux_work_period_collaborator;index" json:"workPeriodId"`
	CollaboratorID               string        `gorm:"type:text;not null;uniqueIndex:ux_work_period_collaborator;index" json:"collaboratorId"`
	IncludeFlag                  bool          `gorm:"not null;default:true" json:"includeFlag"`
	SectorID                     string        `gorm:"type:text;not null" json:"sectorId"`
	LocationID                   string        `gorm:"type:text;not null;index" json:"locationId"`
	TaskID                       string        `gorm:"type:text;not null" json:"taskId"`
	MethodID                     string        `gorm:"type:text;not null" json:"methodId"`
	PaymentValueSnapshot         float64       `gorm:"type:numeric;not null" json:"paymentValueSnapshot"`
	AssignmentStatus             string        `gorm:"type:text;not null" json:"assignmentStatus"`
	SubstitutedForCollaboratorID *string       `gorm:"type:text;index" json:"substitutedForCollaboratorId,omitempty"`
	ExceptionType                *string       `gorm:"type:text" json:"exceptionType,omitempty"`
	Comments                     string        `gorm:"type:text" json:"comments,omitempty"`

	WorkPeriod                   WorkPeriod          `gorm:"foreignKey:WorkPeriodID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"workPeriod,omitempty"`
	Collaborator                 CollaboratorJourney `gorm:"foreignKey:CollaboratorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"collaborator,omitempty"`
	Sector                       ReferenceData       `gorm:"foreignKey:SectorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"sector,omitempty"`
	Location                     ReferenceData       `gorm:"foreignKey:LocationID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"location,omitempty"`
	Task                         ReferenceData       `gorm:"foreignKey:TaskID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"task,omitempty"`
	Method                       ReferenceData       `gorm:"foreignKey:MethodID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"method,omitempty"`
	SubstitutedForCollaborator   *CollaboratorJourney `gorm:"foreignKey:SubstitutedForCollaboratorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"substitutedForCollaborator,omitempty"`
}
```

---

### 29.8 MineWellProduction and GoldPrice

```go
package models

import "time"

type MineWellProduction struct {
	BaseModel
	WorkPeriodID   string     `gorm:"type:text;not null;index" json:"workPeriodId"`
	WorkDate       time.Time  `gorm:"type:date;not null;uniqueIndex:ux_production_date_period_location" json:"workDate"`
	PeriodCode     string     `gorm:"type:text;not null;uniqueIndex:ux_production_date_period_location" json:"periodCode"`
	LocationID     string     `gorm:"type:text;not null;uniqueIndex:ux_production_date_period_location;index" json:"locationId"`
	GramsProduced  float64    `gorm:"type:numeric;not null" json:"gramsProduced"`
	Comments       string     `gorm:"type:text" json:"comments,omitempty"`
	CreatedBy      string     `gorm:"type:text;not null" json:"createdBy"`

	WorkPeriod     WorkPeriod    `gorm:"foreignKey:WorkPeriodID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"workPeriod,omitempty"`
	Location       ReferenceData `gorm:"foreignKey:LocationID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"location,omitempty"`
	Creator        User          `gorm:"foreignKey:CreatedBy;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"creator,omitempty"`
}

type GoldPrice struct {
	BaseModel
	QuoteDate         time.Time `gorm:"type:date;not null;uniqueIndex" json:"quoteDate"`
	QuotedAtTime      string    `gorm:"type:text" json:"quotedAtTime,omitempty"`
	PriceBRLPerGram   float64   `gorm:"column:price_brl_per_gram;type:numeric;not null" json:"priceBRLPerGram"`
	SourceName        string    `gorm:"type:text" json:"sourceName,omitempty"`
	Comments          string    `gorm:"type:text" json:"comments,omitempty"`
	CreatedBy         string    `gorm:"type:text;not null" json:"createdBy"`

	Creator           User      `gorm:"foreignKey:CreatedBy;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"creator,omitempty"`
}
```

---

### 29.9 PriceListItem, ExpenseTransaction, ExpenseItem

```go
package models

import "time"

type PriceListItem struct {
	BaseModel
	Code        *string       `gorm:"type:text;uniqueIndex" json:"code,omitempty"`
	Name        string        `gorm:"type:text;not null;uniqueIndex" json:"name"`
	Description string        `gorm:"type:text" json:"description,omitempty"`
	CategoryID  string        `gorm:"type:text;not null;index:idx_price_list_category_active,priority:1" json:"categoryId"`
	PriceBRL    float64       `gorm:"column:price_brl;type:numeric;not null" json:"priceBRL"`
	Active      bool          `gorm:"not null;default:true;index:idx_price_list_category_active,priority:2" json:"active"`

	Category    ReferenceData `gorm:"foreignKey:CategoryID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"category,omitempty"`
}

type ExpenseTransaction struct {
	BaseModel
	CollaboratorID         string               `gorm:"type:text;not null;index" json:"collaboratorId"`
	ExpenseDate            time.Time            `gorm:"type:date;not null;index" json:"expenseDate"`
	CurrencyCode           string               `gorm:"type:text;not null;index" json:"currencyCode"`
	TotalAmount            float64              `gorm:"type:numeric;not null" json:"totalAmount"`
	CategoryID             string               `gorm:"type:text;not null;index" json:"categoryId"`
	GoldPriceID            *string              `gorm:"type:text" json:"goldPriceId,omitempty"`
	CollaboratorAgreement  bool                 `gorm:"not null;default:false" json:"collaboratorAgreement"`
	Comments               string               `gorm:"type:text" json:"comments,omitempty"`
	PostedLedgerGroupID    *string              `gorm:"type:text" json:"postedLedgerGroupId,omitempty"`
	CreatedBy              string               `gorm:"type:text;not null" json:"createdBy"`

	Collaborator           CollaboratorJourney  `gorm:"foreignKey:CollaboratorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"collaborator,omitempty"`
	Category               ReferenceData        `gorm:"foreignKey:CategoryID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"category,omitempty"`
	GoldPrice              *GoldPrice           `gorm:"foreignKey:GoldPriceID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"goldPrice,omitempty"`
	Creator                User                 `gorm:"foreignKey:CreatedBy;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"creator,omitempty"`
	Items                  []ExpenseItem        `gorm:"foreignKey:ExpenseID" json:"items,omitempty"`
}

type ExpenseItem struct {
	BaseModel
	ExpenseID          string         `gorm:"type:text;not null;index" json:"expenseId"`
	PriceListItemID    *string        `gorm:"type:text;index" json:"priceListItemId,omitempty"`
	ItemNameSnapshot   string         `gorm:"type:text;not null" json:"itemNameSnapshot"`
	Quantity           float64        `gorm:"type:numeric;not null" json:"quantity"`
	UnitPrice          float64        `gorm:"type:numeric;not null" json:"unitPrice"`
	TotalPrice         float64        `gorm:"type:numeric;not null" json:"totalPrice"`
	Comments           string         `gorm:"type:text" json:"comments,omitempty"`

	Expense            ExpenseTransaction `gorm:"foreignKey:ExpenseID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"expense,omitempty"`
	PriceListItem      *PriceListItem     `gorm:"foreignKey:PriceListItemID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"priceListItem,omitempty"`
}
```

---

### 29.10 EarningAccrualBatch and EarningAccrualItem

```go
package models

type EarningAccrualBatch struct {
	BaseModel
	WorkPeriodID   string               `gorm:"type:text;not null;uniqueIndex;index" json:"workPeriodId"`
	AccrualStatus  string               `gorm:"type:text;not null;index" json:"accrualStatus"`
	Comments       string               `gorm:"type:text" json:"comments,omitempty"`
	CreatedBy      string               `gorm:"type:text;not null" json:"createdBy"`

	WorkPeriod     WorkPeriod           `gorm:"foreignKey:WorkPeriodID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"workPeriod,omitempty"`
	Creator        User                 `gorm:"foreignKey:CreatedBy;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"creator,omitempty"`
	Items          []EarningAccrualItem `gorm:"foreignKey:AccrualBatchID" json:"items,omitempty"`
}

type EarningAccrualItem struct {
	BaseModel
	AccrualBatchID       string               `gorm:"type:text;not null;index" json:"accrualBatchId"`
	CollaboratorID       string               `gorm:"type:text;not null;index" json:"collaboratorId"`
	WorkPlanItemID       *string              `gorm:"type:text;index" json:"workPlanItemId,omitempty"`
	MethodID             string               `gorm:"type:text;not null" json:"methodId"`
	CurrencyCode         string               `gorm:"type:text;not null" json:"currencyCode"`
	CalculationBasisJSON string               `gorm:"type:text;not null" json:"calculationBasisJson"`
	GrossAmount          float64              `gorm:"type:numeric;not null" json:"grossAmount"`
	TransferAmount       float64              `gorm:"type:numeric;not null;default:0" json:"transferAmount"`
	NetAmount            float64              `gorm:"type:numeric;not null" json:"netAmount"`
	HoldReason           *string              `gorm:"type:text" json:"holdReason,omitempty"`
	LedgerEntryID        *string              `gorm:"type:text;index" json:"ledgerEntryId,omitempty"`
	Status               string               `gorm:"type:text;not null;index" json:"status"`
	Comments             string               `gorm:"type:text" json:"comments,omitempty"`

	AccrualBatch         EarningAccrualBatch  `gorm:"foreignKey:AccrualBatchID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"accrualBatch,omitempty"`
	Collaborator         CollaboratorJourney  `gorm:"foreignKey:CollaboratorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"collaborator,omitempty"`
	WorkPlanItem         *WorkPlanItem        `gorm:"foreignKey:WorkPlanItemID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"workPlanItem,omitempty"`
	Method               ReferenceData        `gorm:"foreignKey:MethodID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"method,omitempty"`
}
```

---

### 29.11 CurrentAccountEntry

```go
package models

import "time"

type CurrentAccountEntry struct {
	BaseModel
	RevertedEntryID  *string               `gorm:"type:text;index" json:"revertedEntryId,omitempty"`
	CollaboratorID   string                `gorm:"type:text;not null;index:idx_ledger_collaborator_entry_date,priority:1" json:"collaboratorId"`
	EntryDate        time.Time             `gorm:"type:date;not null;index:idx_ledger_collaborator_entry_date,priority:2" json:"entryDate"`
	SourceType       string                `gorm:"type:text;not null;index:idx_ledger_source,priority:1" json:"sourceType"`
	SourceID         *string               `gorm:"type:text;index:idx_ledger_source,priority:2" json:"sourceId,omitempty"`
	LedgerGroupID    *string               `gorm:"type:text;index" json:"ledgerGroupId,omitempty"`
	MethodID         *string               `gorm:"type:text" json:"methodId,omitempty"`
	CurrencyCode     string                `gorm:"type:text;not null;index:idx_ledger_currency_cd,priority:1" json:"currencyCode"`
	CDFlag           string                `gorm:"column:cd_flag;type:text;not null;index:idx_ledger_currency_cd,priority:2" json:"cdFlag"`
	ItemDescription  string                `gorm:"type:text;not null" json:"itemDescription"`
	Quantity         float64               `gorm:"type:numeric;not null;default:1" json:"quantity"`
	UnitPrice        float64               `gorm:"type:numeric;not null" json:"unitPrice"`
	TotalPrice       float64               `gorm:"type:numeric;not null" json:"totalPrice"`
	Comments         string                `gorm:"type:text" json:"comments,omitempty"`
	Status           string                `gorm:"type:text;not null;default:active" json:"status"`
	CreatedBy        string                `gorm:"type:text;not null" json:"createdBy"`

	RevertedEntry    *CurrentAccountEntry  `gorm:"foreignKey:RevertedEntryID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"revertedEntry,omitempty"`
	Collaborator     CollaboratorJourney   `gorm:"foreignKey:CollaboratorID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"collaborator,omitempty"`
	Method           *ReferenceData        `gorm:"foreignKey:MethodID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"method,omitempty"`
	Creator          User                  `gorm:"foreignKey:CreatedBy;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"creator,omitempty"`
}
```

---

### 29.12 AuditLog and SystemSetting

```go
package models

type AuditLog struct {
	BaseModel
	ActorUserID string `gorm:"type:text;not null;index" json:"actorUserId"`
	Action      string `gorm:"type:text;not null" json:"action"`
	EntityType  string `gorm:"type:text;not null;index:idx_audit_entity,priority:1" json:"entityType"`
	EntityID    string `gorm:"type:text;not null;index:idx_audit_entity,priority:2" json:"entityId"`
	BeforeJSON  string `gorm:"type:text" json:"beforeJson,omitempty"`
	AfterJSON   string `gorm:"type:text" json:"afterJson,omitempty"`

	Actor       User   `gorm:"foreignKey:ActorUserID;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"actor,omitempty"`
}

type SystemSetting struct {
	ID          string `gorm:"type:text;primaryKey" json:"id"`
	Key         string `gorm:"type:text;not null;uniqueIndex" json:"key"`
	Value       string `gorm:"type:text;not null" json:"value"`
	Description string `gorm:"type:text" json:"description,omitempty"`
	UpdatedBy   string `gorm:"type:text;not null" json:"updatedBy"`
	UpdatedAt   int64  `gorm:"not null" json:"updatedAt"`

	Updater     User   `gorm:"foreignKey:UpdatedBy;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"updater,omitempty"`
}
```

Recommended improvement in actual code: make `UpdatedAt` a `time.Time` instead of `int64` if you want consistency with the rest of the models.

A cleaner version is:

```go
type SystemSetting struct {
	ID          string    `gorm:"type:text;primaryKey" json:"id"`
	Key         string    `gorm:"type:text;not null;uniqueIndex" json:"key"`
	Value       string    `gorm:"type:text;not null" json:"value"`
	Description string    `gorm:"type:text" json:"description,omitempty"`
	UpdatedBy   string    `gorm:"type:text;not null" json:"updatedBy"`
	UpdatedAt   time.Time `gorm:"not null" json:"updatedAt"`

	Updater     User      `gorm:"foreignKey:UpdatedBy;constraint:OnUpdate:Restrict,OnDelete:Restrict;" json:"updater,omitempty"`
}
```

---

### 29.13 Suggested AutoMigrate registration order

```go
models := []any{
	&User{},
	&Role{},
	&UserRole{},
	&ReferenceData{},
	&Person{},
	&CollaboratorJourney{},
	&WorkPeriod{},
	&WorkPlanItem{},
	&MineWellProduction{},
	&GoldPrice{},
	&PriceListItem{},
	&ExpenseTransaction{},
	&ExpenseItem{},
	&EarningAccrualBatch{},
	&EarningAccrualItem{},
	&CurrentAccountEntry{},
	&AuditLog{},
	&SystemSetting{},
}
```

For production, prefer SQL migrations as the source of truth and use AutoMigrate sparingly.

---

## 30. Initial SQL Migrations

Recommended migration folder:

```text
/migrations
  000001_init_schema.up.sql
  000001_init_schema.down.sql
  000002_seed_reference_data.up.sql
  000002_seed_reference_data.down.sql
  000003_seed_roles_and_settings.up.sql
  000003_seed_roles_and_settings.down.sql
```

---

## 30.1 `000001_init_schema.up.sql`

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE UNIQUE INDEX ux_user_roles_user_role ON user_roles(user_id, role_id);

CREATE TABLE reference_data (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);
CREATE UNIQUE INDEX ux_reference_data_type_code ON reference_data(type, code);
CREATE INDEX idx_reference_data_type_active_sort ON reference_data(type, active, sort_order);

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  cpf TEXT NULL,
  bank_data TEXT NULL,
  pix_key TEXT NULL,
  emergency_contact_name TEXT NULL,
  emergency_contact_phone TEXT NULL,
  emergency_contact_notes TEXT NULL,
  status_id TEXT NOT NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_people_status FOREIGN KEY (status_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE UNIQUE INDEX ux_people_name ON people(name);
CREATE UNIQUE INDEX ux_people_phone ON people(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX ux_people_email ON people(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX ux_people_cpf ON people(cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX ux_people_pix_key ON people(pix_key) WHERE pix_key IS NOT NULL;
CREATE INDEX idx_people_status_id ON people(status_id);

CREATE TABLE collaborator_journeys (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  journey_start_date DATE NOT NULL,
  default_end_date DATE NOT NULL,
  extension_days INTEGER NOT NULL DEFAULT 0,
  projected_end_date DATE NOT NULL,
  payment_method_id TEXT NOT NULL,
  payment_value NUMERIC NOT NULL,
  sector_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status_id TEXT NOT NULL,
  notes TEXT NULL,
  closed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_collab_person FOREIGN KEY (person_id) REFERENCES people(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_collab_payment_method FOREIGN KEY (payment_method_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_collab_sector FOREIGN KEY (sector_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_collab_location FOREIGN KEY (location_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_collab_task FOREIGN KEY (task_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_collab_status FOREIGN KEY (status_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX idx_collab_person_id ON collaborator_journeys(person_id);
CREATE INDEX idx_collab_status_id ON collaborator_journeys(status_id);
CREATE INDEX idx_collab_projected_end_date ON collaborator_journeys(projected_end_date);
CREATE INDEX idx_collab_location_id ON collaborator_journeys(location_id);
CREATE INDEX idx_collab_payment_method_id ON collaborator_journeys(payment_method_id);

CREATE TABLE work_periods (
  id TEXT PRIMARY KEY,
  work_date DATE NOT NULL,
  period_code TEXT NOT NULL,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  status TEXT NOT NULL,
  seeded_from_work_period_id TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_work_period_seeded_from FOREIGN KEY (seeded_from_work_period_id) REFERENCES work_periods(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE UNIQUE INDEX ux_work_periods_date_period ON work_periods(work_date, period_code);
CREATE INDEX idx_work_periods_status ON work_periods(status);

CREATE TABLE work_plan_items (
  id TEXT PRIMARY KEY,
  work_period_id TEXT NOT NULL,
  collaborator_id TEXT NOT NULL,
  include_flag INTEGER NOT NULL DEFAULT 1,
  sector_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  method_id TEXT NOT NULL,
  payment_value_snapshot NUMERIC NOT NULL,
  assignment_status TEXT NOT NULL,
  substituted_for_collaborator_id TEXT NULL,
  exception_type TEXT NULL,
  comments TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_plan_work_period FOREIGN KEY (work_period_id) REFERENCES work_periods(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_plan_collaborator FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_plan_sector FOREIGN KEY (sector_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_plan_location FOREIGN KEY (location_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_plan_task FOREIGN KEY (task_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_plan_method FOREIGN KEY (method_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_plan_substituted_for FOREIGN KEY (substituted_for_collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE UNIQUE INDEX ux_work_plan_items_work_period_collaborator ON work_plan_items(work_period_id, collaborator_id);
CREATE INDEX idx_work_plan_items_location_id ON work_plan_items(location_id);
CREATE INDEX idx_work_plan_items_substituted_for ON work_plan_items(substituted_for_collaborator_id);

CREATE TABLE mine_well_productions (
  id TEXT PRIMARY KEY,
  work_period_id TEXT NOT NULL,
  work_date DATE NOT NULL,
  period_code TEXT NOT NULL,
  location_id TEXT NOT NULL,
  grams_produced NUMERIC NOT NULL,
  comments TEXT NULL,
  created_by TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_production_work_period FOREIGN KEY (work_period_id) REFERENCES work_periods(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_production_location FOREIGN KEY (location_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_production_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE UNIQUE INDEX ux_production_date_period_location ON mine_well_productions(work_date, period_code, location_id);
CREATE INDEX idx_production_work_period_id ON mine_well_productions(work_period_id);
CREATE INDEX idx_production_location_id ON mine_well_productions(location_id);

CREATE TABLE gold_prices (
  id TEXT PRIMARY KEY,
  quote_date DATE NOT NULL,
  quoted_at_time TEXT NULL,
  price_brl_per_gram NUMERIC NOT NULL,
  source_name TEXT NULL,
  comments TEXT NULL,
  created_by TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_gold_prices_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE UNIQUE INDEX ux_gold_prices_quote_date ON gold_prices(quote_date);
CREATE INDEX idx_gold_prices_quote_date_desc ON gold_prices(quote_date DESC);

CREATE TABLE price_list_items (
  id TEXT PRIMARY KEY,
  code TEXT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  category_id TEXT NOT NULL,
  price_brl NUMERIC NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_price_list_category FOREIGN KEY (category_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE UNIQUE INDEX ux_price_list_items_name ON price_list_items(name);
CREATE UNIQUE INDEX ux_price_list_items_code ON price_list_items(code) WHERE code IS NOT NULL;
CREATE INDEX idx_price_list_category_active ON price_list_items(category_id, active);

CREATE TABLE expense_transactions (
  id TEXT PRIMARY KEY,
  collaborator_id TEXT NOT NULL,
  expense_date DATE NOT NULL,
  currency_code TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  category_id TEXT NOT NULL,
  gold_price_id TEXT NULL,
  collaborator_agreement INTEGER NOT NULL DEFAULT 0,
  comments TEXT NULL,
  posted_ledger_group_id TEXT NULL,
  created_by TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_expense_collaborator FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_expense_category FOREIGN KEY (category_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_expense_gold_price FOREIGN KEY (gold_price_id) REFERENCES gold_prices(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_expense_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX idx_expense_transactions_collaborator_id ON expense_transactions(collaborator_id);
CREATE INDEX idx_expense_transactions_expense_date ON expense_transactions(expense_date);
CREATE INDEX idx_expense_transactions_category_id ON expense_transactions(category_id);
CREATE INDEX idx_expense_transactions_currency_code ON expense_transactions(currency_code);

CREATE TABLE expense_items (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL,
  price_list_item_id TEXT NULL,
  item_name_snapshot TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  comments TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_expense_item_expense FOREIGN KEY (expense_id) REFERENCES expense_transactions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_expense_item_price_list FOREIGN KEY (price_list_item_id) REFERENCES price_list_items(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX idx_expense_items_expense_id ON expense_items(expense_id);
CREATE INDEX idx_expense_items_price_list_item_id ON expense_items(price_list_item_id);

CREATE TABLE earning_accrual_batches (
  id TEXT PRIMARY KEY,
  work_period_id TEXT NOT NULL,
  accrual_status TEXT NOT NULL,
  comments TEXT NULL,
  created_by TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_accrual_batch_work_period FOREIGN KEY (work_period_id) REFERENCES work_periods(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_accrual_batch_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE UNIQUE INDEX ux_accrual_batches_work_period_id ON earning_accrual_batches(work_period_id);
CREATE INDEX idx_accrual_batches_status ON earning_accrual_batches(accrual_status);

CREATE TABLE earning_accrual_items (
  id TEXT PRIMARY KEY,
  accrual_batch_id TEXT NOT NULL,
  collaborator_id TEXT NOT NULL,
  work_plan_item_id TEXT NULL,
  method_id TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  calculation_basis_json TEXT NOT NULL,
  gross_amount NUMERIC NOT NULL,
  transfer_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL,
  hold_reason TEXT NULL,
  ledger_entry_id TEXT NULL,
  status TEXT NOT NULL,
  comments TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_accrual_item_batch FOREIGN KEY (accrual_batch_id) REFERENCES earning_accrual_batches(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_accrual_item_collaborator FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_accrual_item_work_plan FOREIGN KEY (work_plan_item_id) REFERENCES work_plan_items(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_accrual_item_method FOREIGN KEY (method_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX idx_accrual_items_batch_id ON earning_accrual_items(accrual_batch_id);
CREATE INDEX idx_accrual_items_collaborator_id ON earning_accrual_items(collaborator_id);
CREATE INDEX idx_accrual_items_status ON earning_accrual_items(status);
CREATE INDEX idx_accrual_items_work_plan_item_id ON earning_accrual_items(work_plan_item_id);

CREATE TABLE current_account_entries (
  id TEXT PRIMARY KEY,
  reverted_entry_id TEXT NULL,
  collaborator_id TEXT NOT NULL,
  entry_date DATE NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NULL,
  ledger_group_id TEXT NULL,
  method_id TEXT NULL,
  currency_code TEXT NOT NULL,
  cd_flag TEXT NOT NULL,
  item_description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  comments TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_current_account_reverted_entry FOREIGN KEY (reverted_entry_id) REFERENCES current_account_entries(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_current_account_collaborator FOREIGN KEY (collaborator_id) REFERENCES collaborator_journeys(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_current_account_method FOREIGN KEY (method_id) REFERENCES reference_data(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_current_account_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX idx_current_account_collaborator_entry_date ON current_account_entries(collaborator_id, entry_date);
CREATE INDEX idx_current_account_currency_cd ON current_account_entries(currency_code, cd_flag);
CREATE INDEX idx_current_account_source ON current_account_entries(source_type, source_id);
CREATE INDEX idx_current_account_ledger_group_id ON current_account_entries(ledger_group_id);
CREATE INDEX idx_current_account_reverted_entry_id ON current_account_entries(reverted_entry_id);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT NULL,
  after_json TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

CREATE TABLE system_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT NULL,
  updated_by TEXT NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_system_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
```

---

## 30.2 `000001_init_schema.down.sql`

```sql
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS current_account_entries;
DROP TABLE IF EXISTS earning_accrual_items;
DROP TABLE IF EXISTS earning_accrual_batches;
DROP TABLE IF EXISTS expense_items;
DROP TABLE IF EXISTS expense_transactions;
DROP TABLE IF EXISTS price_list_items;
DROP TABLE IF EXISTS gold_prices;
DROP TABLE IF EXISTS mine_well_productions;
DROP TABLE IF EXISTS work_plan_items;
DROP TABLE IF EXISTS work_periods;
DROP TABLE IF EXISTS collaborator_journeys;
DROP TABLE IF EXISTS people;
DROP TABLE IF EXISTS reference_data;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS users;

PRAGMA foreign_keys = ON;
```

---

## 30.3 `000002_seed_reference_data.up.sql`

```sql
-- Person Status
INSERT INTO reference_data (id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at) VALUES
('ref-person-status-active', 'person_status', 'ACTIVE', 'Active', 'Currently under contract', 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-person-status-inactive', 'person_status', 'INACTIVE', 'Inactive', 'Out of contract but eligible to return', 1, 20, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-person-status-discontinued', 'person_status', 'DISCONTINUED', 'Discontinued', 'Out of contract and not expected to return', 1, 30, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Collaborator Status
INSERT INTO reference_data (id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at) VALUES
('ref-collab-status-active', 'collaborator_status', 'ACTIVE', 'Active', 'Available to planning', 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-collab-status-sick', 'collaborator_status', 'SICK', 'Sick', 'Took a sick day', 1, 20, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-collab-status-license', 'collaborator_status', 'LICENSE', 'License', 'On leave of absence', 1, 30, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-collab-status-finished', 'collaborator_status', 'FINISHED', 'Finished', 'Journey is finished', 1, 40, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Methods
INSERT INTO reference_data (id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at) VALUES
('ref-method-daily-wages', 'method', 'DAILY_WAGES', 'Daily Wages', 'Paid per day in BRL', 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-method-salary', 'method', 'SALARY', 'Salary', 'Paid monthly in BRL', 1, 20, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-method-commission', 'method', 'COMMISSION', 'Commission', 'Paid in grams of gold based on production', 1, 30, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Sectors
INSERT INTO reference_data (id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at) VALUES
('ref-sector-mine', 'sector', 'MINE', 'Mine', NULL, 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-sector-office', 'sector', 'OFFICE', 'Office', NULL, 1, 20, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-sector-canteen', 'sector', 'CANTEEN', 'Canteen', NULL, 1, 30, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-sector-mill', 'sector', 'MILL', 'Mill', NULL, 1, 40, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Locations
INSERT INTO reference_data (id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at) VALUES
('ref-location-well-1', 'location', 'WELL_1', 'well 1', NULL, 1, 10, '{"mineWell":true}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-location-well-2', 'location', 'WELL_2', 'well 2', NULL, 1, 20, '{"mineWell":true}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-location-well-3', 'location', 'WELL_3', 'well 3', NULL, 1, 30, '{"mineWell":true}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-location-office', 'location', 'OFFICE', 'office', NULL, 1, 40, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-location-burn-house', 'location', 'BURN_HOUSE', 'burn house', NULL, 1, 50, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-location-vault-house', 'location', 'VAULT_HOUSE', 'vault house', NULL, 1, 60, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-location-canteen', 'location', 'CANTEEN', 'canteen', NULL, 1, 70, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-location-warehouse', 'location', 'WAREHOUSE', 'warehouse', NULL, 1, 80, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Tasks
INSERT INTO reference_data (id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at) VALUES
('ref-task-administrador', 'task', 'ADMINISTRADOR', 'Administrador', NULL, 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-task-ajudante', 'task', 'AJUDANTE', 'Ajudante', NULL, 1, 20, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-task-boroquiero', 'task', 'BOROQUIERO', 'Boroquiero', NULL, 1, 30, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-task-britador', 'task', 'BRITADOR', 'Britador', NULL, 1, 40, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-task-cozinheiro', 'task', 'COZINHEIRO', 'Cozinheiro', NULL, 1, 50, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-task-guincheiro', 'task', 'GUINCHEIRO', 'Guincheiro', NULL, 1, 60, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-task-jeriqueiro', 'task', 'JERIQUEIRO', 'Jeriqueiro', NULL, 1, 70, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-task-madeirador', 'task', 'MADEIRADOR', 'Madeirador', NULL, 1, 80, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-task-moinho', 'task', 'MOINHO', 'Moinho', NULL, 1, 90, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-task-poco', 'task', 'POCO', 'Poço', NULL, 1, 100, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-task-quebrador-pedra', 'task', 'QUEBRADOR_PEDRA', 'Quebrador Pedra', NULL, 1, 110, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-task-serrador', 'task', 'SERRADOR', 'Serrador', NULL, 1, 120, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-task-servicos-gerais', 'task', 'SERVICOS_GERAIS', 'Servicos Gerais', NULL, 1, 130, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-task-tratorista', 'task', 'TRATORISTA', 'Tratorista', NULL, 1, 140, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Expense Categories
INSERT INTO reference_data (id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at) VALUES
('ref-expense-canteen', 'expense_category', 'CANTEEN', 'Canteen', NULL, 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-expense-pix', 'expense_category', 'PIX', 'PIX', 'Always in BRL', 1, 20, '{"brlOnly":true}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-expense-flights', 'expense_category', 'FLIGHTS', 'Flights', NULL, 1, 30, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-expense-pay-daily-wager', 'expense_category', 'PAY_DAILY_WAGER', 'Pay Daily Wager', NULL, 1, 40, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-expense-diverse', 'expense_category', 'DIVERSE', 'Diverse', NULL, 1, 50, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Ledger Currency
INSERT INTO reference_data (id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at) VALUES
('ref-currency-brl', 'ledger_currency', 'BRL', 'Real', NULL, 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-currency-gold', 'ledger_currency', 'GOLD_GRAMS', 'Gold Grams', NULL, 1, 20, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Ledger C/D
INSERT INTO reference_data (id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at) VALUES
('ref-cd-credit', 'ledger_cd_flag', 'CREDIT', 'Credit', NULL, 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-cd-debit', 'ledger_cd_flag', 'DEBIT', 'Debit', NULL, 1, 20, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Period codes
INSERT INTO reference_data (id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at) VALUES
('ref-period-day', 'period_code', 'DAY', 'Day', '12-hour day shift', 1, 10, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('ref-period-night', 'period_code', 'NIGHT', 'Night', '12-hour night shift', 1, 20, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
```

---

## 30.4 `000002_seed_reference_data.down.sql`

```sql
DELETE FROM reference_data WHERE type IN (
  'person_status',
  'collaborator_status',
  'method',
  'sector',
  'location',
  'task',
  'expense_category',
  'ledger_currency',
  'ledger_cd_flag',
  'period_code'
);
```

---

## 30.5 `000003_seed_roles_and_settings.up.sql`

```sql
INSERT INTO roles (id, code, label, created_at, updated_at) VALUES
('role-admin', 'ADMIN', 'Administrator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('role-planner', 'PLANNER', 'Planner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('role-mercantile-operator', 'MERCANTILE_OPERATOR', 'Mercantile Operator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('role-finance-viewer', 'FINANCE_VIEWER', 'Finance Viewer', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- These assume a bootstrap admin user will be created before or separately.
-- If not, replace 'bootstrap-admin-user-id' after user creation.
INSERT INTO system_settings (id, key, value, description, updated_by, updated_at) VALUES
('setting-journey-default-days', 'journey_default_days', '90', 'Default collaborator journey length in days', 'bootstrap-admin-user-id', CURRENT_TIMESTAMP),
('setting-return-wait-days', 'return_wait_days', '30', 'Minimum wait between journeys', 'bootstrap-admin-user-id', CURRENT_TIMESTAMP),
('setting-salary-daily-divisor', 'salary_daily_divisor', '30', 'Divisor used to normalize monthly salary into daily accrual', 'bootstrap-admin-user-id', CURRENT_TIMESTAMP),
('setting-max-sick-days', 'max_sick_days', '3', 'Maximum sick days allowed for commissioned collaborator rules', 'bootstrap-admin-user-id', CURRENT_TIMESTAMP),
('setting-commission-projection-basis', 'commission_projection_basis', 'rolling_average', 'How projected commission is estimated', 'bootstrap-admin-user-id', CURRENT_TIMESTAMP);
```

---

## 30.6 `000003_seed_roles_and_settings.down.sql`

```sql
DELETE FROM system_settings WHERE key IN (
  'journey_default_days',
  'return_wait_days',
  'salary_daily_divisor',
  'max_sick_days',
  'commission_projection_basis'
);

DELETE FROM roles WHERE code IN (
  'ADMIN',
  'PLANNER',
  'MERCANTILE_OPERATOR',
  'FINANCE_VIEWER'
);
```

---

## 31. What must still be enforced in application code

Even with this schema, these rules should remain in service-layer validation:

1. only one active collaborator journey per person
2. 30-day wait before new journey unless override
3. PIX category must use BRL
4. zero-gold cannot exceed current positive gold balance without override
5. closed journeys should reject new normal postings
6. commission accrual must hold when production is missing
7. sick-day maximum of 3 for commissioned collaborator rules
8. only mine-well locations may be used for mine production
9. reversal should not be allowed twice for the same effective posting

---

## 32. Recommended Next Step After Models and Migrations

The next best artifact is:

1. **Fiber route map**
2. **request/response DTOs**
3. **service interfaces**
4. **repository interfaces**

That will let the backend implementation begin cleanly.

---

## 33. Fiber Route Map

All backend endpoints are versioned under:

```text
/api/v1
```

Recommended route registration layout:

```go
func RegisterRoutes(app *fiber.App, deps Dependencies) {
	api := app.Group("/api")
	v1 := api.Group("/v1")

	RegisterAuthRoutes(v1, deps.AuthHandler)
	RegisterPeopleRoutes(v1, deps.PeopleHandler, deps.AuthMiddleware)
	RegisterCollaboratorRoutes(v1, deps.CollaboratorHandler, deps.AuthMiddleware)
	RegisterReferenceDataRoutes(v1, deps.ReferenceDataHandler, deps.AuthMiddleware)
	RegisterWorkPeriodRoutes(v1, deps.WorkPeriodHandler, deps.AuthMiddleware)
	RegisterPlanningRoutes(v1, deps.PlanningHandler, deps.AuthMiddleware)
	RegisterMineProductionRoutes(v1, deps.MineProductionHandler, deps.AuthMiddleware)
	RegisterGoldPriceRoutes(v1, deps.GoldPriceHandler, deps.AuthMiddleware)
	RegisterPriceListRoutes(v1, deps.PriceListHandler, deps.AuthMiddleware)
	RegisterExpenseRoutes(v1, deps.ExpenseHandler, deps.AuthMiddleware)
	RegisterCurrentAccountRoutes(v1, deps.CurrentAccountHandler, deps.AuthMiddleware)
	RegisterReportRoutes(v1, deps.ReportHandler, deps.AuthMiddleware)
}
```

---

## 33.1 Auth routes

```text
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
```

### Handler registration

```go
func RegisterAuthRoutes(v1 fiber.Router, h *auth.Handler) {
	r := v1.Group("/auth")
	r.Post("/login", h.Login)
	r.Post("/logout", h.Logout)
	r.Get("/me", h.Me)
}
```

---

## 33.2 People routes

```text
GET    /api/v1/people
POST   /api/v1/people
GET    /api/v1/people/:id
PUT    /api/v1/people/:id
GET    /api/v1/people/:id/journeys
```

### Handler registration

```go
func RegisterPeopleRoutes(v1 fiber.Router, h *people.Handler, auth fiber.Handler) {
	r := v1.Group("/people", auth)
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/:id", h.GetByID)
	r.Put("/:id", h.Update)
	r.Get("/:id/journeys", h.ListJourneys)
}
```

---

## 33.3 Collaborator journey routes

```text
GET    /api/v1/collaborators
POST   /api/v1/collaborators
GET    /api/v1/collaborators/:id
PUT    /api/v1/collaborators/:id
POST   /api/v1/collaborators/:id/extend
POST   /api/v1/collaborators/:id/finish
GET    /api/v1/collaborators/:id/projection
```

### Handler registration

```go
func RegisterCollaboratorRoutes(v1 fiber.Router, h *collaborators.Handler, auth fiber.Handler) {
	r := v1.Group("/collaborators", auth)
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/:id", h.GetByID)
	r.Put("/:id", h.Update)
	r.Post("/:id/extend", h.Extend)
	r.Post("/:id/finish", h.Finish)
	r.Get("/:id/projection", h.GetProjection)
}
```

---

## 33.4 Reference data routes

```text
GET    /api/v1/reference-data
GET    /api/v1/reference-data/:type
POST   /api/v1/reference-data/:type
PUT    /api/v1/reference-data/:type/:id
```

### Handler registration

```go
func RegisterReferenceDataRoutes(v1 fiber.Router, h *referencedata.Handler, auth fiber.Handler) {
	r := v1.Group("/reference-data", auth)
	r.Get("/", h.ListTypes)
	r.Get("/:type", h.ListByType)
	r.Post("/:type", h.Create)
	r.Put("/:type/:id", h.Update)
}
```

---

## 33.5 Work period routes

```text
GET    /api/v1/work-periods
POST   /api/v1/work-periods
GET    /api/v1/work-periods/:id
PUT    /api/v1/work-periods/:id
```

### Handler registration

```go
func RegisterWorkPeriodRoutes(v1 fiber.Router, h *workperiods.Handler, auth fiber.Handler) {
	r := v1.Group("/work-periods", auth)
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/:id", h.GetByID)
	r.Put("/:id", h.Update)
}
```

---

## 33.6 Planning routes

```text
POST   /api/v1/work-periods/:id/plan/seed-from-previous
GET    /api/v1/work-periods/:id/plan
PUT    /api/v1/work-periods/:id/plan-items/:planItemId
POST   /api/v1/work-periods/:id/inform
POST   /api/v1/work-periods/:id/accrue
GET    /api/v1/work-periods/:id/accrual
```

### Handler registration

```go
func RegisterPlanningRoutes(v1 fiber.Router, h *planning.Handler, auth fiber.Handler) {
	r := v1.Group("/work-periods", auth)
	r.Post("/:id/plan/seed-from-previous", h.SeedFromPrevious)
	r.Get("/:id/plan", h.GetPlan)
	r.Put("/:id/plan-items/:planItemId", h.UpdatePlanItem)
	r.Post("/:id/inform", h.MarkInformed)
	r.Post("/:id/accrue", h.Accrue)
	r.Get("/:id/accrual", h.GetAccrual)
}
```

---

## 33.7 Mine production routes

```text
GET    /api/v1/mine-productions
POST   /api/v1/mine-productions
GET    /api/v1/mine-productions/:id
PUT    /api/v1/mine-productions/:id
```

### Handler registration

```go
func RegisterMineProductionRoutes(v1 fiber.Router, h *mineproduction.Handler, auth fiber.Handler) {
	r := v1.Group("/mine-productions", auth)
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/:id", h.GetByID)
	r.Put("/:id", h.Update)
}
```

---

## 33.8 Gold price routes

```text
GET    /api/v1/gold-prices
POST   /api/v1/gold-prices
GET    /api/v1/gold-prices/latest
GET    /api/v1/gold-prices/:id
PUT    /api/v1/gold-prices/:id
```

### Handler registration

```go
func RegisterGoldPriceRoutes(v1 fiber.Router, h *goldprices.Handler, auth fiber.Handler) {
	r := v1.Group("/gold-prices", auth)
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/latest", h.GetLatest)
	r.Get("/:id", h.GetByID)
	r.Put("/:id", h.Update)
}
```

---

## 33.9 Price list routes

```text
GET    /api/v1/price-list
POST   /api/v1/price-list
GET    /api/v1/price-list/:id
PUT    /api/v1/price-list/:id
GET    /api/v1/price-list/:id/price-preview?currency=BRL|GOLD_GRAMS
```

### Handler registration

```go
func RegisterPriceListRoutes(v1 fiber.Router, h *pricelist.Handler, auth fiber.Handler) {
	r := v1.Group("/price-list", auth)
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/:id", h.GetByID)
	r.Put("/:id", h.Update)
	r.Get("/:id/price-preview", h.GetPricePreview)
}
```

---

## 33.10 Expense routes

```text
GET    /api/v1/expenses
POST   /api/v1/expenses
GET    /api/v1/expenses/:id
POST   /api/v1/expenses/:id/revert
```

### Handler registration

```go
func RegisterExpenseRoutes(v1 fiber.Router, h *expenses.Handler, auth fiber.Handler) {
	r := v1.Group("/expenses", auth)
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Get("/:id", h.GetByID)
	r.Post("/:id/revert", h.Revert)
}
```

---

## 33.11 Current account routes

```text
GET    /api/v1/current-accounts/:collaboratorId/summary
GET    /api/v1/current-accounts/:collaboratorId/entries
POST   /api/v1/current-accounts/entries/:entryId/revert
POST   /api/v1/current-accounts/:collaboratorId/zero-gold
POST   /api/v1/current-accounts/:collaboratorId/close
```

### Handler registration

```go
func RegisterCurrentAccountRoutes(v1 fiber.Router, h *currentaccounts.Handler, auth fiber.Handler) {
	r := v1.Group("/current-accounts", auth)
	r.Get("/:collaboratorId/summary", h.GetSummary)
	r.Get("/:collaboratorId/entries", h.ListEntries)
	r.Post("/entries/:entryId/revert", h.RevertEntry)
	r.Post("/:collaboratorId/zero-gold", h.ZeroGold)
	r.Post("/:collaboratorId/close", h.CloseJourney)
}
```

---

## 33.12 Report routes

```text
GET    /api/v1/reports/dashboard
GET    /api/v1/reports/collaborator-balances
GET    /api/v1/reports/journeys-ending-soon
GET    /api/v1/reports/pending-production-accruals
GET    /api/v1/reports/mercantile-sales
```

### Handler registration

```go
func RegisterReportRoutes(v1 fiber.Router, h *reports.Handler, auth fiber.Handler) {
	r := v1.Group("/reports", auth)
	r.Get("/dashboard", h.Dashboard)
	r.Get("/collaborator-balances", h.CollaboratorBalances)
	r.Get("/journeys-ending-soon", h.JourneysEndingSoon)
	r.Get("/pending-production-accruals", h.PendingProductionAccruals)
	r.Get("/mercantile-sales", h.MercantileSales)
}
```

---

## 34. Shared DTOs and API Response Envelopes

Recommended package:

```text
/internal/shared/dto
```

### 34.1 Standard API response

```go
package dto

type APIResponse[T any] struct {
	Data  T          `json:"data,omitempty"`
	Error *APIError  `json:"error,omitempty"`
	Meta  *Meta      `json:"meta,omitempty"`
}

type APIError struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

type Meta struct {
	Page       int   `json:"page,omitempty"`
	PageSize   int   `json:"pageSize,omitempty"`
	TotalRows  int64 `json:"totalRows,omitempty"`
	TotalPages int   `json:"totalPages,omitempty"`
}
```

### 34.2 Pagination request

```go
package dto

type PageRequest struct {
	Page     int    `query:"page" json:"page"`
	PageSize int    `query:"pageSize" json:"pageSize"`
	Search   string `query:"search" json:"search,omitempty"`
	Sort     string `query:"sort" json:"sort,omitempty"`
}
```

### 34.3 Common date filters

```go
package dto

type DateRangeFilter struct {
	FromDate string `query:"fromDate" json:"fromDate,omitempty"`
	ToDate   string `query:"toDate" json:"toDate,omitempty"`
}
```

---

## 35. Auth DTOs

```go
package auth

type LoginRequest struct {
	Username string `json:"username" validate:"required"`
	Password string `json:"password" validate:"required"`
}

type LoginResponse struct {
	AccessToken string       `json:"accessToken"`
	User        CurrentUserDTO `json:"user"`
}

type CurrentUserDTO struct {
	ID          string   `json:"id"`
	Username    string   `json:"username"`
	Email       string   `json:"email"`
	DisplayName string   `json:"displayName"`
	Roles       []string `json:"roles"`
}
```

---

## 36. People DTOs

```go
package people

type PersonDTO struct {
	ID                    string `json:"id"`
	Name                  string `json:"name"`
	Address               string `json:"address,omitempty"`
	Phone                 string `json:"phone,omitempty"`
	Email                 string `json:"email,omitempty"`
	CPF                   string `json:"cpf,omitempty"`
	BankData              string `json:"bankData,omitempty"`
	PIXKey                string `json:"pixKey,omitempty"`
	EmergencyContactName  string `json:"emergencyContactName,omitempty"`
	EmergencyContactPhone string `json:"emergencyContactPhone,omitempty"`
	EmergencyContactNotes string `json:"emergencyContactNotes,omitempty"`
	StatusID              string `json:"statusId"`
	StatusLabel           string `json:"statusLabel,omitempty"`
	Notes                 string `json:"notes,omitempty"`
	CreatedAt             string `json:"createdAt"`
	UpdatedAt             string `json:"updatedAt"`
}

type CreatePersonRequest struct {
	Name                  string  `json:"name" validate:"required"`
	Address               string  `json:"address,omitempty"`
	Phone                 *string `json:"phone,omitempty"`
	Email                 *string `json:"email,omitempty"`
	CPF                   *string `json:"cpf,omitempty"`
	BankData              string  `json:"bankData,omitempty"`
	PIXKey                *string `json:"pixKey,omitempty"`
	EmergencyContactName  string  `json:"emergencyContactName,omitempty"`
	EmergencyContactPhone string  `json:"emergencyContactPhone,omitempty"`
	EmergencyContactNotes string  `json:"emergencyContactNotes,omitempty"`
	StatusID              string  `json:"statusId" validate:"required"`
	Notes                 string  `json:"notes,omitempty"`
}

type UpdatePersonRequest struct {
	Name                  string  `json:"name" validate:"required"`
	Address               string  `json:"address,omitempty"`
	Phone                 *string `json:"phone,omitempty"`
	Email                 *string `json:"email,omitempty"`
	CPF                   *string `json:"cpf,omitempty"`
	BankData              string  `json:"bankData,omitempty"`
	PIXKey                *string `json:"pixKey,omitempty"`
	EmergencyContactName  string  `json:"emergencyContactName,omitempty"`
	EmergencyContactPhone string  `json:"emergencyContactPhone,omitempty"`
	EmergencyContactNotes string  `json:"emergencyContactNotes,omitempty"`
	StatusID              string  `json:"statusId" validate:"required"`
	Notes                 string  `json:"notes,omitempty"`
}

type PersonListFilter struct {
	Search   string `query:"search"`
	StatusID string `query:"statusId"`
	Page     int    `query:"page"`
	PageSize int    `query:"pageSize"`
}
```

---

## 37. Collaborator DTOs

```go
package collaborators

type CollaboratorDTO struct {
	ID                string  `json:"id"`
	PersonID          string  `json:"personId"`
	PersonName        string  `json:"personName,omitempty"`
	JourneyStartDate  string  `json:"journeyStartDate"`
	DefaultEndDate    string  `json:"defaultEndDate"`
	ExtensionDays     int     `json:"extensionDays"`
	ProjectedEndDate  string  `json:"projectedEndDate"`
	PaymentMethodID   string  `json:"paymentMethodId"`
	PaymentMethodCode string  `json:"paymentMethodCode,omitempty"`
	PaymentMethodName string  `json:"paymentMethodName,omitempty"`
	PaymentValue      float64 `json:"paymentValue"`
	SectorID          string  `json:"sectorId"`
	SectorLabel       string  `json:"sectorLabel,omitempty"`
	LocationID        string  `json:"locationId"`
	LocationLabel     string  `json:"locationLabel,omitempty"`
	TaskID            string  `json:"taskId"`
	TaskLabel         string  `json:"taskLabel,omitempty"`
	StatusID          string  `json:"statusId"`
	StatusLabel       string  `json:"statusLabel,omitempty"`
	Notes             string  `json:"notes,omitempty"`
	ClosedAt          string  `json:"closedAt,omitempty"`
}

type CreateCollaboratorRequest struct {
	PersonID         string  `json:"personId" validate:"required"`
	JourneyStartDate string  `json:"journeyStartDate" validate:"required"`
	PaymentMethodID  string  `json:"paymentMethodId" validate:"required"`
	PaymentValue     float64 `json:"paymentValue" validate:"required,gt=0"`
	SectorID         string  `json:"sectorId" validate:"required"`
	LocationID       string  `json:"locationId" validate:"required"`
	TaskID           string  `json:"taskId" validate:"required"`
	StatusID         string  `json:"statusId" validate:"required"`
	Notes            string  `json:"notes,omitempty"`
	OverrideWaitRule bool    `json:"overrideWaitRule,omitempty"`
}

type UpdateCollaboratorRequest struct {
	PaymentMethodID string  `json:"paymentMethodId" validate:"required"`
	PaymentValue    float64 `json:"paymentValue" validate:"required,gt=0"`
	SectorID        string  `json:"sectorId" validate:"required"`
	LocationID      string  `json:"locationId" validate:"required"`
	TaskID          string  `json:"taskId" validate:"required"`
	StatusID        string  `json:"statusId" validate:"required"`
	Notes           string  `json:"notes,omitempty"`
}

type ExtendJourneyRequest struct {
	AdditionalDays int    `json:"additionalDays" validate:"required,gt=0"`
	Reason         string `json:"reason,omitempty"`
}

type FinishJourneyRequest struct {
	FinishDate string `json:"finishDate" validate:"required"`
	Reason     string `json:"reason,omitempty"`
}

type CollaboratorProjectionDTO struct {
	CollaboratorID               string  `json:"collaboratorId"`
	CurrencyCode                 string  `json:"currencyCode"`
	PostedEarningsToDate         float64 `json:"postedEarningsToDate"`
	EstimatedRemainingEarnings   float64 `json:"estimatedRemainingEarnings"`
	ProjectedTotalEarnings       float64 `json:"projectedTotalEarnings"`
	ProjectionBasis              string  `json:"projectionBasis"`
	ProjectedThroughDate         string  `json:"projectedThroughDate"`
}

type CollaboratorListFilter struct {
	Search          string `query:"search"`
	StatusID        string `query:"statusId"`
	LocationID      string `query:"locationId"`
	PaymentMethodID string `query:"paymentMethodId"`
	EndingFromDate  string `query:"endingFromDate"`
	EndingToDate    string `query:"endingToDate"`
	Page            int    `query:"page"`
	PageSize        int    `query:"pageSize"`
}
```

---

## 38. Reference Data DTOs

```go
package referencedata

type ReferenceDataDTO struct {
	ID           string `json:"id"`
	Type         string `json:"type"`
	Code         string `json:"code"`
	Label        string `json:"label"`
	Description  string `json:"description,omitempty"`
	Active       bool   `json:"active"`
	SortOrder    int    `json:"sortOrder"`
	MetadataJSON string `json:"metadataJson,omitempty"`
}

type CreateReferenceDataRequest struct {
	Code         string `json:"code" validate:"required"`
	Label        string `json:"label" validate:"required"`
	Description  string `json:"description,omitempty"`
	Active       bool   `json:"active"`
	SortOrder    int    `json:"sortOrder"`
	MetadataJSON string `json:"metadataJson,omitempty"`
}

type UpdateReferenceDataRequest struct {
	Label        string `json:"label" validate:"required"`
	Description  string `json:"description,omitempty"`
	Active       bool   `json:"active"`
	SortOrder    int    `json:"sortOrder"`
	MetadataJSON string `json:"metadataJson,omitempty"`
}
```

---

## 39. Work Period and Planning DTOs

```go
package workperiods

type WorkPeriodDTO struct {
	ID                     string `json:"id"`
	WorkDate               string `json:"workDate"`
	PeriodCode             string `json:"periodCode"`
	StartsAt               string `json:"startsAt,omitempty"`
	EndsAt                 string `json:"endsAt,omitempty"`
	Status                 string `json:"status"`
	SeededFromWorkPeriodID string `json:"seededFromWorkPeriodId,omitempty"`
}

type CreateWorkPeriodRequest struct {
	WorkDate   string `json:"workDate" validate:"required"`
	PeriodCode string `json:"periodCode" validate:"required"`
	StartsAt   string `json:"startsAt,omitempty"`
	EndsAt     string `json:"endsAt,omitempty"`
}

type UpdateWorkPeriodRequest struct {
	StartsAt string `json:"startsAt,omitempty"`
	EndsAt   string `json:"endsAt,omitempty"`
	Status   string `json:"status" validate:"required"`
}
```

```go
package planning

type PlanItemDTO struct {
	ID                           string  `json:"id"`
	WorkPeriodID                 string  `json:"workPeriodId"`
	CollaboratorID               string  `json:"collaboratorId"`
	CollaboratorName             string  `json:"collaboratorName,omitempty"`
	IncludeFlag                  bool    `json:"includeFlag"`
	SectorID                     string  `json:"sectorId"`
	SectorLabel                  string  `json:"sectorLabel,omitempty"`
	LocationID                   string  `json:"locationId"`
	LocationLabel                string  `json:"locationLabel,omitempty"`
	TaskID                       string  `json:"taskId"`
	TaskLabel                    string  `json:"taskLabel,omitempty"`
	MethodID                     string  `json:"methodId"`
	MethodLabel                  string  `json:"methodLabel,omitempty"`
	PaymentValueSnapshot         float64 `json:"paymentValueSnapshot"`
	AssignmentStatus             string  `json:"assignmentStatus"`
	SubstitutedForCollaboratorID string  `json:"substitutedForCollaboratorId,omitempty"`
	SubstitutedForName           string  `json:"substitutedForName,omitempty"`
	ExceptionType                string  `json:"exceptionType,omitempty"`
	Comments                     string  `json:"comments,omitempty"`
}

type WorkPlanDTO struct {
	WorkPeriod WorkPeriodSummaryDTO `json:"workPeriod"`
	Items      []PlanItemDTO        `json:"items"`
}

type WorkPeriodSummaryDTO struct {
	ID         string `json:"id"`
	WorkDate   string `json:"workDate"`
	PeriodCode string `json:"periodCode"`
	Status     string `json:"status"`
}

type SeedFromPreviousRequest struct {
	PreviousWorkPeriodID string `json:"previousWorkPeriodId,omitempty"`
}

type UpdatePlanItemRequest struct {
	IncludeFlag                  bool    `json:"includeFlag"`
	SectorID                     string  `json:"sectorId" validate:"required"`
	LocationID                   string  `json:"locationId" validate:"required"`
	TaskID                       string  `json:"taskId" validate:"required"`
	MethodID                     string  `json:"methodId" validate:"required"`
	PaymentValueSnapshot         float64 `json:"paymentValueSnapshot" validate:"required"`
	AssignmentStatus             string  `json:"assignmentStatus" validate:"required"`
	SubstitutedForCollaboratorID *string `json:"substitutedForCollaboratorId,omitempty"`
	ExceptionType                *string `json:"exceptionType,omitempty"`
	Comments                     string  `json:"comments,omitempty"`
}

type AccrueWorkPeriodRequest struct {
	Comments string `json:"comments,omitempty"`
}

type AccrualBatchDTO struct {
	ID            string            `json:"id"`
	WorkPeriodID  string            `json:"workPeriodId"`
	AccrualStatus string            `json:"accrualStatus"`
	Comments      string            `json:"comments,omitempty"`
	Items         []AccrualItemDTO  `json:"items"`
}

type AccrualItemDTO struct {
	ID                   string  `json:"id"`
	CollaboratorID       string  `json:"collaboratorId"`
	CollaboratorName     string  `json:"collaboratorName,omitempty"`
	MethodID             string  `json:"methodId"`
	MethodLabel          string  `json:"methodLabel,omitempty"`
	CurrencyCode         string  `json:"currencyCode"`
	GrossAmount          float64 `json:"grossAmount"`
	TransferAmount       float64 `json:"transferAmount"`
	NetAmount            float64 `json:"netAmount"`
	HoldReason           string  `json:"holdReason,omitempty"`
	Status               string  `json:"status"`
	Comments             string  `json:"comments,omitempty"`
}
```

---

## 40. Mine Production DTOs

```go
package mineproduction

type MineWellProductionDTO struct {
	ID             string  `json:"id"`
	WorkPeriodID   string  `json:"workPeriodId"`
	WorkDate       string  `json:"workDate"`
	PeriodCode     string  `json:"periodCode"`
	LocationID     string  `json:"locationId"`
	LocationLabel  string  `json:"locationLabel,omitempty"`
	GramsProduced  float64 `json:"gramsProduced"`
	Comments       string  `json:"comments,omitempty"`
	CreatedBy      string  `json:"createdBy"`
}

type CreateMineWellProductionRequest struct {
	WorkPeriodID  string  `json:"workPeriodId" validate:"required"`
	LocationID    string  `json:"locationId" validate:"required"`
	GramsProduced float64 `json:"gramsProduced" validate:"gte=0"`
	Comments      string  `json:"comments,omitempty"`
}

type UpdateMineWellProductionRequest struct {
	GramsProduced float64 `json:"gramsProduced" validate:"gte=0"`
	Comments      string  `json:"comments,omitempty"`
}

type MineProductionListFilter struct {
	FromDate   string `query:"fromDate"`
	ToDate     string `query:"toDate"`
	LocationID string `query:"locationId"`
	Page       int    `query:"page"`
	PageSize   int    `query:"pageSize"`
}
```

---

## 41. Gold Price DTOs

```go
package goldprices

type GoldPriceDTO struct {
	ID                string  `json:"id"`
	QuoteDate         string  `json:"quoteDate"`
	QuotedAtTime      string  `json:"quotedAtTime,omitempty"`
	PriceBRLPerGram   float64 `json:"priceBRLPerGram"`
	SourceName        string  `json:"sourceName,omitempty"`
	Comments          string  `json:"comments,omitempty"`
	CreatedBy         string  `json:"createdBy"`
}

type CreateGoldPriceRequest struct {
	QuoteDate       string  `json:"quoteDate" validate:"required"`
	QuotedAtTime    string  `json:"quotedAtTime,omitempty"`
	PriceBRLPerGram float64 `json:"priceBRLPerGram" validate:"required,gt=0"`
	SourceName      string  `json:"sourceName,omitempty"`
	Comments        string  `json:"comments,omitempty"`
}

type UpdateGoldPriceRequest struct {
	QuotedAtTime    string  `json:"quotedAtTime,omitempty"`
	PriceBRLPerGram float64 `json:"priceBRLPerGram" validate:"required,gt=0"`
	SourceName      string  `json:"sourceName,omitempty"`
	Comments        string  `json:"comments,omitempty"`
}
```

---

## 42. Price List DTOs

```go
package pricelist

type PriceListItemDTO struct {
	ID             string  `json:"id"`
	Code           string  `json:"code,omitempty"`
	Name           string  `json:"name"`
	Description    string  `json:"description,omitempty"`
	CategoryID     string  `json:"categoryId"`
	CategoryLabel  string  `json:"categoryLabel,omitempty"`
	PriceBRL       float64 `json:"priceBRL"`
	Active         bool    `json:"active"`
}

type CreatePriceListItemRequest struct {
	Code        *string `json:"code,omitempty"`
	Name        string  `json:"name" validate:"required"`
	Description string  `json:"description,omitempty"`
	CategoryID  string  `json:"categoryId" validate:"required"`
	PriceBRL    float64 `json:"priceBRL" validate:"required,gte=0"`
	Active      bool    `json:"active"`
}

type UpdatePriceListItemRequest struct {
	Code        *string `json:"code,omitempty"`
	Name        string  `json:"name" validate:"required"`
	Description string  `json:"description,omitempty"`
	CategoryID  string  `json:"categoryId" validate:"required"`
	PriceBRL    float64 `json:"priceBRL" validate:"required,gte=0"`
	Active      bool    `json:"active"`
}

type PricePreviewDTO struct {
	ItemID              string  `json:"itemId"`
	CurrencyCode        string  `json:"currencyCode"`
	PriceBRL            float64 `json:"priceBRL"`
	GoldPriceBRLPerGram float64 `json:"goldPriceBRLPerGram,omitempty"`
	PriceGoldGrams      float64 `json:"priceGoldGrams,omitempty"`
	QuoteDate           string  `json:"quoteDate,omitempty"`
}
```

---

## 43. Expense DTOs

```go
package expenses

type ExpenseTransactionDTO struct {
	ID                    string           `json:"id"`
	CollaboratorID         string           `json:"collaboratorId"`
	CollaboratorName       string           `json:"collaboratorName,omitempty"`
	ExpenseDate            string           `json:"expenseDate"`
	CurrencyCode           string           `json:"currencyCode"`
	TotalAmount            float64          `json:"totalAmount"`
	CategoryID             string           `json:"categoryId"`
	CategoryLabel          string           `json:"categoryLabel,omitempty"`
	GoldPriceID            string           `json:"goldPriceId,omitempty"`
	CollaboratorAgreement  bool             `json:"collaboratorAgreement"`
	Comments               string           `json:"comments,omitempty"`
	Items                  []ExpenseItemDTO `json:"items"`
}

type ExpenseItemDTO struct {
	ID                 string  `json:"id"`
	PriceListItemID    string  `json:"priceListItemId,omitempty"`
	ItemNameSnapshot   string  `json:"itemNameSnapshot"`
	Quantity           float64 `json:"quantity"`
	UnitPrice          float64 `json:"unitPrice"`
	TotalPrice         float64 `json:"totalPrice"`
	Comments           string  `json:"comments,omitempty"`
}

type CreateExpenseRequest struct {
	CollaboratorID        string                     `json:"collaboratorId" validate:"required"`
	ExpenseDate           string                     `json:"expenseDate" validate:"required"`
	CurrencyCode          string                     `json:"currencyCode" validate:"required"`
	CategoryID            string                     `json:"categoryId" validate:"required"`
	CollaboratorAgreement bool                       `json:"collaboratorAgreement" validate:"eq=true"`
	Comments              string                     `json:"comments,omitempty"`
	Items                 []CreateExpenseItemRequest `json:"items" validate:"required,min=1,dive"`
}

type CreateExpenseItemRequest struct {
	PriceListItemID  *string `json:"priceListItemId,omitempty"`
	ItemName         string  `json:"itemName" validate:"required"`
	Quantity         float64 `json:"quantity" validate:"required,gt=0"`
	UnitPrice        float64 `json:"unitPrice" validate:"required,gte=0"`
	Comments         string  `json:"comments,omitempty"`
}

type RevertExpenseRequest struct {
	Reason string `json:"reason" validate:"required"`
}

type ExpenseListFilter struct {
	CollaboratorID string `query:"collaboratorId"`
	CurrencyCode   string `query:"currencyCode"`
	CategoryID     string `query:"categoryId"`
	FromDate       string `query:"fromDate"`
	ToDate         string `query:"toDate"`
	Page           int    `query:"page"`
	PageSize       int    `query:"pageSize"`
}
```

---

## 44. Current Account DTOs

```go
package currentaccounts

type CurrentAccountSummaryDTO struct {
	CollaboratorID         string  `json:"collaboratorId"`
	CollaboratorName       string  `json:"collaboratorName,omitempty"`
	JourneyStartDate       string  `json:"journeyStartDate"`
	ProjectedEndDate       string  `json:"projectedEndDate"`
	PaymentMethodCode      string  `json:"paymentMethodCode"`
	BRLCredits             float64 `json:"brlCredits"`
	BRLDebits              float64 `json:"brlDebits"`
	BRLBalance             float64 `json:"brlBalance"`
	GoldCredits            float64 `json:"goldCredits"`
	GoldDebits             float64 `json:"goldDebits"`
	GoldBalance            float64 `json:"goldBalance"`
	ProjectedEarningsValue float64 `json:"projectedEarningsValue"`
	ProjectedCurrencyCode  string  `json:"projectedCurrencyCode"`
	ProjectionBasis        string  `json:"projectionBasis,omitempty"`
}

type CurrentAccountEntryDTO struct {
	ID               string  `json:"id"`
	RevertedEntryID  string  `json:"revertedEntryId,omitempty"`
	CollaboratorID   string  `json:"collaboratorId"`
	EntryDate        string  `json:"entryDate"`
	SourceType       string  `json:"sourceType"`
	SourceID         string  `json:"sourceId,omitempty"`
	LedgerGroupID    string  `json:"ledgerGroupId,omitempty"`
	MethodID         string  `json:"methodId,omitempty"`
	CurrencyCode     string  `json:"currencyCode"`
	CDFlag           string  `json:"cdFlag"`
	ItemDescription  string  `json:"itemDescription"`
	Quantity         float64 `json:"quantity"`
	UnitPrice        float64 `json:"unitPrice"`
	TotalPrice       float64 `json:"totalPrice"`
	Comments         string  `json:"comments,omitempty"`
	Status           string  `json:"status"`
	CreatedBy        string  `json:"createdBy"`
	CreatedAt        string  `json:"createdAt"`
}

type CurrentAccountEntryFilter struct {
	CurrencyCode string `query:"currencyCode"`
	SourceType   string `query:"sourceType"`
	FromDate     string `query:"fromDate"`
	ToDate       string `query:"toDate"`
	Page         int    `query:"page"`
	PageSize     int    `query:"pageSize"`
}

type RevertLedgerEntryRequest struct {
	Reason string `json:"reason" validate:"required"`
}

type ZeroGoldRequest struct {
	AmountGoldGrams float64 `json:"amountGoldGrams" validate:"required,gt=0"`
	Comments        string  `json:"comments,omitempty"`
}

type CloseJourneyRequest struct {
	CloseDate string `json:"closeDate" validate:"required"`
	Comments  string `json:"comments,omitempty"`
}

type CloseJourneyPreviewDTO struct {
	CollaboratorID string  `json:"collaboratorId"`
	BRLBalance     float64 `json:"brlBalance"`
	GoldBalance    float64 `json:"goldBalance"`
	CanClose        bool    `json:"canClose"`
	Warnings        []string `json:"warnings,omitempty"`
}
```

---

## 45. Report DTOs

```go
package reports

type DashboardDTO struct {
	ActiveCollaboratorsCount       int64   `json:"activeCollaboratorsCount"`
	JourneysEndingSoonCount        int64   `json:"journeysEndingSoonCount"`
	PendingAccrualsCount           int64   `json:"pendingAccrualsCount"`
	LatestGoldPriceBRLPerGram      float64 `json:"latestGoldPriceBRLPerGram"`
	LatestGoldPriceDate            string  `json:"latestGoldPriceDate,omitempty"`
	TodayExpensesBRL               float64 `json:"todayExpensesBRL"`
	TodayExpensesGold              float64 `json:"todayExpensesGold"`
	NegativeBRLBalanceCount        int64   `json:"negativeBRLBalanceCount"`
	NegativeGoldBalanceCount       int64   `json:"negativeGoldBalanceCount"`
}

type CollaboratorBalanceReportRowDTO struct {
	CollaboratorID   string  `json:"collaboratorId"`
	CollaboratorName string  `json:"collaboratorName"`
	BRLBalance       float64 `json:"brlBalance"`
	GoldBalance      float64 `json:"goldBalance"`
	ProjectedEndDate string  `json:"projectedEndDate"`
	StatusLabel      string  `json:"statusLabel"`
}

type JourneysEndingSoonRowDTO struct {
	CollaboratorID   string `json:"collaboratorId"`
	CollaboratorName string `json:"collaboratorName"`
	ProjectedEndDate string `json:"projectedEndDate"`
	DaysRemaining    int    `json:"daysRemaining"`
}

type PendingProductionAccrualRowDTO struct {
	WorkPeriodID string `json:"workPeriodId"`
	WorkDate     string `json:"workDate"`
	PeriodCode   string `json:"periodCode"`
	LocationID   string `json:"locationId"`
	LocationName string `json:"locationName"`
	Reason       string `json:"reason"`
}

type MercantileSalesRowDTO struct {
	CategoryID    string  `json:"categoryId"`
	CategoryLabel string  `json:"categoryLabel"`
	CurrencyCode  string  `json:"currencyCode"`
	TotalAmount   float64 `json:"totalAmount"`
}
```

---

## 46. Service Interfaces

The service layer owns business rules. Handlers should only parse requests, call services, and write responses.

Recommended package convention:

```text
/internal/<module>/service.go
```

---

## 46.1 AuthService

```go
package auth

import "context"

type Service interface {
	Login(ctx context.Context, req LoginRequest) (*LoginResponse, error)
	GetCurrentUser(ctx context.Context, userID string) (*CurrentUserDTO, error)
	Logout(ctx context.Context, userID string) error
}
```

---

## 46.2 PeopleService

```go
package people

import "context"

type Service interface {
	List(ctx context.Context, filter PersonListFilter) ([]PersonDTO, int64, error)
	Create(ctx context.Context, req CreatePersonRequest, actorUserID string) (*PersonDTO, error)
	GetByID(ctx context.Context, id string) (*PersonDTO, error)
	Update(ctx context.Context, id string, req UpdatePersonRequest, actorUserID string) (*PersonDTO, error)
	ListJourneys(ctx context.Context, personID string) ([]collaborators.CollaboratorDTO, error)
}
```

---

## 46.3 CollaboratorService

```go
package collaborators

import "context"

type Service interface {
	List(ctx context.Context, filter CollaboratorListFilter) ([]CollaboratorDTO, int64, error)
	Create(ctx context.Context, req CreateCollaboratorRequest, actorUserID string) (*CollaboratorDTO, error)
	GetByID(ctx context.Context, id string) (*CollaboratorDTO, error)
	Update(ctx context.Context, id string, req UpdateCollaboratorRequest, actorUserID string) (*CollaboratorDTO, error)
	Extend(ctx context.Context, id string, req ExtendJourneyRequest, actorUserID string) (*CollaboratorDTO, error)
	Finish(ctx context.Context, id string, req FinishJourneyRequest, actorUserID string) (*CollaboratorDTO, error)
	GetProjection(ctx context.Context, id string) (*CollaboratorProjectionDTO, error)
}
```

---

## 46.4 ReferenceDataService

```go
package referencedata

import "context"

type Service interface {
	ListTypes(ctx context.Context) ([]string, error)
	ListByType(ctx context.Context, typ string, includeInactive bool) ([]ReferenceDataDTO, error)
	Create(ctx context.Context, typ string, req CreateReferenceDataRequest, actorUserID string) (*ReferenceDataDTO, error)
	Update(ctx context.Context, typ string, id string, req UpdateReferenceDataRequest, actorUserID string) (*ReferenceDataDTO, error)
}
```

---

## 46.5 WorkPeriodService

```go
package workperiods

import "context"

type Service interface {
	List(ctx context.Context, filter WorkPeriodListFilter) ([]WorkPeriodDTO, int64, error)
	Create(ctx context.Context, req CreateWorkPeriodRequest, actorUserID string) (*WorkPeriodDTO, error)
	GetByID(ctx context.Context, id string) (*WorkPeriodDTO, error)
	Update(ctx context.Context, id string, req UpdateWorkPeriodRequest, actorUserID string) (*WorkPeriodDTO, error)
}

type WorkPeriodListFilter struct {
	FromDate   string `query:"fromDate"`
	ToDate     string `query:"toDate"`
	PeriodCode string `query:"periodCode"`
	Status     string `query:"status"`
	Page       int    `query:"page"`
	PageSize   int    `query:"pageSize"`
}
```

---

## 46.6 PlanningService

```go
package planning

import "context"

type Service interface {
	SeedFromPrevious(ctx context.Context, workPeriodID string, req SeedFromPreviousRequest, actorUserID string) (*WorkPlanDTO, error)
	GetPlan(ctx context.Context, workPeriodID string) (*WorkPlanDTO, error)
	UpdatePlanItem(ctx context.Context, workPeriodID string, planItemID string, req UpdatePlanItemRequest, actorUserID string) (*PlanItemDTO, error)
	MarkInformed(ctx context.Context, workPeriodID string, actorUserID string) (*WorkPlanDTO, error)
	Accrue(ctx context.Context, workPeriodID string, req AccrueWorkPeriodRequest, actorUserID string) (*AccrualBatchDTO, error)
	GetAccrual(ctx context.Context, workPeriodID string) (*AccrualBatchDTO, error)
}
```

---

## 46.7 MineProductionService

```go
package mineproduction

import "context"

type Service interface {
	List(ctx context.Context, filter MineProductionListFilter) ([]MineWellProductionDTO, int64, error)
	Create(ctx context.Context, req CreateMineWellProductionRequest, actorUserID string) (*MineWellProductionDTO, error)
	GetByID(ctx context.Context, id string) (*MineWellProductionDTO, error)
	Update(ctx context.Context, id string, req UpdateMineWellProductionRequest, actorUserID string) (*MineWellProductionDTO, error)
}
```

---

## 46.8 GoldPriceService

```go
package goldprices

import "context"

type Service interface {
	List(ctx context.Context, filter GoldPriceListFilter) ([]GoldPriceDTO, int64, error)
	Create(ctx context.Context, req CreateGoldPriceRequest, actorUserID string) (*GoldPriceDTO, error)
	GetByID(ctx context.Context, id string) (*GoldPriceDTO, error)
	GetLatest(ctx context.Context) (*GoldPriceDTO, error)
	Update(ctx context.Context, id string, req UpdateGoldPriceRequest, actorUserID string) (*GoldPriceDTO, error)
}

type GoldPriceListFilter struct {
	FromDate string `query:"fromDate"`
	ToDate   string `query:"toDate"`
	Page     int    `query:"page"`
	PageSize int    `query:"pageSize"`
}
```

---

## 46.9 PriceListService

```go
package pricelist

import "context"

type Service interface {
	List(ctx context.Context, filter PriceListFilter) ([]PriceListItemDTO, int64, error)
	Create(ctx context.Context, req CreatePriceListItemRequest, actorUserID string) (*PriceListItemDTO, error)
	GetByID(ctx context.Context, id string) (*PriceListItemDTO, error)
	Update(ctx context.Context, id string, req UpdatePriceListItemRequest, actorUserID string) (*PriceListItemDTO, error)
	GetPricePreview(ctx context.Context, id string, currencyCode string) (*PricePreviewDTO, error)
}

type PriceListFilter struct {
	Search     string `query:"search"`
	CategoryID string `query:"categoryId"`
	ActiveOnly bool   `query:"activeOnly"`
	Page       int    `query:"page"`
	PageSize   int    `query:"pageSize"`
}
```

---

## 46.10 ExpenseService

```go
package expenses

import "context"

type Service interface {
	List(ctx context.Context, filter ExpenseListFilter) ([]ExpenseTransactionDTO, int64, error)
	Create(ctx context.Context, req CreateExpenseRequest, actorUserID string) (*ExpenseTransactionDTO, error)
	GetByID(ctx context.Context, id string) (*ExpenseTransactionDTO, error)
	Revert(ctx context.Context, id string, req RevertExpenseRequest, actorUserID string) (*ExpenseTransactionDTO, error)
}
```

---

## 46.11 CurrentAccountService

```go
package currentaccounts

import "context"

type Service interface {
	GetSummary(ctx context.Context, collaboratorID string) (*CurrentAccountSummaryDTO, error)
	ListEntries(ctx context.Context, collaboratorID string, filter CurrentAccountEntryFilter) ([]CurrentAccountEntryDTO, int64, error)
	RevertEntry(ctx context.Context, entryID string, req RevertLedgerEntryRequest, actorUserID string) (*CurrentAccountEntryDTO, error)
	ZeroGold(ctx context.Context, collaboratorID string, req ZeroGoldRequest, actorUserID string) (*CurrentAccountEntryDTO, error)
	CloseJourney(ctx context.Context, collaboratorID string, req CloseJourneyRequest, actorUserID string) (*CloseJourneyPreviewDTO, error)
}
```

---

## 46.12 ReportService

```go
package reports

import "context"

type Service interface {
	Dashboard(ctx context.Context) (*DashboardDTO, error)
	CollaboratorBalances(ctx context.Context, filter ReportDateFilter) ([]CollaboratorBalanceReportRowDTO, error)
	JourneysEndingSoon(ctx context.Context, days int) ([]JourneysEndingSoonRowDTO, error)
	PendingProductionAccruals(ctx context.Context) ([]PendingProductionAccrualRowDTO, error)
	MercantileSales(ctx context.Context, filter ReportDateFilter) ([]MercantileSalesRowDTO, error)
}

type ReportDateFilter struct {
	FromDate string `query:"fromDate"`
	ToDate   string `query:"toDate"`
}
```

---

## 47. Repository Interfaces

Repositories are persistence-only. They should not enforce high-level business workflows.

Recommended package convention:

```text
/internal/<module>/repository.go
```

---

## 47.1 UserRepository

```go
package auth

import (
	"context"
	"enterpriseremotesystems/internal/db/models"
)

type UserRepository interface {
	FindByUsername(ctx context.Context, username string) (*models.User, error)
	FindByID(ctx context.Context, id string) (*models.User, error)
	UpdateLastLogin(ctx context.Context, userID string) error
	ListRoles(ctx context.Context, userID string) ([]models.Role, error)
}
```

---

## 47.2 PeopleRepository

```go
package people

import (
	"context"
	"enterpriseremotesystems/internal/db/models"
)

type Repository interface {
	List(ctx context.Context, filter PersonListFilter) ([]models.Person, int64, error)
	Create(ctx context.Context, person *models.Person) error
	FindByID(ctx context.Context, id string) (*models.Person, error)
	Update(ctx context.Context, person *models.Person) error
	ExistsByUniqueFields(ctx context.Context, name string, phone *string, email *string, cpf *string, pixKey *string, excludeID *string) (bool, error)
	ListJourneys(ctx context.Context, personID string) ([]models.CollaboratorJourney, error)
}
```

---

## 47.3 CollaboratorRepository

```go
package collaborators

import (
	"context"
	"enterpriseremotesystems/internal/db/models"
)

type Repository interface {
	List(ctx context.Context, filter CollaboratorListFilter) ([]models.CollaboratorJourney, int64, error)
	Create(ctx context.Context, collaborator *models.CollaboratorJourney) error
	FindByID(ctx context.Context, id string) (*models.CollaboratorJourney, error)
	Update(ctx context.Context, collaborator *models.CollaboratorJourney) error
	FindActiveByPersonID(ctx context.Context, personID string) (*models.CollaboratorJourney, error)
	FindMostRecentFinishedByPersonID(ctx context.Context, personID string) (*models.CollaboratorJourney, error)
	ListActive(ctx context.Context) ([]models.CollaboratorJourney, error)
}
```

---

## 47.4 ReferenceDataRepository

```go
package referencedata

import (
	"context"
	"enterpriseremotesystems/internal/db/models"
)

type Repository interface {
	ListTypes(ctx context.Context) ([]string, error)
	ListByType(ctx context.Context, typ string, includeInactive bool) ([]models.ReferenceData, error)
	Create(ctx context.Context, item *models.ReferenceData) error
	FindByID(ctx context.Context, id string) (*models.ReferenceData, error)
	FindByTypeAndCode(ctx context.Context, typ string, code string) (*models.ReferenceData, error)
	Update(ctx context.Context, item *models.ReferenceData) error
	ExistsByTypeAndCode(ctx context.Context, typ string, code string, excludeID *string) (bool, error)
}
```

---

## 47.5 WorkPeriodRepository

```go
package workperiods

import (
	"context"
	"enterpriseremotesystems/internal/db/models"
)

type Repository interface {
	List(ctx context.Context, filter WorkPeriodListFilter) ([]models.WorkPeriod, int64, error)
	Create(ctx context.Context, period *models.WorkPeriod) error
	FindByID(ctx context.Context, id string) (*models.WorkPeriod, error)
	FindByDateAndPeriod(ctx context.Context, workDate string, periodCode string) (*models.WorkPeriod, error)
	FindPrevious(ctx context.Context, workDate string, periodCode string) (*models.WorkPeriod, error)
	Update(ctx context.Context, period *models.WorkPeriod) error
}
```

---

## 47.6 PlanningRepository

```go
package planning

import (
	"context"
	"enterpriseremotesystems/internal/db/models"
)

type Repository interface {
	ListPlanItems(ctx context.Context, workPeriodID string) ([]models.WorkPlanItem, error)
	CreatePlanItems(ctx context.Context, items []models.WorkPlanItem) error
	FindPlanItemByID(ctx context.Context, id string) (*models.WorkPlanItem, error)
	UpdatePlanItem(ctx context.Context, item *models.WorkPlanItem) error
	DeleteDraftPlanItems(ctx context.Context, workPeriodID string) error
	CreateAccrualBatch(ctx context.Context, batch *models.EarningAccrualBatch, items []models.EarningAccrualItem, ledgerEntries []models.CurrentAccountEntry) error
	FindAccrualByWorkPeriodID(ctx context.Context, workPeriodID string) (*models.EarningAccrualBatch, []models.EarningAccrualItem, error)
}
```

---

## 47.7 MineProductionRepository

```go
package mineproduction

import (
	"context"
	"enterpriseremotesystems/internal/db/models"
)

type Repository interface {
	List(ctx context.Context, filter MineProductionListFilter) ([]models.MineWellProduction, int64, error)
	Create(ctx context.Context, production *models.MineWellProduction) error
	FindByID(ctx context.Context, id string) (*models.MineWellProduction, error)
	FindByWorkPeriodAndLocation(ctx context.Context, workPeriodID string, locationID string) (*models.MineWellProduction, error)
	Update(ctx context.Context, production *models.MineWellProduction) error
}
```

---

## 47.8 GoldPriceRepository

```go
package goldprices

import (
	"context"
	"enterpriseremotesystems/internal/db/models"
)

type Repository interface {
	List(ctx context.Context, filter GoldPriceListFilter) ([]models.GoldPrice, int64, error)
	Create(ctx context.Context, price *models.GoldPrice) error
	FindByID(ctx context.Context, id string) (*models.GoldPrice, error)
	FindByQuoteDate(ctx context.Context, quoteDate string) (*models.GoldPrice, error)
	FindLatest(ctx context.Context) (*models.GoldPrice, error)
	Update(ctx context.Context, price *models.GoldPrice) error
}
```

---

## 47.9 PriceListRepository

```go
package pricelist

import (
	"context"
	"enterpriseremotesystems/internal/db/models"
)

type Repository interface {
	List(ctx context.Context, filter PriceListFilter) ([]models.PriceListItem, int64, error)
	Create(ctx context.Context, item *models.PriceListItem) error
	FindByID(ctx context.Context, id string) (*models.PriceListItem, error)
	Update(ctx context.Context, item *models.PriceListItem) error
	ExistsByNameOrCode(ctx context.Context, name string, code *string, excludeID *string) (bool, error)
}
```

---

## 47.10 ExpenseRepository

```go
package expenses

import (
	"context"
	"enterpriseremotesystems/internal/db/models"
)

type Repository interface {
	List(ctx context.Context, filter ExpenseListFilter) ([]models.ExpenseTransaction, int64, error)
	CreateWithLedger(ctx context.Context, expense *models.ExpenseTransaction, items []models.ExpenseItem, ledgerEntries []models.CurrentAccountEntry) error
	FindByID(ctx context.Context, id string) (*models.ExpenseTransaction, []models.ExpenseItem, error)
	FindLedgerEntriesByExpenseID(ctx context.Context, expenseID string) ([]models.CurrentAccountEntry, error)
	RevertWithLedger(ctx context.Context, originalEntries []models.CurrentAccountEntry, reversalEntries []models.CurrentAccountEntry) error
}
```

---

## 47.11 CurrentAccountRepository

```go
package currentaccounts

import (
	"context"
	"enterpriseremotesystems/internal/db/models"
)

type BalanceRow struct {
	CurrencyCode string
	Credits      float64
	Debits       float64
	Balance      float64
}

type Repository interface {
	GetBalances(ctx context.Context, collaboratorID string) ([]BalanceRow, error)
	ListEntries(ctx context.Context, collaboratorID string, filter CurrentAccountEntryFilter) ([]models.CurrentAccountEntry, int64, error)
	FindEntryByID(ctx context.Context, entryID string) (*models.CurrentAccountEntry, error)
	CreateEntry(ctx context.Context, entry *models.CurrentAccountEntry) error
	CreateEntries(ctx context.Context, entries []models.CurrentAccountEntry) error
	HasReversal(ctx context.Context, entryID string) (bool, error)
	RevertEntry(ctx context.Context, original *models.CurrentAccountEntry, reversal *models.CurrentAccountEntry) error
	CloseJourneyWithLedger(ctx context.Context, collaborator *models.CollaboratorJourney, closeEntries []models.CurrentAccountEntry) error
}
```

---

## 47.12 AuditRepository

```go
package audit

import (
	"context"
	"enterpriseremotesystems/internal/db/models"
)

type Repository interface {
	Create(ctx context.Context, log *models.AuditLog) error
	ListByEntity(ctx context.Context, entityType string, entityID string) ([]models.AuditLog, error)
}
```

---

## 48. Handler Skeleton Pattern

Each handler should depend on a service interface, not a concrete implementation.

Example pattern:

```go
package people

import (
	"github.com/gofiber/fiber/v2"
	"enterpriseremotesystems/internal/shared/httpx"
)

type Handler struct {
	service Service
}

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) List(c *fiber.Ctx) error {
	var filter PersonListFilter
	if err := c.QueryParser(&filter); err != nil {
		return httpx.BadRequest(c, "invalid_query", "Invalid query parameters", nil)
	}

	items, total, err := h.service.List(c.Context(), filter)
	if err != nil {
		return httpx.HandleError(c, err)
	}

	return httpx.OKWithPage(c, items, filter.Page, filter.PageSize, total)
}

func (h *Handler) Create(c *fiber.Ctx) error {
	var req CreatePersonRequest
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid_body", "Invalid request body", nil)
	}

	actorUserID := httpx.ActorUserID(c)
	created, err := h.service.Create(c.Context(), req, actorUserID)
	if err != nil {
		return httpx.HandleError(c, err)
	}

	return httpx.Created(c, created)
}
```

---

## 49. Shared HTTP Helpers

Recommended package:

```text
/internal/shared/httpx
```

```go
package httpx

import (
	"github.com/gofiber/fiber/v2"
	"enterpriseremotesystems/internal/shared/dto"
)

func OK[T any](c *fiber.Ctx, data T) error {
	return c.Status(fiber.StatusOK).JSON(dto.APIResponse[T]{Data: data})
}

func Created[T any](c *fiber.Ctx, data T) error {
	return c.Status(fiber.StatusCreated).JSON(dto.APIResponse[T]{Data: data})
}

func OKWithPage[T any](c *fiber.Ctx, data T, page int, pageSize int, totalRows int64) error {
	totalPages := 0
	if pageSize > 0 {
		totalPages = int((totalRows + int64(pageSize) - 1) / int64(pageSize))
	}
	return c.Status(fiber.StatusOK).JSON(dto.APIResponse[T]{
		Data: data,
		Meta: &dto.Meta{
			Page: page,
			PageSize: pageSize,
			TotalRows: totalRows,
			TotalPages: totalPages,
		},
	})
}

func BadRequest(c *fiber.Ctx, code string, message string, fields map[string]string) error {
	return c.Status(fiber.StatusBadRequest).JSON(dto.APIResponse[any]{
		Error: &dto.APIError{Code: code, Message: message, Fields: fields},
	})
}

func ActorUserID(c *fiber.Ctx) string {
	v := c.Locals("userID")
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
```

---

## 50. Implementation Notes and Known Compile Adjustments

The above contracts are intentionally implementation-ready but still need normal Go package import cleanup when inserted into a real repo.

Important adjustments during coding:

1. Avoid cyclic imports between `people` and `collaborators` DTO packages.
   - Either move shared DTOs to `/internal/api/dto`, or keep module DTOs but avoid cross-package return types.
2. Prefer decimal types over `float64` for money in production code.
   - DTOs can expose numbers, but domain services should use decimal arithmetic.
3. Role authorization middleware should wrap routes by action.
   - Example: only ADMIN can close journeys or revert ledger entries.
4. Handlers should not know GORM models.
   - Handlers speak DTOs only.
5. Services may coordinate multiple repositories inside transactions.
   - Expenses, accruals, reversals, zero-out, and close are transaction-required workflows.

---

## 51. Production-Grade Repository Folder Tree

Recommended repository name:

```text
enterpriseremotesystems/
```

This is a full-stack monorepo containing:

- Go/Fiber backend
- React frontend
- SQLite/GORM persistence
- migrations
- tests
- Docker deployment
- operational scripts
- documentation

---

## 51.1 Top-Level Monorepo Layout

```text
enterpriseremotesystems/
├── README.md
├── Makefile
├── .gitignore
├── .editorconfig
├── .env.example
├── docker-compose.yml
├── docker-compose.dev.yml
├── Dockerfile
├── docs/
├── scripts/
├── deployments/
├── backend/
├── frontend/
└── data/
```

### Top-level responsibilities

```text
README.md                 Project overview and local setup
Makefile                  Common developer and deployment commands
.env.example              Example environment variables
Dockerfile                Production multi-stage build
Docker Compose files      Local/dev/prod orchestration
docs/                     Architecture and operational documentation
scripts/                  Developer and operational scripts
deployments/              Server, systemd, nginx, backup examples
backend/                  Fiber + GORM + SQLite API
frontend/                 React mobile-first SPA
data/                     Local mounted SQLite/backups directory, gitignored
```

---

## 51.2 Backend Folder Tree

```text
backend/
├── go.mod
├── go.sum
├── Makefile
├── .air.toml
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── app/
│   │   ├── app.go
│   │   ├── bootstrap.go
│   │   ├── config.go
│   │   ├── dependencies.go
│   │   └── shutdown.go
│   ├── db/
│   │   ├── db.go
│   │   ├── migrate.go
│   │   ├── transaction.go
│   │   ├── seeds.go
│   │   └── models/
│   │       ├── base.go
│   │       ├── user.go
│   │       ├── reference_data.go
│   │       ├── person.go
│   │       ├── collaborator_journey.go
│   │       ├── work_period.go
│   │       ├── work_plan_item.go
│   │       ├── mine_well_production.go
│   │       ├── gold_price.go
│   │       ├── price_list_item.go
│   │       ├── expense_transaction.go
│   │       ├── expense_item.go
│   │       ├── earning_accrual.go
│   │       ├── current_account_entry.go
│   │       ├── audit_log.go
│   │       └── system_setting.go
│   ├── http/
│   │   ├── middleware/
│   │   │   ├── auth.go
│   │   │   ├── cors.go
│   │   │   ├── logger.go
│   │   │   ├── recovery.go
│   │   │   └── roles.go
│   │   ├── routes/
│   │   │   ├── dependencies.go
│   │   │   ├── routes.go
│   │   │   ├── auth.go
│   │   │   ├── people.go
│   │   │   ├── collaborators.go
│   │   │   ├── reference_data.go
│   │   │   ├── work_periods.go
│   │   │   ├── planning.go
│   │   │   ├── mine_production.go
│   │   │   ├── gold_prices.go
│   │   │   ├── price_list.go
│   │   │   ├── expenses.go
│   │   │   ├── current_accounts.go
│   │   │   └── reports.go
│   │   └── server.go
│   ├── shared/
│   │   ├── dto/
│   │   │   ├── response.go
│   │   │   ├── pagination.go
│   │   │   └── filters.go
│   │   ├── errors/
│   │   │   ├── errors.go
│   │   │   └── codes.go
│   │   ├── httpx/
│   │   │   ├── responses.go
│   │   │   ├── errors.go
│   │   │   └── context.go
│   │   ├── ids/
│   │   │   └── ulid.go
│   │   ├── money/
│   │   │   └── decimal.go
│   │   ├── dates/
│   │   │   └── dates.go
│   │   ├── validation/
│   │   │   └── validator.go
│   │   └── logging/
│   │       └── logger.go
│   ├── auth/
│   │   ├── dto.go
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── service_impl.go
│   │   ├── repository.go
│   │   ├── repository_gorm.go
│   │   ├── password.go
│   │   └── jwt.go
│   ├── people/
│   │   ├── dto.go
│   │   ├── mapper.go
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── service_impl.go
│   │   ├── repository.go
│   │   └── repository_gorm.go
│   ├── collaborators/
│   │   ├── dto.go
│   │   ├── mapper.go
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── service_impl.go
│   │   ├── repository.go
│   │   ├── repository_gorm.go
│   │   ├── journey_rules.go
│   │   └── projection.go
│   ├── referencedata/
│   │   ├── dto.go
│   │   ├── mapper.go
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── service_impl.go
│   │   ├── repository.go
│   │   └── repository_gorm.go
│   ├── workperiods/
│   │   ├── dto.go
│   │   ├── mapper.go
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── service_impl.go
│   │   ├── repository.go
│   │   └── repository_gorm.go
│   ├── planning/
│   │   ├── dto.go
│   │   ├── mapper.go
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── service_impl.go
│   │   ├── repository.go
│   │   ├── repository_gorm.go
│   │   ├── seed_from_previous.go
│   │   ├── inform.go
│   │   └── accrual_orchestrator.go
│   ├── mineproduction/
│   │   ├── dto.go
│   │   ├── mapper.go
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── service_impl.go
│   │   ├── repository.go
│   │   └── repository_gorm.go
│   ├── goldprices/
│   │   ├── dto.go
│   │   ├── mapper.go
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── service_impl.go
│   │   ├── repository.go
│   │   └── repository_gorm.go
│   ├── pricelist/
│   │   ├── dto.go
│   │   ├── mapper.go
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── service_impl.go
│   │   ├── repository.go
│   │   └── repository_gorm.go
│   ├── expenses/
│   │   ├── dto.go
│   │   ├── mapper.go
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── service_impl.go
│   │   ├── repository.go
│   │   ├── repository_gorm.go
│   │   ├── expense_rules.go
│   │   └── posting.go
│   ├── earnings/
│   │   ├── calculator.go
│   │   ├── daily_wage_calculator.go
│   │   ├── salary_calculator.go
│   │   ├── commission_calculator.go
│   │   ├── sick_rules.go
│   │   ├── license_rules.go
│   │   └── accrual_service.go
│   ├── currentaccounts/
│   │   ├── dto.go
│   │   ├── mapper.go
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── service_impl.go
│   │   ├── repository.go
│   │   ├── repository_gorm.go
│   │   ├── balance.go
│   │   ├── reversal.go
│   │   ├── zero_gold.go
│   │   └── close_journey.go
│   ├── reports/
│   │   ├── dto.go
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── service_impl.go
│   │   ├── repository.go
│   │   └── repository_gorm.go
│   └── audit/
│       ├── service.go
│       ├── service_impl.go
│       ├── repository.go
│       └── repository_gorm.go
├── migrations/
│   ├── 000001_init_schema.up.sql
│   ├── 000001_init_schema.down.sql
│   ├── 000002_seed_reference_data.up.sql
│   ├── 000002_seed_reference_data.down.sql
│   ├── 000003_seed_roles_and_settings.up.sql
│   └── 000003_seed_roles_and_settings.down.sql
├── tests/
│   ├── integration/
│   │   ├── people_test.go
│   │   ├── collaborators_test.go
│   │   ├── planning_test.go
│   │   ├── expenses_test.go
│   │   └── current_accounts_test.go
│   ├── fixtures/
│   │   ├── reference_data.sql
│   │   ├── people.json
│   │   └── collaborators.json
│   └── testdb/
│       └── testdb.go
└── tmp/
```

---

## 51.3 Backend Layer Responsibilities

### `cmd/server/main.go`

Application entry point only:

- load config
- bootstrap app
- start server
- graceful shutdown

### `internal/app`

Owns startup wiring:

- config loading
- dependency construction
- service/repository composition
- logger setup
- DB setup
- route setup

### `internal/db`

Owns persistence plumbing:

- GORM connection
- SQLite options
- migrations
- transactions
- model registration

### `internal/http/routes`

Owns route mapping only:

- route groups
- middleware attachment
- handler method wiring

### `internal/http/middleware`

Owns cross-cutting HTTP concerns:

- auth
- role checks
- CORS
- logging
- panic recovery

### Feature modules

Each module follows this shape:

```text
<module>/
├── dto.go
├── mapper.go
├── handler.go
├── service.go
├── service_impl.go
├── repository.go
└── repository_gorm.go
```

### Business-heavy modules

Some modules get extra files:

```text
earnings/
currentaccounts/
expenses/
planning/
collaborators/
```

because they contain real business rules, not just CRUD.

---

## 51.4 Frontend Folder Tree

```text
frontend/
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html
├── .env.example
├── public/
│   ├── favicon.svg
│   └── app-icon.svg
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── app/
│   │   ├── router.tsx
│   │   ├── providers.tsx
│   │   ├── queryClient.ts
│   │   ├── authStore.ts
│   │   └── config.ts
│   ├── api/
│   │   ├── client.ts
│   │   ├── auth.api.ts
│   │   ├── people.api.ts
│   │   ├── collaborators.api.ts
│   │   ├── referenceData.api.ts
│   │   ├── workPeriods.api.ts
│   │   ├── planning.api.ts
│   │   ├── mineProduction.api.ts
│   │   ├── goldPrices.api.ts
│   │   ├── priceList.api.ts
│   │   ├── expenses.api.ts
│   │   ├── currentAccounts.api.ts
│   │   └── reports.api.ts
│   ├── types/
│   │   ├── api.ts
│   │   ├── auth.ts
│   │   ├── people.ts
│   │   ├── collaborators.ts
│   │   ├── referenceData.ts
│   │   ├── planning.ts
│   │   ├── production.ts
│   │   ├── expenses.ts
│   │   ├── currentAccounts.ts
│   │   └── reports.ts
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx
│   │   │   ├── TopBar.tsx
│   │   │   ├── BottomNav.tsx
│   │   │   ├── SideNav.tsx
│   │   │   └── PageHeader.tsx
│   │   ├── forms/
│   │   │   ├── TextField.tsx
│   │   │   ├── SelectField.tsx
│   │   │   ├── DateField.tsx
│   │   │   ├── MoneyField.tsx
│   │   │   ├── GoldField.tsx
│   │   │   └── FormActions.tsx
│   │   ├── cards/
│   │   │   ├── SummaryCard.tsx
│   │   │   ├── BalanceCard.tsx
│   │   │   ├── CollaboratorCard.tsx
│   │   │   └── LedgerEntryCard.tsx
│   │   ├── tables/
│   │   │   ├── DataTable.tsx
│   │   │   ├── MobileListTable.tsx
│   │   │   └── Pagination.tsx
│   │   ├── feedback/
│   │   │   ├── Loading.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── ErrorAlert.tsx
│   │   │   └── ConfirmDialog.tsx
│   │   └── guards/
│   │       ├── RequireAuth.tsx
│   │       └── RequireRole.tsx
│   ├── features/
│   │   ├── auth/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── useAuth.ts
│   │   │   └── authSchemas.ts
│   │   ├── dashboard/
│   │   │   ├── DashboardPage.tsx
│   │   │   └── DashboardCards.tsx
│   │   ├── people/
│   │   │   ├── PeopleListPage.tsx
│   │   │   ├── PersonDetailPage.tsx
│   │   │   ├── PersonForm.tsx
│   │   │   ├── usePeople.ts
│   │   │   └── peopleSchemas.ts
│   │   ├── collaborators/
│   │   │   ├── CollaboratorListPage.tsx
│   │   │   ├── CollaboratorDetailPage.tsx
│   │   │   ├── CollaboratorForm.tsx
│   │   │   ├── ExtendJourneyDialog.tsx
│   │   │   ├── FinishJourneyDialog.tsx
│   │   │   ├── ProjectionPanel.tsx
│   │   │   ├── useCollaborators.ts
│   │   │   └── collaboratorSchemas.ts
│   │   ├── planning/
│   │   │   ├── WorkPeriodsPage.tsx
│   │   │   ├── WorkPeriodDetailPage.tsx
│   │   │   ├── PlanTab.tsx
│   │   │   ├── InformTab.tsx
│   │   │   ├── AccrualTab.tsx
│   │   │   ├── PlanItemEditor.tsx
│   │   │   ├── usePlanning.ts
│   │   │   └── planningSchemas.ts
│   │   ├── production/
│   │   │   ├── MineProductionPage.tsx
│   │   │   ├── MineProductionForm.tsx
│   │   │   └── useMineProduction.ts
│   │   ├── gold-prices/
│   │   │   ├── GoldPricesPage.tsx
│   │   │   ├── GoldPriceForm.tsx
│   │   │   └── useGoldPrices.ts
│   │   ├── price-list/
│   │   │   ├── PriceListPage.tsx
│   │   │   ├── PriceListItemForm.tsx
│   │   │   ├── PricePreview.tsx
│   │   │   └── usePriceList.ts
│   │   ├── expenses/
│   │   │   ├── ExpensesPage.tsx
│   │   │   ├── ExpenseEntryPage.tsx
│   │   │   ├── ExpenseForm.tsx
│   │   │   ├── ExpenseSummaryPanel.tsx
│   │   │   ├── ExpenseLineItems.tsx
│   │   │   ├── RevertExpenseDialog.tsx
│   │   │   ├── useExpenses.ts
│   │   │   └── expenseSchemas.ts
│   │   ├── current-accounts/
│   │   │   ├── CurrentAccountPage.tsx
│   │   │   ├── CurrentAccountSummary.tsx
│   │   │   ├── LedgerEntriesPage.tsx
│   │   │   ├── LedgerEntryList.tsx
│   │   │   ├── RevertLedgerEntryDialog.tsx
│   │   │   ├── ZeroGoldDialog.tsx
│   │   │   ├── CloseJourneyDialog.tsx
│   │   │   └── useCurrentAccounts.ts
│   │   ├── reports/
│   │   │   ├── ReportsPage.tsx
│   │   │   ├── CollaboratorBalancesReport.tsx
│   │   │   ├── JourneysEndingSoonReport.tsx
│   │   │   ├── PendingAccrualsReport.tsx
│   │   │   ├── MercantileSalesReport.tsx
│   │   │   └── useReports.ts
│   │   └── settings/
│   │       ├── SettingsPage.tsx
│   │       ├── ReferenceDataPage.tsx
│   │       ├── ReferenceDataForm.tsx
│   │       └── useReferenceData.ts
│   ├── hooks/
│   │   ├── useDebounce.ts
│   │   ├── useMediaQuery.ts
│   │   └── useToast.ts
│   ├── utils/
│   │   ├── dates.ts
│   │   ├── formatters.ts
│   │   ├── money.ts
│   │   ├── gold.ts
│   │   └── errors.ts
│   ├── styles/
│   │   ├── index.css
│   │   └── tailwind.css
│   └── test/
│       ├── setup.ts
│       └── test-utils.tsx
├── tests/
│   ├── e2e/
│   │   ├── auth.spec.ts
│   │   ├── people.spec.ts
│   │   ├── collaborators.spec.ts
│   │   ├── expenses.spec.ts
│   │   └── current-accounts.spec.ts
│   └── fixtures/
└── dist/
```

---

## 51.5 Frontend Layer Responsibilities

### `src/app`

Application composition:

- router
- global providers
- query client
- auth store
- runtime config

### `src/api`

Typed API clients. One file per backend domain.

### `src/types`

Frontend TypeScript equivalents of backend DTOs.

### `src/components`

Reusable UI building blocks:

- layout
- forms
- cards
- tables
- feedback components
- guards

### `src/features`

Business screens and feature-specific hooks/forms.

Each feature owns:

- pages
- forms
- feature hooks
- validation schemas
- feature-specific panels/dialogs

### `src/utils`

Formatting and pure helper functions.

---

## 51.6 Documentation Folder

```text
docs/
├── architecture/
│   ├── overview.md
│   ├── domain-model.md
│   ├── erd.md
│   ├── ledger-design.md
│   ├── planning-workflow.md
│   ├── earnings-engine.md
│   └── expense-engine.md
├── api/
│   ├── route-map.md
│   ├── dto-contracts.md
│   └── errors.md
├── deployment/
│   ├── local-development.md
│   ├── production-linux.md
│   ├── docker.md
│   ├── backups.md
│   └── restore.md
├── operations/
│   ├── daily-use.md
│   ├── closing-journey.md
│   ├── reversing-transactions.md
│   └── gold-price-policy.md
└── decisions/
    ├── 0001-modular-monolith.md
    ├── 0002-immutable-ledger.md
    ├── 0003-sqlite-first.md
    └── 0004-dual-currency-accounting.md
```

---

## 51.7 Scripts Folder

```text
scripts/
├── dev.sh
├── build.sh
├── test.sh
├── lint.sh
├── migrate-up.sh
├── migrate-down.sh
├── seed-dev.sh
├── backup-db.sh
├── restore-db.sh
├── create-admin-user.sh
└── release.sh
```

### Script responsibilities

```text
dev.sh                 Start backend and frontend locally
build.sh               Build backend and frontend
test.sh                Run all backend/frontend tests
lint.sh                Run Go and TypeScript linters
migrate-up.sh          Apply DB migrations
migrate-down.sh        Roll back DB migrations
seed-dev.sh            Load development seed data
backup-db.sh           Snapshot SQLite database
restore-db.sh          Restore SQLite database from backup
create-admin-user.sh   Bootstrap first admin user
release.sh             Build production artifact/container
```

---

## 51.8 Deployment Folder

```text
deployments/
├── nginx/
│   └── enterpriseremotesystems.conf
├── systemd/
│   └── enterpriseremotesystems.service
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── Dockerfile.all-in-one
├── backup/
│   ├── cron.example
│   └── backup-policy.md
└── env/
    ├── production.env.example
    └── staging.env.example
```

---

## 51.9 Data Folder

```text
data/
├── app.db
├── app.db-shm
├── app.db-wal
├── backups/
│   ├── .gitkeep
│   └── YYYY-MM-DD-HHMM-app.db.gz
└── exports/
    ├── .gitkeep
    └── reports/
```

Important:

```text
data/*.db
data/*.db-shm
data/*.db-wal
data/backups/*.gz
data/exports/**
```

should be gitignored.

---

## 51.10 Testing Layout

### Backend tests

```text
backend/tests/integration/
backend/internal/<module>/*_test.go
```

Use module-level tests for business logic:

```text
backend/internal/earnings/commission_calculator_test.go
backend/internal/earnings/sick_rules_test.go
backend/internal/earnings/license_rules_test.go
backend/internal/currentaccounts/reversal_test.go
backend/internal/currentaccounts/zero_gold_test.go
backend/internal/currentaccounts/close_journey_test.go
backend/internal/expenses/expense_rules_test.go
backend/internal/collaborators/journey_rules_test.go
```

### Frontend tests

```text
frontend/src/features/<feature>/*.test.tsx
frontend/tests/e2e/*.spec.ts
```

---

## 51.11 Production Build Strategy

Recommended production deployment:

1. Build React frontend into static assets.
2. Embed or copy frontend `dist` into Go server image.
3. Fiber serves API and static frontend.
4. SQLite database is stored in mounted persistent volume.
5. Nightly backup job copies SQLite database to backup folder.

Production runtime shape:

```text
/app/enterpriseremotesystems-server
/app/public/
/data/app.db
/data/backups/
```

---

## 51.12 Recommended `.gitignore`

```gitignore
# OS/editor
.DS_Store
.idea/
.vscode/
*.swp

# env
.env
.env.*
!.env.example

# Go
/backend/bin/
/backend/tmp/
/backend/coverage.out
/backend/*.test

# Node
/frontend/node_modules/
/frontend/dist/
/frontend/coverage/

# SQLite/data
/data/*.db
/data/*.db-shm
/data/*.db-wal
/data/backups/*.gz
/data/exports/**

# logs
*.log
logs/

# Docker
*.pid
```

---

## 51.13 Recommended Root Makefile Commands

```makefile
.PHONY: dev build test lint migrate-up migrate-down seed backup restore

dev:
	./scripts/dev.sh

build:
	./scripts/build.sh

test:
	./scripts/test.sh

lint:
	./scripts/lint.sh

migrate-up:
	./scripts/migrate-up.sh

migrate-down:
	./scripts/migrate-down.sh

seed:
	./scripts/seed-dev.sh

backup:
	./scripts/backup-db.sh

restore:
	./scripts/restore-db.sh
```

---

## 51.14 Why this structure is production-grade

This structure supports:

- clean feature boundaries
- testable services
- DTO isolation from GORM models
- route registration independent from handlers
- migrations independent from AutoMigrate
- business rules separated from persistence
- future desktop/mobile frontend growth
- Docker-based production deployment
- SQLite backup/restore operations
- auditability of financial workflows

---

## 52. Backend Skeleton — Step 1

This section starts the actual backend skeleton files.

Target backend path:

```text
backend/
```

Initial files created in this step:

```text
backend/go.mod
backend/cmd/server/main.go
backend/internal/app/config.go
backend/internal/app/bootstrap.go
backend/internal/db/db.go
backend/internal/http/server.go
backend/internal/http/routes/dependencies.go
backend/internal/http/routes/routes.go
backend/internal/health/handler.go
backend/internal/http/routes/health.go
```

---

## 52.1 `backend/go.mod`

```go
module enterpriseremotesystems/backend

// Use the latest stable Go version available in your environment.
// If your local toolchain is older, change this to your installed version.
go 1.23

require (
	github.com/gofiber/fiber/v2 v2.52.6
	github.com/glebarez/sqlite v1.11.0
	github.com/joho/godotenv v1.5.1
	gorm.io/gorm v1.25.12
)
```

Notes:

- `github.com/glebarez/sqlite` is a pure-Go SQLite driver, easier to build/deploy than CGO SQLite.
- You can switch later to `gorm.io/driver/sqlite` if you prefer CGO-based SQLite.

---

## 52.2 `backend/cmd/server/main.go`

```go
package main

import (
	"log"

	"enterpriseremotesystems/backend/internal/app"
)

func main() {
	cfg, err := app.LoadConfig()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	server, cleanup, err := app.Bootstrap(cfg)
	if err != nil {
		log.Fatalf("failed to bootstrap app: %v", err)
	}
	defer cleanup()

	if err := server.Listen(cfg.HTTPAddr); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}
```

Responsibility:

- only starts the application
- no route definitions
- no business logic
- no database logic

---

## 52.3 `backend/internal/app/config.go`

```go
package app

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Env       string
	HTTPAddr  string
	DBPath    string
	JWTSecret string
}

func LoadConfig() (Config, error) {
	_ = godotenv.Load()

	cfg := Config{
		Env:       getEnv("APP_ENV", "development"),
		HTTPAddr:  getEnv("HTTP_ADDR", ":8080"),
		DBPath:    getEnv("DB_PATH", "./data/app.db"),
		JWTSecret: getEnv("JWT_SECRET", "dev-only-change-me"),
	}

	if cfg.JWTSecret == "" {
		return Config{}, fmt.Errorf("JWT_SECRET is required")
	}

	return cfg, nil
}

func getEnv(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
```

Recommended `.env`:

```env
APP_ENV=development
HTTP_ADDR=:8080
DB_PATH=./data/app.db
JWT_SECRET=replace-this-in-production
```

---

## 52.4 `backend/internal/app/bootstrap.go`

```go
package app

import (
	"log"

	"github.com/gofiber/fiber/v2"

	"enterpriseremotesystems/backend/internal/db"
	httpserver "enterpriseremotesystems/backend/internal/http"
	"enterpriseremotesystems/backend/internal/http/routes"
)

func Bootstrap(cfg Config) (*fiber.App, func(), error) {
	database, err := db.Open(cfg.DBPath)
	if err != nil {
		return nil, nil, err
	}

	deps := routes.Dependencies{
		DB: database,
	}

	server := httpserver.NewServer(cfg, deps)

	cleanup := func() {
		sqlDB, err := database.DB()
		if err != nil {
			log.Printf("failed to access database handle during cleanup: %v", err)
			return
		}
		if err := sqlDB.Close(); err != nil {
			log.Printf("failed to close database: %v", err)
		}
	}

	return server, cleanup, nil
}
```

---

## 52.5 `backend/internal/db/db.go`

```go
package db

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Open(path string) (*gorm.DB, error) {
	if err := ensureDir(path); err != nil {
		return nil, err
	}

	dsn := fmt.Sprintf("%s?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)", path)

	database, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("open sqlite database: %w", err)
	}

	return database, nil
}

func ensureDir(path string) error {
	dir := filepath.Dir(path)
	if dir == "." || dir == "" {
		return nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create database directory %s: %w", dir, err)
	}
	return nil
}
```

Notes:

- `foreign_keys(1)` enables foreign-key enforcement.
- `journal_mode(WAL)` improves SQLite concurrency.
- `busy_timeout(5000)` helps avoid immediate lock failures.

---

## 52.6 `backend/internal/http/server.go`

```go
package http

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"enterpriseremotesystems/backend/internal/app"
	"enterpriseremotesystems/backend/internal/http/routes"
)

func NewServer(cfg app.Config, deps routes.Dependencies) *fiber.App {
	server := fiber.New(fiber.Config{
		AppName:      "Enterprise Remote Systems API",
		ServerHeader: "enterpriseremotesystems",
	})

	server.Use(recover.New())
	server.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
	}))

	routes.Register(server, deps)

	return server
}
```

Production note:

- later, replace `AllowOrigins: "*"` with an environment-driven allowed origin list.

---

## 52.7 `backend/internal/http/routes/dependencies.go`

```go
package routes

import "gorm.io/gorm"

type Dependencies struct {
	DB *gorm.DB
}
```

This starts simple. As modules are implemented, this grows into:

```go
type Dependencies struct {
	DB *gorm.DB

	AuthHandler            *auth.Handler
	PeopleHandler          *people.Handler
	CollaboratorHandler    *collaborators.Handler
	ReferenceDataHandler   *referencedata.Handler
	WorkPeriodHandler      *workperiods.Handler
	PlanningHandler        *planning.Handler
	MineProductionHandler  *mineproduction.Handler
	GoldPriceHandler       *goldprices.Handler
	PriceListHandler       *pricelist.Handler
	ExpenseHandler         *expenses.Handler
	CurrentAccountHandler  *currentaccounts.Handler
	ReportHandler          *reports.Handler

	AuthMiddleware fiber.Handler
}
```

---

## 52.8 `backend/internal/http/routes/routes.go`

```go
package routes

import "github.com/gofiber/fiber/v2"

func Register(server *fiber.App, deps Dependencies) {
	RegisterHealthRoutes(server)

	api := server.Group("/api")
	v1 := api.Group("/v1")

	_ = v1
	_ = deps

	// Future route registration:
	// RegisterAuthRoutes(v1, deps)
	// RegisterPeopleRoutes(v1, deps)
	// RegisterCollaboratorRoutes(v1, deps)
	// RegisterReferenceDataRoutes(v1, deps)
	// RegisterWorkPeriodRoutes(v1, deps)
	// RegisterPlanningRoutes(v1, deps)
	// RegisterMineProductionRoutes(v1, deps)
	// RegisterGoldPriceRoutes(v1, deps)
	// RegisterPriceListRoutes(v1, deps)
	// RegisterExpenseRoutes(v1, deps)
	// RegisterCurrentAccountRoutes(v1, deps)
	// RegisterReportRoutes(v1, deps)
}
```

---

## 52.9 `backend/internal/health/handler.go`

```go
package health

import (
	"time"

	"github.com/gofiber/fiber/v2"
)

type Handler struct{}

func NewHandler() *Handler {
	return &Handler{}
}

type Response struct {
	Status    string `json:"status"`
	Timestamp string `json:"timestamp"`
}

func (h *Handler) Healthz(c *fiber.Ctx) error {
	return c.Status(fiber.StatusOK).JSON(Response{
		Status:    "ok",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}
```

---

## 52.10 `backend/internal/http/routes/health.go`

```go
package routes

import (
	"github.com/gofiber/fiber/v2"

	"enterpriseremotesystems/backend/internal/health"
)

func RegisterHealthRoutes(server *fiber.App) {
	h := health.NewHandler()
	server.Get("/healthz", h.Healthz)
}
```

---

## 52.11 Smoke Test

From the repository root:

```bash
cd backend
go mod tidy
go run ./cmd/server
```

In another terminal:

```bash
curl http://localhost:8080/healthz
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2026-04-24T00:00:00Z"
}
```

The timestamp will be the current UTC time.

---

## 52.12 Next Implementation Step

The next concrete step is to add:

1. shared API response helpers
2. shared error package
3. ULID generator
4. first GORM model files
5. migration runner
6. People module shell with list/create placeholders

