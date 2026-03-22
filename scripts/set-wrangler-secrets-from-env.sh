#!/usr/bin/env bash
# Copyright (c) 2024-2026 Ronan LE MEILLAT
# License: AGPL-3.0-or-later
#
# Read .env and create Cloudflare Worker secrets via `npx wrangler secret put`.
#
# Usage:
#   ./scripts/set-wrangler-secrets-from-env.sh .env
#
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <path-to-env-file>"
  exit 1
fi

env_file="$1"

if [ ! -f "$env_file" ]; then
  echo "Env file not found: $env_file"
  exit 1
fi

# Force the script to update only declared keys, we ignore comments and blank lines.
while IFS= read -r line || [ -n "$line" ]; do
  trimmed="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [[ -z "$trimmed" || "$trimmed" == \#* ]]; then
    continue
  fi

  if [[ "$trimmed" != *=* ]]; then
    continue
  fi

  key="${trimmed%%=*}"
  value="${trimmed#*=}"

  # Remove surrounding quotes if present.
  if [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi

  if [[ -z "$key" ]]; then
    continue
  fi

  echo "Setting secret for key: $key"

  printf '%s' "$value" | npx wrangler secret put "$key" --yes

done < "$env_file"

echo "All secrets from '$env_file' have been pushed to Wrangler."