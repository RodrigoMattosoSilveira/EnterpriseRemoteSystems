# Training environment ONLY: create these 1Password items in ers-training first.
# Do not reuse Production, DEV, or Test runtime secrets.
JWT_SECRET={{op://ers-training/runtime-secrets/JWT_SECRET}}
LEDGER_CORRECTION_KEY={{op://ers-training/runtime-secrets/LEDGER_CORRECTION_KEY}}
LEDGER_SETTLEMENT_KEY={{op://ers-training/runtime-secrets/LEDGER_SETTLEMENT_KEY}}
