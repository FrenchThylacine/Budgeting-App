#!/usr/bin/env bash
#
# Copy secrets from the local .env into a Vercel environment.
#
# The value is piped straight from .env into `vercel env add` — it is never
# printed, never echoed, and never passed as an argument (which would put it in
# the shell history and in `ps` output). Only variable NAMES are displayed.
#
#   ./scripts/push-env-to-vercel.sh                 # push the database vars to production
#   ./scripts/push-env-to-vercel.sh preview         # ...to preview instead
#   ./scripts/push-env-to-vercel.sh production RESEND_API_KEY CORS_ORIGIN
#
# Requires `npx vercel login` and `npx vercel link` to have been run once.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env"
TARGET="${1:-production}"
shift || true

# Default set: what the API needs to reach the database. DATABASE_URL is what
# this project documents; the others are the aliases the Neon integration
# provisions, and server/src/db/index.ts accepts any of them.
DEFAULT_VARS=(DATABASE_URL DATABASE_URL_UNPOOLED POSTGRES_URL POSTGRES_PRISMA_URL POSTGRES_URL_NON_POOLING)
VARS=("$@")
[ ${#VARS[@]} -eq 0 ] && VARS=("${DEFAULT_VARS[@]}")

[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE found in $(pwd)"; exit 1; }

if [ ! -f .vercel/project.json ]; then
  echo "This directory is not linked to a Vercel project yet."
  echo "Run:  npx vercel login  &&  npx vercel link"
  exit 1
fi

echo "Target environment: $TARGET"
echo

for name in "${VARS[@]}"; do
  # Take the last assignment wins, strip surrounding quotes, keep '=' inside the value.
  value=$(grep -E "^${name}=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")

  if [ -z "$value" ]; then
    echo "  skip   $name  (not set in $ENV_FILE)"
    continue
  fi

  # Remove first so re-running is idempotent rather than erroring on a duplicate.
  npx vercel env rm "$name" "$TARGET" --yes >/dev/null 2>&1 || true

  if printf '%s' "$value" | npx vercel env add "$name" "$TARGET" >/dev/null 2>&1; then
    echo "  ok     $name  (${#value} characters)"
  else
    echo "  FAILED $name"
  fi
done

echo
echo "Vercel injects environment variables at BUILD time, so the running"
echo "deployment will not see these until it is rebuilt. Trigger one with:"
echo
echo "    npx vercel --prod"
echo
echo "Then confirm with:"
echo
echo "    curl -s https://budgeting-app-peach-iota.vercel.app/api/health"
