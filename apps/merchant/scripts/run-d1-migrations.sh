#!/usr/bin/env bash
set -euo pipefail

# Run all D1 SQL migrations in apps/merchant/migrations/ in order
# Usage:
#   ./scripts/run-d1-migrations.sh [--remote] [--db <name>]
#
# Default DB name: merchant-db
# Default mode: local (use --remote to run against remote D1)

DB_NAME="merchant-db"
MODE="--local"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote)
      MODE="--remote"
      shift
      ;;
    --db)
      DB_NAME="$2"
      shift 2
      ;;
    --db=*)
      DB_NAME="${1#*=}"
      shift
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

MIGRATIONS_DIR="$(dirname "$0")/../migrations"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "ERROR: migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

echo "Running D1 migrations (DB=$DB_NAME, mode=$MODE)"

for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  echo "--> Applying $(basename "$f")"
  npx wrangler d1 execute "$DB_NAME" $MODE --file "$f"
done

echo "✅ All migrations applied."
