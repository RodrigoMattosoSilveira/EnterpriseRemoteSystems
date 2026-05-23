#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:8080/api/v1}"

if ! command -v jq >/dev/null 2>&1; then
  echo "❌ jq is required for this script."
  exit 1
fi

echo "Testing hearsay flow against: $API_BASE_URL"
echo

echo "==> Health check"
curl -fsS "${API_BASE_URL}/healthz" | jq

echo
echo "==> Create session"
SESSION_ID="$(
  curl -fsS -X POST "${API_BASE_URL}/sessions" \
    -H "Content-Type: application/json" \
    -d '{
      "scenarioId": "scenario-hearsay-001",
      "mode": "spot_objection"
    }' | jq -r '.data.id'
)"

if [[ -z "$SESSION_ID" || "$SESSION_ID" == "null" ]]; then
  echo "❌ Failed to create session."
  exit 1
fi

echo "SESSION_ID=$SESSION_ID"

echo
echo "==> Advance to hearsay line"
for i in {1..4}; do
  echo "Advancing line $i"
  curl -fsS -X POST "${API_BASE_URL}/sessions/${SESSION_ID}/next" | jq '.data.line.lineText'
done

echo
echo "==> Submit correct hearsay objection"
ACTION_RESPONSE="$(
  curl -fsS -X POST "${API_BASE_URL}/sessions/${SESSION_ID}/actions" \
    -H "Content-Type: application/json" \
    -d '{
      "actionType": "object",
      "rawText": "Objection, hearsay."
    }'
)"

echo "$ACTION_RESPONSE" | jq

VALID="$(echo "$ACTION_RESPONSE" | jq -r '.data.evaluation.valid')"
RULING="$(echo "$ACTION_RESPONSE" | jq -r '.data.evaluation.ruling')"
JUDGE_TEXT="$(echo "$ACTION_RESPONSE" | jq -r '.data.judgeEvent.text')"

if [[ "$VALID" != "true" ]]; then
  echo "❌ Expected evaluation.valid=true, got $VALID"
  exit 1
fi

if [[ "$RULING" != "sustained" ]]; then
  echo "❌ Expected ruling=sustained, got $RULING"
  exit 1
fi

if [[ "$JUDGE_TEXT" != "Sustained." ]]; then
  echo "❌ Expected judge text 'Sustained.', got '$JUDGE_TEXT'"
  exit 1
fi

echo
echo "==> Fetch score"
curl -fsS "${API_BASE_URL}/sessions/${SESSION_ID}/score" | jq

echo
echo "==> Fetch debrief"
curl -fsS "${API_BASE_URL}/sessions/${SESSION_ID}/debrief" | jq '.data.summary, .data.score'

echo
echo "✅ Hearsay backend flow passed."