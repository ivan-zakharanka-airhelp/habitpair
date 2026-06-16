#!/usr/bin/env bash
#
# gh-sync-aws-secrets.sh — refresh the rotating AWS credentials in GitHub Actions.
#
# Why this exists: deploys run from GitHub Actions, which needs AWS_ACCESS_KEY_ID,
# AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN as repo secrets. These come from AWS
# SSO and expire ~12h, so they would otherwise be re-pasted into the GitHub UI by
# hand every day. OIDC -> IAM-role federation would remove static secrets entirely,
# but the org can't create the roles, so rotating the secrets is the only lever.
#
# This reads the credentials AWS SSO has already cached locally and pushes the three
# rotating values to the repo's Actions secrets. It does NOT change the ~12h expiry —
# re-run it after each `aws sso login`. Secret values are piped on stdin (never argv
# or logs) and nothing is written to disk.
#
# Usage:  make gh-sync-secrets
#         AWS_PROFILE=other REPO=owner/name bash infra/scripts/gh-sync-aws-secrets.sh

set -euo pipefail

PROFILE="${AWS_PROFILE:-development}"

# ── Colors ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
step() { echo -e "\n${BLUE}▸${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

# ── Sanity checks ──
command -v aws >/dev/null 2>&1 || fail "aws CLI not installed"
command -v gh  >/dev/null 2>&1 || fail "gh CLI not installed (brew install gh && gh auth login)"
gh auth status >/dev/null 2>&1 || fail "gh not authenticated — run: gh auth login"

REPO="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)}"
[ -n "$REPO" ] || fail "Could not determine the GitHub repo (run from inside the repo, or set REPO=owner/name)"

# ── 1. Make sure the SSO session is valid ──
step "Checking AWS SSO session for profile '$PROFILE'"
if ! aws configure export-credentials --profile "$PROFILE" >/dev/null 2>&1; then
  warn "No valid credentials for '$PROFILE' — launching 'aws sso login'"
  aws sso login --profile "$PROFILE"
fi

# ── 2. Read the freshly-cached credentials (env format keeps '=' in token values) ──
step "Reading credentials from the local SSO cache"
creds="$(aws configure export-credentials --profile "$PROFILE" --format env-no-export)" \
  || fail "Failed to export credentials for profile '$PROFILE'"

extract() {  # extract KEY from the env block, preserving any '=' inside the value
  local line
  line="$(printf '%s\n' "$creds" | grep "^$1=" || true)"
  printf '%s' "${line#"$1"=}"
}
AWS_ACCESS_KEY_ID="$(extract AWS_ACCESS_KEY_ID)"
AWS_SECRET_ACCESS_KEY="$(extract AWS_SECRET_ACCESS_KEY)"
AWS_SESSION_TOKEN="$(extract AWS_SESSION_TOKEN)"
AWS_CREDENTIAL_EXPIRATION="$(extract AWS_CREDENTIAL_EXPIRATION)"

[ -n "$AWS_ACCESS_KEY_ID" ]     || fail "AWS_ACCESS_KEY_ID missing from export"
[ -n "$AWS_SECRET_ACCESS_KEY" ] || fail "AWS_SECRET_ACCESS_KEY missing from export"
[ -n "$AWS_SESSION_TOKEN" ]     || fail "AWS_SESSION_TOKEN missing — profile '$PROFILE' has no temporary session (is it an SSO profile?)"

# ── 3. Push to GitHub Actions secrets (value piped on stdin, never argv) ──
step "Setting rotating AWS secrets on $REPO"
set_secret() { printf '%s' "$2" | gh secret set "$1" --repo "$REPO"; }
set_secret AWS_ACCESS_KEY_ID     "$AWS_ACCESS_KEY_ID"
set_secret AWS_SECRET_ACCESS_KEY "$AWS_SECRET_ACCESS_KEY"
set_secret AWS_SESSION_TOKEN     "$AWS_SESSION_TOKEN"
ok "Updated AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_SESSION_TOKEN"

# ── 4. Summary ──
echo
if [ -n "$AWS_CREDENTIAL_EXPIRATION" ]; then
  ok "Credentials valid until $AWS_CREDENTIAL_EXPIRATION"
  warn "Re-run 'make gh-sync-secrets' after your next 'aws sso login' — they expire then."
else
  warn "Could not read the expiry; re-run after your next 'aws sso login'."
fi
