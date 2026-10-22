#!/usr/bin/env bash
# Makes sure the Cloudflare Pages project that serves the city tiles exists,
# creating it on the first run, and prints its address. The City tiles
# workflow runs this before its long build, so a wrong token or account id
# fails within seconds instead of after an hour of building.
#
# Environment: CLOUDFLARE_API_TOKEN (permission Account → Cloudflare Pages →
# Edit), CLOUDFLARE_ACCOUNT_ID, CF_PAGES_PROJECT (default geolausanne-city).
set -euo pipefail

project="${CF_PAGES_PROJECT:-geolausanne-city}"
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "::error::The repository secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are not set (see docs/operations/deployment.md). Run with deploy unchecked to build without publishing."
  exit 1
fi

api="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects"
body=$(mktemp)
# prints the HTTP status and keeps Cloudflare's JSON answer in $body
cf() {
  curl --silent --show-error --max-time 60 --output "$body" --write-out '%{http_code}' \
    --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$@"
}

status=$(cf "$api/$project")
# 8000007: "Project not found"
if [ "$status" = 404 ] || jq -e '(.errors // []) | any(.code == 8000007)' "$body" > /dev/null 2>&1; then
  echo "No Pages project \"$project\" yet: creating it (production branch main)."
  status=$(cf --request POST --header "Content-Type: application/json" \
    --data "$(jq -n --arg name "$project" '{name: $name, production_branch: "main"}')" "$api")
fi
if ! jq -e '.success == true' "$body" > /dev/null 2>&1; then
  echo "::error::Cloudflare refused the Pages project \"$project\" (HTTP $status): $(jq -c '.errors // .' "$body" 2> /dev/null || head -c 300 "$body"). Check that CLOUDFLARE_API_TOKEN has the permission Account → Cloudflare Pages → Edit and that CLOUDFLARE_ACCOUNT_ID is the id of that same account."
  exit 1
fi

subdomain=$(jq -r '.result.subdomain // empty' "$body")
echo "Pages project \"$project\" is ready${subdomain:+: https://$subdomain}"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ] && [ -n "$subdomain" ]; then
  {
    echo "### City address"
    echo
    echo "Once this run has published the tiles, the site reads them from \`NEXT_PUBLIC_CITY_BASE_URL=https://$subdomain\`"
    echo "(Vercel → Settings → Environment Variables, Production; redeploy after changing it)."
  } >> "$GITHUB_STEP_SUMMARY"
fi
