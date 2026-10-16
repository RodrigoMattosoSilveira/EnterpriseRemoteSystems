# Production secret fragment. NEVER enable DEV_SEED_ADMIN or copy DEV_ADMIN_PASSWORD.
# Optional AI and Development admin credentials are deliberately excluded.
JWT_SECRET={{op://ers-production/runtime-secrets/JWT_SECRET}}
LEDGER_CORRECTION_KEY={{op://ers-production/runtime-secrets/LEDGER_CORRECTION_KEY}}
LEDGER_SETTLEMENT_KEY={{op://ers-production/runtime-secrets/LEDGER_SETTLEMENT_KEY}}
