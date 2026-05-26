# Import People into an Environment

This runbook explains how to import People records from a CSV file into an Enterprise Remote Systems environment.

The importer is intended for controlled bulk-loading of People records without manually typing each person through the UI.

## Scope

This runbook covers:

- Preparing a People CSV file
- Running a local dry run
- Running a local import
- Copying a CSV file to a Hetzner environment
- Running an environment dry run
- Running an environment import
- Verifying the import
- Cleaning up sensitive CSV files after import

## Safety rules

People CSV files contain sensitive personal data, including:

- CPF
- RG
- Cellular number
- Email
- PIX key, when provided

Do **not** commit real People CSV files to Git.

Only commit the example template:

```text
backend/imports/people.example.csv
```

Real CSV files should remain private and are ignored by Git:

```gitignore
backend/imports/*.csv
!backend/imports/people.example.csv
```

## Import behavior

The importer is designed to be production-safe.

It supports:

- Dry-run mode
- Row-numbered validation errors
- Duplicate detection
- Existing backend validation rules
- All-or-nothing import behavior

If any row is invalid, the import fails and no rows are inserted.

The importer validates:

- Required fields
- CPF format
- RG format
- Brazilian cellular format
- Email format
- Active `statusId`
- Duplicate CPF
- Duplicate RG
- Duplicate cellular
- Duplicate email
- Duplicate PIX key, when provided

## CSV format

The CSV must include a header row.

Required columns:

```csv
firstName,lastName,nickname,cpf,rg,cellular,email,statusId,pixKey
```

Required fields:

```text
firstName
lastName
cpf
rg
cellular
email
statusId
```

Optional fields:

```text
nickname
pixKey
```

Example:

```csv
firstName,lastName,nickname,cpf,rg,cellular,email,statusId,pixKey
Joao,Silva,Joao,39053344705,RG-100001,11998765432,joao@example.com,ref-person-status-active,
Maria,Souza,Maria,93541134780,RG-100002,21998765432,maria@example.com,ref-person-status-active,maria-pix@example.com
```

## Field rules

### CPF

Use digits only.

Example:

```text
39053344705
```

### RG

RG must match the backend validation rule:

```text
^[A-Za-z0-9.\-]{5,20}$
```

Valid examples:

```text
RG-100001
123456789
12.345.678-9
AB123456
```

Invalid examples:

```text
12
RG 100001
RG_100001
123456789012345678901
```

### Cellular

Brazilian cellular numbers must match the backend validation rule:

```text
^\+?55?[1-9]{2}9[0-9]{8}$|^[1-9]{2}9[0-9]{8}$
```

Valid examples:

```text
11998765432
21987654321
5511998765432
+5511998765432
```

Invalid examples:

```text
1133334444
1198765432
0011998765432
119987654321
```

### Status ID

For active People records, use:

```text
ref-person-status-active
```

The status must already exist in `reference_data`.

## Local dry run

From the repository root:

```bash
make import-people-dry-run file=backend/imports/people.example.csv
```

Expected successful output:

```text
People CSV dry-run report
Rows read:      2
Rows validated: 2
Rows inserted:  0
Errors:         0
```

A dry run does not insert records.

## Local import

After a successful dry run:

```bash
make import-people file=backend/imports/people.example.csv
```

Expected successful output:

```text
People CSV import report
Rows read:      2
Rows validated: 2
Rows inserted:  2
Errors:         0
```

## Local duplicate check

If you run the same import again, it should fail with duplicate errors.

Example:

```text
People CSV dry-run report
Rows read:      2
Rows validated: 1
Rows inserted:  0
Errors:         2
  row 2, cellular: Cellular already exists
  row 2, cpf: CPF already exists
```

This is expected and confirms that the importer protects against duplicate data.

## Preparing a real environment CSV

Create the real import CSV outside the repository, for example:

```text
~/secure-imports/people-production.csv
```

Before copying it to the server, validate that:

- Every row has a CPF
- Every row has an RG
- Every row has a cellular number
- Every row has an email
- Every row has `statusId`
- No CPF appears more than once
- No RG appears more than once
- No cellular number appears more than once
- No email appears more than once
- No PIX key appears more than once, unless blank

Do not commit this file.

## Environment dry run

Copy the CSV file to the server.

Replace the server/user values as needed:

```bash
scp ~/secure-imports/people-production.csv rodrigo@<server-ip>:/tmp/people-production.csv
```

SSH into the server:

```bash
ssh rodrigo@<server-ip>
```

Find the backend container:

```bash
docker ps
```

Copy the CSV into the backend container:

```bash
docker cp /tmp/people-production.csv <backend-container-name>:/tmp/people-production.csv
```

Run the dry run:

```bash
docker exec -it <backend-container-name> /app/import-people \
  -db /app/data/app.db \
  -file /tmp/people-production.csv \
  -dry-run
```

Do not proceed if the dry run reports errors.

## Environment import

After a successful dry run, run the real import:

```bash
docker exec -it <backend-container-name> /app/import-people \
  -db /app/data/app.db \
  -file /tmp/people-production.csv
```

Expected successful output:

```text
People CSV import report
Rows read:      <number>
Rows validated: <number>
Rows inserted:  <number>
Errors:         0
```

The number of rows read, validated, and inserted should match the number of data rows in the CSV.

## Verify the import

Use the environment UI first.

Production:

```text
https://app.enterpriseremotesystems.com/people
```

Dev:

```text
https://dev.enterpriseremotesystems.com/people
```

Test:

```text
https://tst.enterpriseremotesystems.com/people
```

Confirm that the imported People records appear.

You can also check the API.

Production:

```bash
curl -i https://app.enterpriseremotesystems.com/api/v1/people/
```

Dev:

```bash
curl -i https://dev.enterpriseremotesystems.com/api/v1/people/
```

Test:

```bash
curl -i https://tst.enterpriseremotesystems.com/api/v1/people/
```

## Cleanup

After the import is verified, remove the CSV from the server:

```bash
rm -f /tmp/people-production.csv
```

Remove the CSV from the backend container:

```bash
docker exec -it <backend-container-name> rm -f /tmp/people-production.csv
```

Also remove or securely archive the local CSV according to your data-handling policy.

## Troubleshooting

### Error: CPF already exists

The CSV contains a CPF that already exists in the database.

Fix the CSV or confirm that the person was already imported.

### Error: RG already exists

The CSV contains an RG that already exists in the database.

Fix the CSV or confirm that the person was already imported.

### Error: Cellular already exists

The CSV contains a cellular number that already exists in the database.

Fix the CSV or confirm that the person was already imported.

### Error: Email already exists

The CSV contains an email that already exists in the database.

Fix the CSV or confirm that the person was already imported.

### Error: PIX key already exists

The CSV contains a PIX key that already exists in the database.

Blank PIX keys are allowed. Duplicate non-blank PIX keys are not allowed.

### Error: Status must be an active person status

The `statusId` value is invalid or inactive.

For normal active People records, use:

```text
ref-person-status-active
```

### Error: Cellular must be a valid Brazilian mobile number

Use a valid Brazilian cellular value, for example:

```text
11998765432
5511998765432
+5511998765432
```

Do not use spaces, parentheses, or hyphens in the CSV unless the importer is later changed to normalize formatted cellular input.

### Error: RG is invalid

Use only letters, digits, dots, and hyphens.

The RG value must be between 5 and 20 characters.

Valid examples:

```text
RG-100001
12.345.678-9
AB123456
```

## Recommended production checklist

Before running the real production import:

- [ ] Confirm the CSV file is not committed to Git
- [ ] Confirm the CSV has the correct header row
- [ ] Confirm all required fields are present
- [ ] Confirm CPF values are valid and unique within the CSV
- [ ] Confirm RG values are valid and unique within the CSV
- [ ] Confirm cellular values are valid and unique within the CSV
- [ ] Confirm email values are valid and unique within the CSV
- [ ] Confirm PIX keys are blank or unique within the CSV
- [ ] Run a local dry run against a copy or staging database
- [ ] Copy the CSV to the target server
- [ ] Copy the CSV into the backend container
- [ ] Run environment dry run
- [ ] Confirm `Errors: 0`
- [ ] Run environment import
- [ ] Verify records in the UI
- [ ] Verify records through the API if needed
- [ ] Delete the CSV from `/tmp`
- [ ] Delete the CSV from the backend container

# Testing it locally
```bash
cd /Users/rodrigosilveira/projects/EnterpriseRemoteSystems
```
rm -f backend/data/app.db
make local-db-init

make import-people-dry-run file=backend/imports/people.example.csv
make import-people file=backend/imports/people.example.csv

# Environemnt testing
For each environment, use the same safe pattern:

## 1. Copy CSV to server
```bash
scp people-production.csv rodrigo@<server-ip>:/tmp/people-production.csv
```

## 2. Copy CSV into backend container
```bash
docker cp /tmp/people-production.csv <backend-container-name>:/tmp/people-production.csv
```

## 3. Dry run first
```bash
docker exec -it <backend-container-name> /app/import-people \
  -db /app/data/app.db \
  -file /tmp/people-production.csv \
  -dry-run
```

## 4. Real import only if Errors: 0
```bash
docker exec -it <backend-container-name> /app/import-people \
  -db /app/data/app.db \
  -file /tmp/people-production.csv
```

## 5. Verify
```bash
docker exec -it <backend-container-name> sqlite3 /app/data/app.db \
  "select count(*) from people;"
```

## 6. Cleanup
```bash
rm -f /tmp/people-production.csv
docker exec -it <backend-container-name> rm -f /tmp/people-production.csv
```

Also verify the bad DB filename does not appear in containers:

```bash
docker exec -it <backend-container-name> find /app -name "*app.db*" -print
```
Expected only the real database path, not:

`app.db?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000`