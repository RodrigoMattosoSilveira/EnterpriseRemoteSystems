# People CSV Import Runbook

This runbook explains how to bulk-import People records into Enterprise Remote Systems from a CSV file.

Use this runbook for local, development, test, and production imports.

## Purpose

The People CSV importer allows you to load many People records without manually entering each record through the UI.

The importer supports full Person data, including:

- Personal identity fields
- Address fields
- Bank fields
- PIX key
- Emergency contact fields
- Notes
- Status

The importer uses the backend People service/repository path, so imports are validated by the same business rules used by the API.

## Safety rules

People import CSV files contain sensitive personal data, including CPF, RG, cellular number, email, address, bank information, PIX key, and emergency contact information.

Do **not** commit real People CSV files to Git.

Only commit the example template:

```text
backend/imports/people.example.csv
```

Real import files, such as the actual `people.csv`, should remain private and should be ignored by Git:

```gitignore
backend/imports/*.csv
!backend/imports/people.example.csv
```

Before committing, verify the real CSV is ignored:

```bash
git check-ignore -v backend/imports/people.csv
```

## Import behavior

The importer is designed to be production-safe.

It supports:

- Dry-run mode
- Full CSV header validation
- Row-width validation
- Semantic CSV sanity checks
- Backend service validation
- Duplicate detection
- Row-numbered error reporting
- All-or-nothing import behavior

If any row is invalid, the import fails and no rows are inserted.

Dry-run mode validates the file and exercises the service/repository validation path, but rolls back all inserts.

## Canonical CSV header

The CSV must include this exact header row and order:

```csv
firstName,lastName,nickname,cpf,rg,cellular,email,statusId,notes,street1,street2,city,state,cep,country,bankName,bankNumber,checkingAccount,pixKey,emergencyName,emergencyCellular,emergencyEmail
```

The importer is case-sensitive. Use `cep`, not `CEP`; use `pixKey`, not `pixkey`.

## Required values

These fields must have values:

```text
firstName
lastName
nickname
cpf
rg
cellular
email
statusId
```

## Optional values

These fields may be blank:

```text
notes
street1
street2
city
state
cep
country
bankName
bankNumber
checkingAccount
pixKey
emergencyName
emergencyCellular
emergencyEmail
```

Although the values may be blank, the columns must still exist in the CSV header.

## Example CSV

```csv
firstName,lastName,nickname,cpf,rg,cellular,email,statusId,notes,street1,street2,city,state,cep,country,bankName,bankNumber,checkingAccount,pixKey,emergencyName,emergencyCellular,emergencyEmail
Joao,Silva,Joao,39053344705,RG-100001,11998765432,joao@example.com,ref-person-status-active,Imported sample person,Rua A 100,Apto 1,Sao Paulo,SP,01001000,Brasil,Banco do Brasil,001,12345-6,joao@example.com,Ana Silva,11991234567,ana@example.com
Maria,Souza,Maria,93541134780,RG-100002,21998765432,maria@example.com,ref-person-status-active,Imported sample person,Rua B 200,,Rio de Janeiro,RJ,20040-002,Brasil,Itau,341,98765-4,maria@example.com,Carlos Souza,21991234567,carlos@example.com
```

## Field rules

### CPF

Use a valid Brazilian CPF.

Recommended format:

```text
39053344705
```

### RG

RG must match:

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

Brazilian cellular numbers must match the backend rule after normalization:

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
bad-phone
```

### Email

The email column must contain a valid-looking email address with `@`.

Valid example:

```text
person@example.com
```

Invalid examples:

```text
11998765432
person.example.com
person@
```

### CEP

CEP may be either 8 digits or formatted with a dash after the first 5 digits.

Valid examples:

```text
01001000
01001-000
20040-002
```

Invalid examples:

```text
Sao Paulo
0100-1000
01001 000
ABCDE-XYZ
```

The service stores CEP as digits only. For example, `01001-000` is saved as `01001000`.

### State

State must be a valid 2-letter Brazilian UF.

Valid values:

```text
AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO
```

Invalid examples:

```text
XX
Sao Paulo
SP 
sp
```

Use uppercase state abbreviations.

### Country

Country must be exactly:

```text
Brasil
```

Invalid examples:

```text
Brazil
BR
Brasil 
```

### PIX key

The `pixKey` column is required in the CSV header, but the value may be blank.

PIX keys are not normalized to digits because a PIX key can be an email, phone, CPF/CNPJ, or random key.

Valid examples:

```text
person@example.com
11998765432
39053344705
```

## CSV sanity checks

The importer includes semantic checks intended to catch correct column counts with wrong field order.

It rejects rows where:

- `cep` contains non-digits, except the valid `00000-000` format
- `state` is not a valid Brazilian UF
- `country` is not `Brasil`
- `email` does not look like an email address
- `cellular` is not a valid Brazilian cellular number

These checks are especially useful when preparing real production CSV files.

## Local dry run

From the repository root:

```bash
make import-people-dry-run file=backend/imports/people.csv
```

Expected successful output:

```text
People CSV dry-run report
Rows read:      <number>
Rows validated: <number>
Rows inserted:  0
Errors:         0
```

Dry-run mode should always report `Rows inserted: 0`.

## Local import

After a successful dry run:

```bash
make import-people file=backend/imports/people.csv
```

Expected successful output:

```text
People CSV import report
Rows read:      <number>
Rows validated: <number>
Rows inserted:  <number>
Errors:         0
```

For a clean local test, reset the local database first:

```bash
rm -f backend/data/app.db
make local-db-init
make import-people-dry-run file=backend/imports/people.csv
make import-people file=backend/imports/people.csv
```

Verify row count:

```bash
sqlite3 backend/data/app.db "select count(*) from people;"
```

Verify address data:

```bash
sqlite3 backend/data/app.db "select first_name,last_name,street1,city,state,cep,country from people where cep is not null and cep <> '' limit 10;"
```

Verify completion data:

```bash
sqlite3 backend/data/app.db "select first_name,last_name,profile_completion_status,can_create_collaborator from people limit 10;"
```

## Duplicate import behavior

If you run the same import twice against the same database, the second run should fail with duplicate errors.

Common duplicate errors include:

```text
cpf: CPF already exists
rg: RG already exists
cellular: Cellular already exists
email: Email already exists
pixKey: PIX key already exists
```

This is expected and protects against accidental duplicate imports.

## Development, test, and production import workflow

Use the same process in each environment:

1. Deploy the backend version that includes the importer.
2. Copy the CSV to the server.
3. Copy the CSV into the backend container.
4. Run dry run.
5. Run real import only if dry run reports `Errors: 0`.
6. Verify through the UI/API/database.
7. Remove the CSV from the server and container.

## Environment domains

Use the appropriate environment:

```text
Development: https://dev.enterpriseremotesystems.com
Test:        https://tst.enterpriseremotesystems.com
Production:  https://app.enterpriseremotesystems.com
```

## Copy CSV to server

Replace `<server-ip>` and username as needed.

```bash
scp backend/imports/people.csv rodrigo@<server-ip>:/tmp/people.csv
```

SSH into the server:

```bash
ssh rodrigo@<server-ip>
```

## Find the backend container

On the server:

```bash
docker ps
```

Find the backend container for the target environment.

Examples may look like:

```text
ers-dev-backend
ers-tst-backend
ers-prd-backend
```

Use the actual container name shown by `docker ps`.

## Confirm the importer binary exists

```bash
docker exec -it <backend-container-name> ls -l /app/import-people
```

If the file does not exist, redeploy the backend image that includes the importer command.

## Copy CSV into the backend container

```bash
docker cp /tmp/people.csv <backend-container-name>:/tmp/people.csv
```

## Environment dry run

```bash
docker exec -it <backend-container-name> /app/import-people \
  -db /app/data/app.db \
  -file /tmp/people.csv \
  -dry-run
```

Do not continue if the dry run reports errors.

Expected successful output:

```text
People CSV dry-run report
Rows read:      <number>
Rows validated: <number>
Rows inserted:  0
Errors:         0
```

## Environment import

After a successful dry run:

```bash
docker exec -it <backend-container-name> /app/import-people \
  -db /app/data/app.db \
  -file /tmp/people.csv
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

## Verify import in the database

```bash
docker exec -it <backend-container-name> sqlite3 /app/data/app.db "select count(*) from people;"
```

Verify CEP/address data:

```bash
docker exec -it <backend-container-name> sqlite3 /app/data/app.db \
  "select first_name,last_name,street1,city,state,cep,country from people where cep is not null and cep <> '' limit 10;"
```

Verify completion status:

```bash
docker exec -it <backend-container-name> sqlite3 /app/data/app.db \
  "select first_name,last_name,profile_completion_status,can_create_collaborator from people limit 10;"
```

## Verify import through the UI

Open the target environment:

```text
Development: https://dev.enterpriseremotesystems.com/people
Test:        https://tst.enterpriseremotesystems.com/people
Production:  https://app.enterpriseremotesystems.com/people
```

Confirm:

- Imported People records appear
- Address tab is complete when address fields are present
- Bank data is present
- PIX key is present when supplied
- Emergency contact data is present when supplied
- Full records are eligible for collaborator creation when all required sections are complete

## Verify import through the API

Development:

```bash
curl -i https://dev.enterpriseremotesystems.com/api/v1/people/
```

Test:

```bash
curl -i https://tst.enterpriseremotesystems.com/api/v1/people/
```

Production:

```bash
curl -i https://app.enterpriseremotesystems.com/api/v1/people/
```

## Cleanup

After verification, remove the CSV from the server:

```bash
rm -f /tmp/people.csv
```

Remove the CSV from the backend container:

```bash
docker exec -it <backend-container-name> rm -f /tmp/people.csv
```

Also remove or securely archive any local production CSV according to your data-handling policy.

## Troubleshooting

### Import says inserted rows, but expected database appears empty

Confirm the backend is opening the real SQLite file and not a file with the DSN query string in the filename.

Check:

```bash
find . -name "*app.db*" -print
```

There should be no file like:

```text
app.db?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000
```

The correct file should be:

```text
backend/data/app.db
```

Inside containers, the expected path is usually:

```text
/app/data/app.db
```

### CEP is blank in the database

Check the CSV header and field order.

The header must include `cep` in the canonical position:

```text
...,city,state,cep,country,...
```

Run:

```bash
head -1 backend/imports/people.csv
```

Then inspect CSV values:

```bash
python3 - <<'PY'
import csv

with open("backend/imports/people.csv", newline="") as f:
    reader = csv.DictReader(f)
    print(reader.fieldnames)
    count = 0
    for row in reader:
        if (row.get("cep") or "").strip():
            count += 1
    print("nonblank cep rows:", count)
PY
```

### Address tab is incomplete

Address completion requires:

```text
street1
city
state
cep
country
```

and:

```text
country = Brasil
state = valid Brazilian UF
cep = valid 8-digit CEP after normalization
```

Check database values:

```bash
sqlite3 backend/data/app.db "select first_name,last_name,street1,city,state,cep,country from people limit 10;"
```

### Missing required CSV header

The CSV header is missing one or more required columns.

Use the canonical header from this runbook.

### Expected 22 columns, got another number

The row has too few or too many columns.

Common causes:

- Missing trailing commas for blank values
- Extra comma inside an unquoted field
- Header and row order do not match
- Editing CSV manually in a text editor

Use a spreadsheet editor or quote fields that contain commas.

### Country must be Brasil

Use:

```text
Brasil
```

not:

```text
Brazil
BR
```

### State must be a valid Brazilian UF

Use one of:

```text
AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO
```

### Cellular must be a valid Brazilian mobile number

Use values like:

```text
11998765432
5511998765432
+5511998765432
```

Do not use landline numbers.

### Email must contain a valid email address

The email field must look like an email address and contain `@`.

### PIX key already exists

The CSV contains a non-blank PIX key that already exists in the database.

Blank PIX keys are allowed. Duplicate non-blank PIX keys are not allowed.

## Production checklist

Before importing into production:

- [ ] Confirm the backend deployment includes `/app/import-people`
- [ ] Confirm `people.csv` is not committed to Git
- [ ] Confirm the CSV has the canonical header
- [ ] Confirm dry run passes locally
- [ ] Confirm local import succeeds against a clean local database
- [ ] Confirm CEP/address fields are populated locally
- [ ] Confirm full records compute completion correctly locally
- [ ] Copy CSV to the production server
- [ ] Copy CSV into the production backend container
- [ ] Run production dry run
- [ ] Confirm `Errors: 0`
- [ ] Run production import
- [ ] Verify records in the production UI
- [ ] Verify representative records in the production database
- [ ] Remove CSV from `/tmp`
- [ ] Remove CSV from the backend container


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

# Summary
## Local 
```bash
scp backend/imports/people.csv deploy@178.105.46.193:/tmp/people.csv
```

## Devel
```bash

docker cp /tmp/people.csv ers-dev-backend:/tmp/people.csv

docker exec -it ers-dev-backend ls -l /app/import-people

docker exec -it ers-dev-backend sh -lc 'ls -lh /tmp/people.csv && wc -l /tmp/people.csv && head -3 /tmp/people.csv'

docker exec -it ers-dev-backend /app/import-people \
  -db /app/data/app.db \
  -file /tmp/people.csv \
  -dry-run

docker exec -it ers-dev-backend /app/import-people \
  -db /app/data/app.db \
  -file /tmp/people.csv
```

## Test
```bash
docker cp /tmp/people.csv ers-tst-backend:/tmp/people.csv

docker exec -it ers-tst-backend ls -l /app/import-people

docker exec -it ers-tst-backend sh -lc 'ls -lh /tmp/people.csv && wc -l /tmp/people.csv && head -3 /tmp/people.csv'

docker exec -it ers-tst-backend /app/import-people \
  -db /app/data/app.db \
  -file /tmp/people.csv \
  -dry-run

docker exec -it ers-tst-backend /app/import-people \
  -db /app/data/app.db \
  -file /tmp/people.csv
```

## Production
```bash
docker cp /tmp/people.csv ers-prd-backend:/tmp/people.csv

docker exec -it ers-prd-backend ls -l /app/import-people

docker exec -it ers-prd-backend /app/import-people \
  -db /app/data/app.db \
  -file /tmp/people.csv \
  -dry-run

docker exec -it ers-prd-backend /app/import-people \
  -db /app/data/app.db \
  -file /tmp/people.csv
```