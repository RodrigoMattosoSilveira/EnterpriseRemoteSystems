# Resettable Test Data

ERS has resettable test-data mechanisms for Local and disposable Development data. Test remains resettable when an operator explicitly prepares a release rehearsal or test dataset, but ordinary Test deployments preserve the existing database and migrate it in place.

Do **not** use reset operations for Production. Production data is preserved and migrated in place.

## Local reset

From the project root:

```bash
make testdata-local-reset
```

This deletes `backend/data/app.db`, applies all backend migrations, and loads every SQL dataset under:

```text
backend/testdata/datasets/
```

## Development server reset

Run this on the server from the deployed repository checkout:

```bash
cd /opt/EnterpriseRemoteSystems/development
ENV=development make testdata-server-reset
```

## Test server reset

An explicit Test-data reset remains available for targeted test preparation:

```bash
cd /opt/EnterpriseRemoteSystems/test
ENV=test make testdata-server-reset
```

It is **not** part of ordinary Test deployment. Normal Test deployment preserves the database and migrates it in place. Release migration rehearsals use the separately validated baseline/restore workflow documented in `docs/05 - Deployment/Database Promotion Strategy.md`.

## Selecting one dataset

By default, all datasets are loaded. To load one named dataset:

```bash
DATASET=settlement_actions make testdata-local-reset
```

or:

```bash
ENV=development DATASET=settlement_actions make testdata-server-reset
```

## Bite 20B manual test data

The `settlement_actions` dataset creates three active collaborator journeys:

| Purpose | Collaborator ID | Nickname | Starting balance |
|---|---|---|---|
| Zero Gold | `ers-testdata-collab-zero-gold` | Zelia Gold | 8.500 grams of gold |
| Partial Payout | `ers-testdata-collab-partial-payout` | Paulo Payout | BRL 1250.00 and 2.750 grams of gold |
| Close Journey | `ers-testdata-collab-close-journey` | Clara Close | BRL 600.00 and 1.250 grams of gold |

The dataset also creates these test authorization actors:

| Actor | Purpose |
|---|---|
| `tenant-admin@test.ers` | Tenant admin actor with wildcard tenant permissions |
| `expense-operator@test.ers` | Expense operator actor |
| `second-approver@test.ers` | Named second approver for tests that enable second-person approval |

The base dataset disables the second-person approval setting so Bite 20B can focus on reason-code and reason-text validation. Bite 20D or later can enable the policy during its own tests.

## Bite 20B smoke test

1. Reset the target database using one of the commands above.
2. Start the backend and frontend.
3. In the Authz helper, use:

```text
X-Actor-ID: tenant-admin@test.ers
X-Tenant-ID: default
```

For sensitive operations, use a fresh reauthentication timestamp:

```text
X-Reauthenticated-At: <current UTC timestamp>
X-Reauthentication-Method: password
```

4. Open `ers-testdata-collab-zero-gold` and try **Zero Gold**.
5. Confirm the dialog requires both reason code and reason text.
6. Submit with:

```text
Reason code: GOLD_ZEROING_CORRECTION
Reason text: Bite 20B smoke test for Zero Gold reason enforcement.
```

7. Open `ers-testdata-collab-partial-payout` and try **Partial Payout**.
8. Submit with:

```text
Reason code: PAYOUT_CORRECTION
Reason text: Bite 20B smoke test for Partial Payout reason enforcement.
```

9. Open `ers-testdata-collab-close-journey` and try **Close Journey**.
10. Submit with:

```text
Reason code: JOURNEY_SETTLEMENT_ADJUSTMENT
Reason text: Bite 20B smoke test for Close Journey reason enforcement.
```

Each successful operation will consume the corresponding starting balance or close the journey. Reset the database again when you need the same clean starting state.

## Growing the dataset

As the app grows, add a new SQL file under:

```text
backend/testdata/datasets/
```

Use stable IDs with the `ers-testdata-` prefix. Keep datasets focused by workflow, for example:

```text
receipt_lifecycle.sql
gold_to_brl_conversion.sql
pix_remittance.sql
journey_days_remaining.sql
```

Prefer positive setup data over direct insertion of final workflow results. The purpose of this data is to exercise the app workflows, not bypass them.
