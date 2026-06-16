# Opportunity Map

## Context

- **Project / context**: habitpair (`ivan-zakharanka-airhelp/habitpair`) — Makefile-driven NestJS + Vite monorepo deployed to AWS via GitHub Actions.
- **Data constraint**: Sensitive, read-only. The helper handles live AWS SSO dev-account credentials read from the local cache; it pushes only to the repo's own Actions secrets, never logs the values or passes them as process args, and writes nothing new to disk.
- **Date**: 2026-06-16

## Map

| Signal | Existing / default response | Thin complement | First useful version | Data risk | Direction if valuable |
|---|---|---|---|---|---|
| Deploying habitpair needs 3 rotating AWS SSO secrets in GitHub Actions (`AWS_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` / `_SESSION_TOKEN`); they expire ~12h, so they're re-pasted into the GitHub UI almost daily | OIDC → IAM role is the real fix but **blocked** (org can't create/change roles); `gh secret set` exists but is run by hand; `aws sso login` only refreshes the local cache | One local command that reads the fresh SSO creds and pushes the 3 values into the repo's Actions secrets — joins AWS SSO ↔ GitHub Actions | Makefile target + small script, run on demand before a CI deploy; read-only against the local SSO cache | Sensitive, read-only (stdin only, no logs, nothing persisted) | Internal tool → async/scheduled (login hook / pre-deploy guard); end-state stays OIDC if the org unblocks roles |

## Recommended First Candidate

```text
Candidate:
  make gh-sync-secrets  (infra/scripts/gh-sync-aws-secrets.sh)

Reads:
  Local AWS SSO credential cache via
  `aws configure export-credentials --profile development`
  (the session `aws sso login` already produced).

Returns:
  Sets the 3 rotating GitHub Actions repo secrets (AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN) via `gh secret set` (value piped on
  stdin). Prints only a masked confirmation + the credential expiry time.

Does not do:
  No OIDC/role setup (blocked). No scheduler/daemon yet. No web UI. Doesn't change
  the 12h expiry. Doesn't write creds to any file. Leaves the static secrets
  (GHCR_PAT, SERVER_HOST, SERVER_SSH_KEY) untouched.

Data risk:
  Sensitive, read-only. Reads only the local SSO cache; pushes to your own repo;
  values never logged, never passed as argv (stdin only), nothing persisted. If the
  SSO session is expired, it runs `aws sso login` first.

Direction if valuable:
  Internal tool → async/scheduled. End-state = OIDC if the org unblocks roles.
```

## Why This Candidate

It's the only signal here, but it passes every ranking test: it repeats daily, joins two systems (AWS SSO + GitHub Actions), has a clear manual pain today, is testable read-only on the local SSO cache, complements rather than replaces either platform, and has a clean later direction.

**Essential vs accidental complexity:** the ~12h expiry and the need to rotate *some* secret are **essential** — they follow from a real org constraint (OIDC blocked) plus AWS SSO's security model, and the helper does not pretend to remove them. What it removes is the **accidental** cost: three manual web-UI edits every morning collapse into one command.

## Next Direction If Valuable

Internal tool. The natural next step is async/scheduled execution (a login hook or a pre-deploy guard that auto-refreshes the secrets), so the human never thinks about it. The true end-state remains OIDC → IAM-role federation, which eliminates static secrets entirely — revisit if the org ever unblocks role creation.
