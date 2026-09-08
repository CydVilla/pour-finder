#!/usr/bin/env bash
#
# One command to point a fresh deployment at its database.
#
#   npm run setup:prod
#
# Logs in to Vercel if needed, links the project, pulls the production
# environment into a gitignored file, then validates, migrates and seeds.
# The connection string is never printed and never has to be copied by hand.
set -euo pipefail

BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; RED=$'\033[31m'; RESET=$'\033[0m'
step() { printf '\n%s==> %s%s\n' "$BOLD" "$1" "$RESET"; }
fail() { printf '\n%s✗ %s%s\n' "$RED" "$1" "$RESET"; exit 1; }

step "1/5  Vercel account"
if npx --yes vercel whoami >/dev/null 2>&1; then
  printf '%s     already signed in as %s%s\n' "$DIM" "$(npx --yes vercel whoami 2>/dev/null | tail -1)" "$RESET"
else
  echo "     Opening a browser to sign in…"
  npx --yes vercel login || fail "Vercel login failed."
fi

step "2/5  Link this folder to the Vercel project"
if [ -f .vercel/project.json ]; then
  printf '%s     already linked%s\n' "$DIM" "$RESET"
else
  npx --yes vercel link --yes || fail "Could not link the project. Run 'npx vercel link' and pick pour-finder."
fi

step "3/5  Pull the production environment"
npx --yes vercel env pull .env.production.local --environment=production --yes \
  || fail "Could not pull environment variables."
grep -q '^DATABASE_URL=' .env.production.local \
  || fail "DATABASE_URL is not set in the Vercel project. Connect a database under Storage first."
printf '%s     wrote .env.production.local (gitignored)%s\n' "$DIM" "$RESET"

step "4/5  Check the connection"
npm run --silent db:check:prod || fail "Could not reach the database. See the message above."

step "5/5  Create the schema and load the Massachusetts data"
npm run --silent db:push:prod || fail "Migration failed."
npm run --silent db:seed:prod || fail "Seeding failed."

printf '\n%s✓ Done.%s Your site should now be showing deals.\n' "$GREEN" "$RESET"
printf '  Verify: %scurl -s "$(grep -m1 NEXT_PUBLIC_SITE_URL .env.production.local | cut -d= -f2- | tr -d \\"'"'"')/api/deals?state=MA&limit=1"%s\n' "$DIM" "$RESET"
