#!/bin/zsh

export LLM_COACHING_ENABLED=true
export OPENAI_API_KEY="YOUR_API_KEY"
export OPENAI_MODEL="gpt-5.1-mini"
export OPENAI_BASE_URL="https://api.openai.com/v1"
export OPENAI_TIMEOUT_SECONDS=20

cd backend
DATABASE_PATH=data/app.db go run ./cmd/api