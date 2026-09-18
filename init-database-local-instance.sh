#!/bin/sh
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LARGE_SEED=""
for arg in "$@"; do
  case "$arg" in
    --large) LARGE_SEED="true" ;;
  esac
done
cleanDatabase() {
  echo "Cleaning database..."
  if [ -z "$DATABASE_URL" ]; then
    echo "DATABASE_URL is not set. Cannot clean database." >&2
    exit 1
  fi
  psql -h localhost -p 5432 postgres -U postgres -c \
    "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;"
}
main() {
  if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    . "$SCRIPT_DIR/.env"
    set +a
  fi
  cleanDatabase
  echo "Resetting and seeding the database"
  pnpm run drizzle:migrate
  if [ "$LARGE_SEED" = "true" ]; then
    echo "Seeding with LARGE dataset (1000+ entities each)..."
    LARGE_SEED=true pnpm tsx -r dotenv/config --conditions=react-server ./src/infra/database/local-seed.ts
  else
    pnpm tsx -r dotenv/config --conditions=react-server ./src/infra/database/local-seed.ts
  fi
}
main "$@"