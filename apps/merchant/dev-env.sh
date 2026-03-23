#!/usr/bin/env bash
set -euo pipefail

cp ../../.env .dev.vars

base=""
for arg in "$@"; do
  case "$arg" in
    --base=*) base="${arg#*=}" ;;
  esac
done

if [ -n "$base" ]; then
  sed -i.bak -E "s|^STORE_URL=.*|STORE_URL=http://localhost:5173${base}|; s|^CORS_ORIGIN=.*|CORS_ORIGIN=http://localhost:5173${base}|" .dev.vars
fi

npx wrangler dev
