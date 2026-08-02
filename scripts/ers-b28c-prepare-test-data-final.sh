#!/usr/bin/env bash
set -euo pipefail

BASE_URL="http://127.0.0.1:8080/api/v1"
PRIMARY_TENANT_ID="default"
SECOND_TENANT_CODE="B28C_SECONDARY"
SECOND_TENANT_NAME="Bite 28C Secondary Tenant"
ENV_FILE="/tmp/ers-b28c-manual-env.sh"
JOURNEY_START_DATE="$(date +%F)"

ADMIN_DESIRED_LOGIN="local.application.admin@example.com"
ADMIN_PASSWORD='Local-Application-Admin-28C!'
TENANT_ADMIN_DESIRED_LOGIN="local.tenant.admin@example.com"
TENANT_ADMIN_PASSWORD='Local-Tenant-Admin-28C!'
EXPENSES_DESIRED_LOGIN="local.expenses.operator@example.com"
EXPENSES_PASSWORD='Local-Expenses-Operator-28C!'
EARNINGS_DESIRED_LOGIN="local.earnings.operator@example.com"
EARNINGS_PASSWORD='Local-Earnings-Operator-28C!'
DISPOSABLE_DESIRED_LOGIN="local.disposable.actor@example.com"
DISPOSABLE_PASSWORD='Local-Disposable-Actor-28C!'
GRANT_REVOKE_DESIRED_LOGIN="local.grant.revoke.actor@example.com"
GRANT_REVOKE_PASSWORD='Local-Grant-Revoke-Actor-28C!'

for command in curl jq; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command is missing: $command" >&2
    exit 1
  }
done

if ! curl -fsS "$BASE_URL/healthz" >/dev/null; then
  echo "The Development backend is not reachable at $BASE_URL" >&2
  echo "Start the pre-cutover Development backend before running this script." >&2
  exit 1
fi

api_request() {
  local method="$1"
  local tenant_id="$2"
  local path="$3"
  local output_file="$4"
  local payload="${5-}"
  local -a args=(
    curl -sS
    -o "$output_file"
    -w '%{http_code}'
    -X "$method"
    -H "X-Actor-ID: bootstrap-admin"
    -H "X-Tenant-ID: $tenant_id"
  )

  if [[ -n "$payload" ]]; then
    args+=(
      -H "Content-Type: application/json"
      --data-binary "$payload"
    )
  fi

  args+=("$BASE_URL$path")
  "${args[@]}"
}

require_status() {
  local status="$1"
  local expected_regex="$2"
  local context="$3"
  local response_file="$4"

  if [[ ! "$status" =~ $expected_regex ]]; then
    echo "$context failed: HTTP $status" >&2
    if [[ -s "$response_file" ]]; then
      jq . "$response_file" >&2 2>/dev/null || cat "$response_file" >&2
    fi
    exit 1
  fi
}

ensure_second_tenant() {
  local response_file="/tmp/ers-b28c-tenants.json"
  local status
  status=$(api_request GET "$PRIMARY_TENANT_ID" "/tenants" "$response_file")
  require_status "$status" '^200$' "List tenants" "$response_file"

  local tenant_id
  tenant_id=$(
    jq -r --arg code "$SECOND_TENANT_CODE" '
      def rows:
        if (.data | type) == "array" then .data
        elif (.data.items | type) == "array" then .data.items
        else [] end;
      rows | map(select(.code == $code)) | first | .id // empty
    ' "$response_file"
  )

  if [[ -z "$tenant_id" ]]; then
    local payload
    payload=$(
      jq -n \
        --arg code "$SECOND_TENANT_CODE" \
        --arg name "$SECOND_TENANT_NAME" \
        '{
          code: $code,
          name: $name,
          description: "Dedicated local tenant for Bite 28C authorization isolation tests",
          active: true
        }'
    )

    status=$(api_request POST "$PRIMARY_TENANT_ID" "/tenants" "/tmp/ers-b28c-create-tenant.json" "$payload")
    require_status "$status" '^201$' "Create second tenant" "/tmp/ers-b28c-create-tenant.json"
    tenant_id=$(jq -er '.data.id' /tmp/ers-b28c-create-tenant.json)
  fi

  echo "$tenant_id"
}

reference_id() {
  local tenant_id="$1"
  local type="$2"
  local code="$3"
  local response_file="/tmp/ers-b28c-reference-${tenant_id}-${type}.json"
  local status

  status=$(api_request GET "$tenant_id" "/reference-data/$type" "$response_file")
  require_status "$status" '^200$' "List reference data $type for $tenant_id" "$response_file"

  jq -er --arg code "$code" '
    def rows:
      if (.data | type) == "array" then .data
      elif (.data.items | type) == "array" then .data.items
      else [] end;
    rows[] | select(.code == $code and .active == true) | .id
  ' "$response_file"
}

ensure_person() {
  local tenant_id="$1"
  local first_name="$2"
  local last_name="$3"
  local nickname="$4"
  local cpf="$5"
  local rg="$6"
  local cellular="$7"
  local email="$8"
  local street_number="$9"
  local bank_account="${10}"
  local emergency_cellular="${11}"
  local status_id="${12}"

  local payload
  payload=$(
    jq -n \
      --arg firstName "$first_name" \
      --arg lastName "$last_name" \
      --arg nickname "$nickname" \
      --arg cpf "$cpf" \
      --arg rg "$rg" \
      --arg cellular "$cellular" \
      --arg email "$email" \
      --arg street1 "Rua Manual 28C, $street_number" \
      --arg checkingAccount "$bank_account" \
      --arg pixKey "$email" \
      --arg emergencyName "Emergency contact for $nickname" \
      --arg emergencyCellular "$emergency_cellular" \
      --arg emergencyEmail "emergency.$email" \
      --arg statusId "$status_id" \
      '{
        firstName: $firstName,
        lastName: $lastName,
        nickname: $nickname,
        cpf: $cpf,
        rg: $rg,
        cellular: $cellular,
        email: $email,
        street1: $street1,
        street2: "",
        state: "Pará",
        city: "Itaituba",
        cep: "68180000",
        country: "Brasil",
        bankName: "Banco de Teste 28C",
        bankNumber: "001",
        checkingAccount: $checkingAccount,
        pixKey: $pixKey,
        emergencyName: $emergencyName,
        emergencyCellular: $emergencyCellular,
        emergencyEmail: $emergencyEmail,
        statusId: $statusId,
        notes: "Bite 28C manual acceptance test identity"
      }'
  )

  local response_file="/tmp/ers-b28c-person-search.json"
  local status
  status=$(
    curl -sS -G \
      -o "$response_file" \
      -w '%{http_code}' \
      -H "X-Actor-ID: bootstrap-admin" \
      -H "X-Tenant-ID: $tenant_id" \
      --data-urlencode "search=$email" \
      --data-urlencode "page=1" \
      --data-urlencode "pageSize=20" \
      "$BASE_URL/people"
  )
  require_status "$status" '^200$' "Find Person $email" "$response_file"

  local person_id
  person_id=$(
    jq -r --arg email "$email" '
      def rows:
        if (.data.items | type) == "array" then .data.items
        elif (.data | type) == "array" then .data
        else [] end;
      rows | map(select(.email == $email)) | first | .id // empty
    ' "$response_file"
  )

  if [[ -z "$person_id" ]]; then
    status=$(api_request POST "$tenant_id" "/people" "/tmp/ers-b28c-create-person.json" "$payload")
    require_status "$status" '^201$' "Create Person $email" "/tmp/ers-b28c-create-person.json"
    person_id=$(jq -er '.data.id' /tmp/ers-b28c-create-person.json)
  else
    status=$(api_request PUT "$tenant_id" "/people/$person_id" "/tmp/ers-b28c-update-person.json" "$payload")
    require_status "$status" '^200$' "Update Person $email" "/tmp/ers-b28c-update-person.json"
  fi

  local detail_file="/tmp/ers-b28c-person-detail.json"
  status=$(api_request GET "$tenant_id" "/people/$person_id" "$detail_file")
  require_status "$status" '^200$' "Read Person $email" "$detail_file"

  local can_create
  can_create=$(jq -r '.data.canCreateCollaborator' "$detail_file")
  if [[ "$tenant_id" == "$PRIMARY_TENANT_ID" && "$can_create" != "true" ]]; then
    echo "Person $email is not eligible to create a Collaborator." >&2
    jq . "$detail_file" >&2
    exit 1
  fi

  echo "$person_id"
}

ensure_collaborator() {
  local person_id="$1"
  local nickname="$2"
  local payment_method_id="$3"
  local sector_id="$4"
  local location_id="$5"
  local task_id="$6"
  local status_id="$7"

  local response_file="/tmp/ers-b28c-collaborator-search.json"
  local status
  status=$(
    curl -sS -G \
      -o "$response_file" \
      -w '%{http_code}' \
      -H "X-Actor-ID: bootstrap-admin" \
      -H "X-Tenant-ID: $PRIMARY_TENANT_ID" \
      --data-urlencode "search=$nickname" \
      --data-urlencode "page=1" \
      --data-urlencode "pageSize=100" \
      "$BASE_URL/collaborators"
  )
  require_status "$status" '^200$' "Find Collaborator for $nickname" "$response_file"

  local collaborator_id
  collaborator_id=$(
    jq -r --arg personId "$person_id" '
      def rows:
        if (.data.items | type) == "array" then .data.items
        elif (.data | type) == "array" then .data
        else [] end;
      rows | map(select(.personId == $personId and (.statusCode == "ACTIVE" or .statusLabel == "Active"))) | first | .id // empty
    ' "$response_file"
  )

  if [[ -z "$collaborator_id" ]]; then
    local payload
    payload=$(
      jq -n \
        --arg personId "$person_id" \
        --arg journeyStartDate "$JOURNEY_START_DATE" \
        --arg paymentMethodId "$payment_method_id" \
        --arg sectorId "$sector_id" \
        --arg locationId "$location_id" \
        --arg taskId "$task_id" \
        --arg statusId "$status_id" \
        '{
          personId: $personId,
          journeyStartDate: $journeyStartDate,
          paymentMethodId: $paymentMethodId,
          paymentValue: 150,
          planningAvailability: "ACTIVE",
          sectorId: $sectorId,
          locationId: $locationId,
          taskId: $taskId,
          statusId: $statusId,
          notes: "Bite 28C manual acceptance test Collaborator"
        }'
    )

    status=$(api_request POST "$PRIMARY_TENANT_ID" "/collaborators" "/tmp/ers-b28c-create-collaborator.json" "$payload")
    require_status "$status" '^201$' "Create Collaborator for $nickname" "/tmp/ers-b28c-create-collaborator.json"
    collaborator_id=$(jq -er '.data.id' /tmp/ers-b28c-create-collaborator.json)
  fi

  echo "$collaborator_id"
}

ensure_actor() {
  local collaborator_id="$1"
  local person_id="$2"
  local display_name="$3"

  local response_file="/tmp/ers-b28c-authz-actors.json"
  local status
  status=$(api_request GET "$PRIMARY_TENANT_ID" "/authz/actors" "$response_file")
  require_status "$status" '^200$' "List Authorization Actors" "$response_file"

  local actor_id
  actor_id=$(
    jq -r --arg collaboratorId "$collaborator_id" '
      def rows:
        if (.data | type) == "array" then .data
        elif (.data.items | type) == "array" then .data.items
        else [] end;
      rows | map(select(.collaboratorId == $collaboratorId)) | first | .id // empty
    ' "$response_file"
  )

  if [[ -z "$actor_id" ]]; then
    local actor_key
    if [[ "$collaborator_id" == collaborator-* ]]; then
      actor_key="$collaborator_id"
    else
      actor_key="collaborator-$collaborator_id"
    fi

    local payload
    payload=$(
      jq -n \
        --arg actorKey "$actor_key" \
        --arg displayName "$display_name" \
        --arg personId "$person_id" \
        --arg collaboratorId "$collaborator_id" \
        '{
          actorKey: $actorKey,
          displayName: $displayName,
          personId: $personId,
          collaboratorId: $collaboratorId,
          active: true
        }'
    )

    status=$(api_request POST "$PRIMARY_TENANT_ID" "/authz/actors" "/tmp/ers-b28c-create-actor.json" "$payload")
    require_status "$status" '^201$' "Create Authorization Actor for $display_name" "/tmp/ers-b28c-create-actor.json"
    actor_id=$(jq -er '.data.id' /tmp/ers-b28c-create-actor.json)
  else
    local activate_payload='{"active":true}'
    status=$(api_request PATCH "$PRIMARY_TENANT_ID" "/authz/actors/$actor_id/active" "/tmp/ers-b28c-activate-actor.json" "$activate_payload")
    require_status "$status" '^200$' "Activate Authorization Actor for $display_name" "/tmp/ers-b28c-activate-actor.json"
  fi

  echo "$actor_id"
}

actor_key_for_id() {
  local actor_id="$1"
  local response_file="/tmp/ers-b28c-authz-actors.json"
  local status
  status=$(api_request GET "$PRIMARY_TENANT_ID" "/authz/actors" "$response_file")
  require_status "$status" '^200$' "List Authorization Actors" "$response_file"

  jq -er --arg actorId "$actor_id" '
    def rows:
      if (.data | type) == "array" then .data
      elif (.data.items | type) == "array" then .data.items
      else [] end;
    rows[] | select(.id == $actorId) | .actorKey
  ' "$response_file"
}

ensure_role_grant() {
  local actor_id="$1"
  local role_code="$2"
  local tenant_id="$3"

  local response_file="/tmp/ers-b28c-authz-actors.json"
  local status
  status=$(api_request GET "$PRIMARY_TENANT_ID" "/authz/actors" "$response_file")
  require_status "$status" '^200$' "List Authorization Actors" "$response_file"

  local existing_grant
  existing_grant=$(
    jq -r \
      --arg actorId "$actor_id" \
      --arg roleCode "$role_code" \
      --arg tenantId "$tenant_id" '
      def rows:
        if (.data | type) == "array" then .data
        elif (.data.items | type) == "array" then .data.items
        else [] end;
      rows
      | map(select(.id == $actorId))
      | first
      | (.roleGrants // .grants // [])
      | map(select(.roleCode == $roleCode and .tenantId == $tenantId and .active == true))
      | first
      | .id // empty
    ' "$response_file"
  )

  if [[ -z "$existing_grant" ]]; then
    local payload
    payload=$(
      jq -n \
        --arg roleCode "$role_code" \
        --arg tenantId "$tenant_id" \
        '{roleCode: $roleCode, tenantId: $tenantId}'
    )

    status=$(api_request POST "$PRIMARY_TENANT_ID" "/authz/actors/$actor_id/role-grants" "/tmp/ers-b28c-grant-role.json" "$payload")
    require_status "$status" '^201$' "Grant $role_code to Actor $actor_id" "/tmp/ers-b28c-grant-role.json"
  fi
}

remove_all_role_grants() {
  local actor_id="$1"
  local response_file="/tmp/ers-b28c-authz-actors.json"
  local status
  status=$(api_request GET "$PRIMARY_TENANT_ID" "/authz/actors" "$response_file")
  require_status "$status" '^200$' "List Authorization Actors" "$response_file"

  local grant_id
  while IFS= read -r grant_id; do
    [[ -n "$grant_id" ]] || continue
    status=$(api_request DELETE "$PRIMARY_TENANT_ID" "/authz/actors/$actor_id/role-grants/$grant_id" "/tmp/ers-b28c-revoke-role.json")
    require_status "$status" '^200$' "Revoke role grant $grant_id" "/tmp/ers-b28c-revoke-role.json"
  done < <(
    jq -r --arg actorId "$actor_id" '
      def rows:
        if (.data | type) == "array" then .data
        elif (.data.items | type) == "array" then .data.items
        else [] end;
      rows
      | map(select(.id == $actorId))
      | first
      | (.roleGrants // .grants // [])[]?
      | select(.active == true)
      | .id
    ' "$response_file"
  )
}

ensure_account() {
  local actor_id="$1"
  local desired_login="$2"
  local password="$3"

  local response_file="/tmp/ers-b28c-auth-accounts.json"
  local status
  status=$(api_request GET "$PRIMARY_TENANT_ID" "/auth/accounts" "$response_file")
  require_status "$status" '^200$' "List Authentication Accounts" "$response_file"

  local account_json
  account_json=$(
    jq -c --arg actorId "$actor_id" '
      def rows:
        if (.data | type) == "array" then .data
        elif (.data.items | type) == "array" then .data.items
        else [] end;
      rows | map(select(.actorId == $actorId)) | first
    ' "$response_file"
  )

  local actual_login
  if [[ "$account_json" == "null" || -z "$account_json" ]]; then
    local payload
    payload=$(
      jq -n \
        --arg actorId "$actor_id" \
        --arg login "$desired_login" \
        --arg password "$password" \
        '{
          actorId: $actorId,
          login: $login,
          temporaryPassword: $password,
          mustChangePassword: false
        }'
    )

    status=$(api_request POST "$PRIMARY_TENANT_ID" "/auth/accounts" "/tmp/ers-b28c-create-account.json" "$payload")
    require_status "$status" '^201$' "Create Authentication Account $desired_login" "/tmp/ers-b28c-create-account.json"
    actual_login=$(jq -er '.data.login' /tmp/ers-b28c-create-account.json)
  else
    local account_id
    account_id=$(jq -er '.id' <<<"$account_json")
    actual_login=$(jq -er '.login' <<<"$account_json")

    local active_payload='{"active":true}'
    status=$(api_request PATCH "$PRIMARY_TENANT_ID" "/auth/accounts/$account_id/active" "/tmp/ers-b28c-activate-account.json" "$active_payload")
    require_status "$status" '^200$' "Activate Authentication Account $actual_login" "/tmp/ers-b28c-activate-account.json"

    status=$(api_request POST "$PRIMARY_TENANT_ID" "/auth/accounts/$account_id/password-reset-tokens" "/tmp/ers-b28c-reset-token.json")
    require_status "$status" '^201$' "Issue password reset token for $actual_login" "/tmp/ers-b28c-reset-token.json"

    local reset_token
    reset_token=$(jq -er '.data.token' /tmp/ers-b28c-reset-token.json)

    local reset_payload
    reset_payload=$(
      jq -n \
        --arg token "$reset_token" \
        --arg password "$password" \
        '{token: $token, newPassword: $password}'
    )

    status=$(
      curl -sS \
        -o /tmp/ers-b28c-password-reset.json \
        -w '%{http_code}' \
        -X POST \
        -H "Content-Type: application/json" \
        --data-binary "$reset_payload" \
        "$BASE_URL/auth/password/reset"
    )
    require_status "$status" '^20[0-9]$' "Reset password for $actual_login" "/tmp/ers-b28c-password-reset.json"
    unset reset_token
  fi

  echo "$actual_login"
}

SECOND_TENANT_ID=$(ensure_second_tenant)
echo "Second tenant: $SECOND_TENANT_ID" >&2

DEFAULT_PERSON_STATUS_ID=$(reference_id "$PRIMARY_TENANT_ID" person_status ACTIVE)
SECOND_PERSON_STATUS_ID=$(reference_id "$SECOND_TENANT_ID" person_status ACTIVE)
PAYMENT_METHOD_ID=$(reference_id "$PRIMARY_TENANT_ID" method DAILY)
SECTOR_ID=$(reference_id "$PRIMARY_TENANT_ID" sector MINING)
LOCATION_ID=$(reference_id "$PRIMARY_TENANT_ID" location MAIN_MINE)
TASK_ID=$(reference_id "$PRIMARY_TENANT_ID" task MINER)
COLLABORATOR_STATUS_ID=$(reference_id "$PRIMARY_TENANT_ID" collaborator_status ACTIVE)

TENANT_ADMIN_PERSON_ID=$(ensure_person "$PRIMARY_TENANT_ID" "Manual" "TenantAdmin" "B28C Tenant Admin" "10020030088" "B28CTA001" "11970000001" "b28c.tenant.admin.person@example.com" "101" "280001-1" "11980000001" "$DEFAULT_PERSON_STATUS_ID")
EXPENSES_PERSON_ID=$(ensure_person "$PRIMARY_TENANT_ID" "Manual" "ExpensesOperator" "B28C Expenses Operator" "10020030169" "B28CEO002" "11970000002" "b28c.expenses.operator.person@example.com" "102" "280002-2" "11980000002" "$DEFAULT_PERSON_STATUS_ID")
EARNINGS_PERSON_ID=$(ensure_person "$PRIMARY_TENANT_ID" "Manual" "EarningsOperator" "B28C Earnings Operator" "10020030240" "B28CEO003" "11970000003" "b28c.earnings.operator.person@example.com" "103" "280003-3" "11980000003" "$DEFAULT_PERSON_STATUS_ID")
DISPOSABLE_PERSON_ID=$(ensure_person "$PRIMARY_TENANT_ID" "Manual" "DisposableActor" "B28C Disposable Actor" "10020030320" "B28CDA004" "11970000004" "b28c.disposable.actor.person@example.com" "104" "280004-4" "11980000004" "$DEFAULT_PERSON_STATUS_ID")
GRANT_REVOKE_PERSON_ID=$(ensure_person "$PRIMARY_TENANT_ID" "Manual" "GrantRevoke" "B28C Grant Revoke" "10020030401" "B28CGR005" "11970000005" "b28c.grant.revoke.person@example.com" "105" "280005-5" "11980000005" "$DEFAULT_PERSON_STATUS_ID")
SECOND_TENANT_PERSON_ID=$(ensure_person "$SECOND_TENANT_ID" "Manual" "SecondaryTenant" "B28C Secondary Tenant Person" "10020030592" "B28CST006" "11970000006" "b28c.secondary.tenant.person@example.com" "106" "280006-6" "11980000006" "$SECOND_PERSON_STATUS_ID")

TENANT_ADMIN_COLLABORATOR_ID=$(ensure_collaborator "$TENANT_ADMIN_PERSON_ID" "B28C Tenant Admin" "$PAYMENT_METHOD_ID" "$SECTOR_ID" "$LOCATION_ID" "$TASK_ID" "$COLLABORATOR_STATUS_ID")
EXPENSES_COLLABORATOR_ID=$(ensure_collaborator "$EXPENSES_PERSON_ID" "B28C Expenses Operator" "$PAYMENT_METHOD_ID" "$SECTOR_ID" "$LOCATION_ID" "$TASK_ID" "$COLLABORATOR_STATUS_ID")
EARNINGS_COLLABORATOR_ID=$(ensure_collaborator "$EARNINGS_PERSON_ID" "B28C Earnings Operator" "$PAYMENT_METHOD_ID" "$SECTOR_ID" "$LOCATION_ID" "$TASK_ID" "$COLLABORATOR_STATUS_ID")
DISPOSABLE_COLLABORATOR_ID=$(ensure_collaborator "$DISPOSABLE_PERSON_ID" "B28C Disposable Actor" "$PAYMENT_METHOD_ID" "$SECTOR_ID" "$LOCATION_ID" "$TASK_ID" "$COLLABORATOR_STATUS_ID")
GRANT_REVOKE_COLLABORATOR_ID=$(ensure_collaborator "$GRANT_REVOKE_PERSON_ID" "B28C Grant Revoke" "$PAYMENT_METHOD_ID" "$SECTOR_ID" "$LOCATION_ID" "$TASK_ID" "$COLLABORATOR_STATUS_ID")

TENANT_ADMIN_ACTOR_ID=$(ensure_actor "$TENANT_ADMIN_COLLABORATOR_ID" "$TENANT_ADMIN_PERSON_ID" "B28C Tenant Admin")
EXPENSES_ACTOR_ID=$(ensure_actor "$EXPENSES_COLLABORATOR_ID" "$EXPENSES_PERSON_ID" "B28C Expenses Operator")
EARNINGS_ACTOR_ID=$(ensure_actor "$EARNINGS_COLLABORATOR_ID" "$EARNINGS_PERSON_ID" "B28C Earnings Operator")
DISPOSABLE_ACTOR_ID=$(ensure_actor "$DISPOSABLE_COLLABORATOR_ID" "$DISPOSABLE_PERSON_ID" "B28C Disposable Actor")
GRANT_REVOKE_ACTOR_ID=$(ensure_actor "$GRANT_REVOKE_COLLABORATOR_ID" "$GRANT_REVOKE_PERSON_ID" "B28C Grant Revoke")

BOOTSTRAP_ACTOR_ID=$(
  api_request GET "$PRIMARY_TENANT_ID" "/authz/actors" "/tmp/ers-b28c-authz-actors.json" >/tmp/ers-b28c-status
  jq -er '
    def rows:
      if (.data | type) == "array" then .data
      elif (.data.items | type) == "array" then .data.items
      else [] end;
    rows[] | select(.actorKey == "bootstrap-admin") | .id
  ' /tmp/ers-b28c-authz-actors.json
)

ensure_role_grant "$BOOTSTRAP_ACTOR_ID" APPLICATION_ADMIN '*'
ensure_role_grant "$TENANT_ADMIN_ACTOR_ID" TENANT_ADMIN "$PRIMARY_TENANT_ID"
ensure_role_grant "$EXPENSES_ACTOR_ID" EXPENSE_OPERATOR "$PRIMARY_TENANT_ID"
ensure_role_grant "$EARNINGS_ACTOR_ID" EARNINGS_OPERATOR "$PRIMARY_TENANT_ID"
ensure_role_grant "$DISPOSABLE_ACTOR_ID" EXPENSE_OPERATOR "$PRIMARY_TENANT_ID"
remove_all_role_grants "$GRANT_REVOKE_ACTOR_ID"

ADMIN_LOGIN=$(ensure_account "$BOOTSTRAP_ACTOR_ID" "$ADMIN_DESIRED_LOGIN" "$ADMIN_PASSWORD")
TENANT_ADMIN_LOGIN=$(ensure_account "$TENANT_ADMIN_ACTOR_ID" "$TENANT_ADMIN_DESIRED_LOGIN" "$TENANT_ADMIN_PASSWORD")
EXPENSES_LOGIN=$(ensure_account "$EXPENSES_ACTOR_ID" "$EXPENSES_DESIRED_LOGIN" "$EXPENSES_PASSWORD")
EARNINGS_LOGIN=$(ensure_account "$EARNINGS_ACTOR_ID" "$EARNINGS_DESIRED_LOGIN" "$EARNINGS_PASSWORD")
DISPOSABLE_LOGIN=$(ensure_account "$DISPOSABLE_ACTOR_ID" "$DISPOSABLE_DESIRED_LOGIN" "$DISPOSABLE_PASSWORD")
GRANT_REVOKE_LOGIN=$(ensure_account "$GRANT_REVOKE_ACTOR_ID" "$GRANT_REVOKE_DESIRED_LOGIN" "$GRANT_REVOKE_PASSWORD")

TENANT_ADMIN_ACTOR_KEY=$(actor_key_for_id "$TENANT_ADMIN_ACTOR_ID")
EXPENSES_ACTOR_KEY=$(actor_key_for_id "$EXPENSES_ACTOR_ID")
EARNINGS_ACTOR_KEY=$(actor_key_for_id "$EARNINGS_ACTOR_ID")
DISPOSABLE_ACTOR_KEY=$(actor_key_for_id "$DISPOSABLE_ACTOR_ID")
GRANT_REVOKE_ACTOR_KEY=$(actor_key_for_id "$GRANT_REVOKE_ACTOR_ID")

write_var() {
  local name="$1"
  local value="$2"
  printf 'export %s=%q\n' "$name" "$value"
}

{
  echo '# Generated by ers-b28c-prepare-test-data.sh'
  write_var BASE_URL "$BASE_URL"
  write_var PRIMARY_TENANT_ID "$PRIMARY_TENANT_ID"
  write_var SECOND_TENANT_ID "$SECOND_TENANT_ID"
  write_var ADMIN_LOGIN "$ADMIN_LOGIN"
  write_var ADMIN_PASSWORD "$ADMIN_PASSWORD"
  write_var TENANT_ADMIN_LOGIN "$TENANT_ADMIN_LOGIN"
  write_var TENANT_ADMIN_PASSWORD "$TENANT_ADMIN_PASSWORD"
  write_var EXPENSES_LOGIN "$EXPENSES_LOGIN"
  write_var EXPENSES_PASSWORD "$EXPENSES_PASSWORD"
  write_var EARNINGS_LOGIN "$EARNINGS_LOGIN"
  write_var EARNINGS_PASSWORD "$EARNINGS_PASSWORD"
  write_var DISPOSABLE_LOGIN "$DISPOSABLE_LOGIN"
  write_var DISPOSABLE_PASSWORD "$DISPOSABLE_PASSWORD"
  write_var GRANT_REVOKE_LOGIN "$GRANT_REVOKE_LOGIN"
  write_var GRANT_REVOKE_PASSWORD "$GRANT_REVOKE_PASSWORD"
  write_var TENANT_ADMIN_PERSON_ID "$TENANT_ADMIN_PERSON_ID"
  write_var EXPENSES_PERSON_ID "$EXPENSES_PERSON_ID"
  write_var EARNINGS_PERSON_ID "$EARNINGS_PERSON_ID"
  write_var DISPOSABLE_PERSON_ID "$DISPOSABLE_PERSON_ID"
  write_var GRANT_REVOKE_PERSON_ID "$GRANT_REVOKE_PERSON_ID"
  write_var SECOND_TENANT_PERSON_ID "$SECOND_TENANT_PERSON_ID"
  write_var TENANT_ADMIN_COLLABORATOR_ID "$TENANT_ADMIN_COLLABORATOR_ID"
  write_var EXPENSES_COLLABORATOR_ID "$EXPENSES_COLLABORATOR_ID"
  write_var EARNINGS_COLLABORATOR_ID "$EARNINGS_COLLABORATOR_ID"
  write_var DISPOSABLE_COLLABORATOR_ID "$DISPOSABLE_COLLABORATOR_ID"
  write_var GRANT_REVOKE_COLLABORATOR_ID "$GRANT_REVOKE_COLLABORATOR_ID"
  write_var BOOTSTRAP_ACTOR_ID "$BOOTSTRAP_ACTOR_ID"
  write_var TENANT_ADMIN_ACTOR_ID "$TENANT_ADMIN_ACTOR_ID"
  write_var EXPENSES_ACTOR_ID "$EXPENSES_ACTOR_ID"
  write_var EARNINGS_ACTOR_ID "$EARNINGS_ACTOR_ID"
  write_var DISPOSABLE_ACTOR_ID "$DISPOSABLE_ACTOR_ID"
  write_var GRANT_REVOKE_ACTOR_ID "$GRANT_REVOKE_ACTOR_ID"
  write_var TENANT_ADMIN_ACTOR_KEY "$TENANT_ADMIN_ACTOR_KEY"
  write_var EXPENSES_ACTOR_KEY "$EXPENSES_ACTOR_KEY"
  write_var EARNINGS_ACTOR_KEY "$EARNINGS_ACTOR_KEY"
  write_var DISPOSABLE_ACTOR_KEY "$DISPOSABLE_ACTOR_KEY"
  write_var GRANT_REVOKE_ACTOR_KEY "$GRANT_REVOKE_ACTOR_KEY"
} > "$ENV_FILE"

chmod 600 "$ENV_FILE"

echo
printf 'Bite 28C manual test data is ready.\n'
printf 'Environment file: %s\n' "$ENV_FILE"
printf 'Second tenant ID: %s\n' "$SECOND_TENANT_ID"
printf 'Application Admin login: %s\n' "$ADMIN_LOGIN"
printf 'Tenant Admin login: %s\n' "$TENANT_ADMIN_LOGIN"
printf 'Expenses Operator login: %s\n' "$EXPENSES_LOGIN"
printf 'Earnings Operator login: %s\n' "$EARNINGS_LOGIN"
printf 'Disposable Actor login: %s\n' "$DISPOSABLE_LOGIN"
printf 'Grant/Revoke Actor login: %s\n' "$GRANT_REVOKE_LOGIN"
printf '\nStop the Development backend, restart Bite 28C, then run:\n'
printf 'source %q\n' "$ENV_FILE"

