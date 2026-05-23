#!/usr/bin/env bash
set -euo pipefail

./scripts/render-env.sh dev .env.dev
./scripts/render-env.sh tst .env.tst
./scripts/render-env.sh prd .env.prd

# Convenience files for local development.
./scripts/render-env.sh dev backend/.env
./scripts/render-env.sh dev frontend/.env

echo
echo "Rendered all env files."
