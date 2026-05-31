---
project: habitpair
researched_at: 2026-05-25
recommended_platform: AWS (EC2 + k3s + RDS + S3/CloudFront)
runner_up: Railway
context_type: mvp
tech_stack:
  language: TypeScript
  framework: NestJS 11 (backends) + React 19 + Vite 8 (frontend)
  runtime: Node 22 on Docker (linux/arm64, Graviton)
  database: PostgreSQL 16 (one instance, two logical DBs)
---

## Recommendation

**Deploy on AWS — keep the existing EC2 + k3s + RDS + S3/CloudFront shape.**

The platform is the user's explicit choice and is already operational in [infra/terraform/](infra/terraform/) and [infra/k8s/](infra/k8s/). By the five agent-friendly criteria alone, AWS scored lowest in the candidate pool (Railway and Render score higher) because EC2 + self-managed k3s is the "requires caution" pattern in `references/agent-friendly-criteria.md` — raw VMs + DIY Kubernetes shift OS patching, TLS renewal, kubeconfig drift, and image-pull configuration onto the developer (and agent). The decision is defensible for reasons the criteria don't measure: this is a learning project where the operational complexity *is* the value, the Terraform + k3s investment is already sunk, and the ~$25/mo monthly cost is competitive with Railway/Render once Postgres is included. The risk register below records every foot-gun the cross-check surfaced so the team isn't surprised by them in month two.

## Platform Comparison

Hard filter applied before scoring: Cloudflare Workers, Vercel functions, and Netlify functions were dropped because they cannot host NestJS 11 (V8-isolate runtime incompatible with `reflect-metadata` + decorator-driven DI; serverless function timeouts incompatible with long-lived NestJS HTTP servers). The four container-runtime candidates that *can* run NestJS in Docker:

| Criterion | AWS (EC2+k3s) | Fly.io | Railway | Render |
|---|---|---|---|---|
| 1. CLI-first maintenance | Pass | Pass | Pass | Pass |
| 2. Managed / serverless over raw infra | **Fail** | Pass | Pass | Pass |
| 3. Agent-accessible documentation | Partial | Partial | **Pass** | Partial |
| 4. Stable, scriptable deploy API | Pass | Pass | Pass | Pass |
| 5. MCP / first-class integration | Pass (region-limited) | Partial (experimental) | Pass | Pass |
| **Raw score** | 3 Pass + 1 Partial + 1 Fail | 3 Pass + 2 Partial | **5 Pass** | 4 Pass + 1 Partial |
| Cost at MVP scale | ~$25/mo | ~$13–58/mo | ~$10–20/mo | ~$21–34/mo |
| MCP status (May 2026) | **GA** (us-east-1 + eu-central-1 only) | **Experimental** | **GA** | **GA** (since Aug 2025) |

### Shortlisted Platforms

#### 1. AWS — Chosen

EC2 t4g.small (~$12/mo) + k3s + Traefik + RDS db.t4g.micro (~$13/mo) + S3 + CloudFront, all Terraform-managed and already operational. Node 22 + arm64 (Graviton) is mature and uncontroversial. The AWS MCP Server is GA as of 2026-05-06 (us-east-1 and eu-central-1 only) — agent-readable via MCP rather than via raw markdown URLs (AWS docs remain JS-rendered with no `llms.txt`). Scores lowest on the agent-friendly criteria specifically because EC2 + self-managed k3s places TLS renewal, kubeconfig drift, image-pull configuration, and cluster upgrades on the developer rather than the platform.

#### 2. Railway — Runner-up if AWS is rejected later

Five passes against the criteria. Only platform in the pool with `railway.com/llms.txt` and a public GitHub docs mirror (`github.com/railwayapp/docs`) — every doc page is reachable as raw markdown by appending `.md`. Railway MCP server is GA with destructive operations excluded by design (a security-by-default win). `$5/mo` Hobby base + usage ≈ $10–20/mo total for 2 services + Postgres at this scale. Caveats: private network is IPv6-only (NestJS must bind to `::` for inter-service calls), and the current `auth` + `habits` logical-DB split would need either two Postgres services (~2× DB cost) or manual `psql` to create the second database.

#### 3. Render — Third by criteria

Five-tool managed PaaS: Web Services, Background Workers, Postgres, Valkey, Cron. Official Render CLI v2.17.0 went GA on 2026-05-13, closing the long-standing "Render has no CLI" gap. MCP server GA since August 2025 with 20+ tools (deploy, scale, restart, query DB, fetch logs/metrics). Realistic cost ~$21–34/mo for 2 Starter Web Services + Basic Postgres. Docs are not in markdown/llms.txt form, and env-var changes do not auto-trigger redeploy — both real friction points for agent-driven work.

## Anti-Bias Cross-Check: AWS (EC2 + k3s shape)

### Devil's Advocate — Specific Weaknesses

1. **Single-VM, single-AZ, single-instance = single point of failure.** The whole backend lives on one EC2 instance; RDS is single-AZ. Reboot, AWS hardware-refresh retirement, or a failed k3s upgrade takes auth + habits down simultaneously. "Running on AWS" doesn't mean enterprise reliability — it means running on a $12/mo VM with $12/mo VM resilience.
2. **Let's Encrypt `acme.json` lives on the EC2 host's local disk.** If the instance is replaced (EIP swap, AMI bump, `terraform destroy` + apply), the cert store is gone and Traefik re-requests every certificate. Let's Encrypt enforces 5 duplicate certs per registered domain per week — a debug loop can lock you out of TLS for hours. k3s + Traefik defaults aren't engineered for survival; cert-manager + PVC-backed storage is the production answer.
3. **k3s upgrades are a manual, agent-hostile operation.** Single-node cluster with no rolling-update story. Kubernetes API deprecations, Traefik 2 → 3 transitions, and k3s CVE patches all require planned downtime and an in-place upgrade. The agent cannot perform this safely; Railway/Render handle equivalent work transparently.
4. **GHCR public-package requirement contradicts "private app."** [README.md](README.md) explicitly directs the operator to make GHCR packages public so k3s can pull anonymously. Application images — containing Prisma schemas, NestJS route shapes, and env-reading code paths — are world-readable. The fix (k8s `imagePullSecrets` + a long-lived GHCR token) is non-trivial on k3s and currently not in place.
5. **AWS MCP server is region-limited and `call_aws`-shaped.** GA only in us-east-1 and eu-central-1 (May 2026); functionally a typed `aws cli` shim rather than domain-aware deploy tools. Compared to Railway's MCP — which exposes `services_list`, `env_set`, `logs_fetch` as named operations — AWS MCP requires the agent to already know which AWS API to call.

### Pre-Mortem — How This Could Fail at Month 6

The team treated "small EC2 + Terraform" as production-grade because the README looked professional and CI workflows ran green. In month 2, AWS sent a scheduled hardware-refresh notice that was ignored ("k3s will just come back up"). It didn't: cloud-init wrote a new SSH host fingerprint, GitHub Actions deploys broke because the `SERVER_HOST` secret pointed at the old EIP that AWS auto-released after retirement. Two days of habit marks were lost because RDS automated backups defaulted to the 7-day retention window and a Prisma `NOT NULL` migration in month 3 silently truncated a foreign-key column. The Let's Encrypt cert expired during the EIP swap because `acme.json` was on local disk — `api.habitpair.com` served TLS warnings for 48 hours until someone realized cert-manager was never installed. The real cost wasn't $25/mo; it was ~40 hours of debugging per quarter. The team migrated to Railway in month 7. Wall-clock loss: six months of operational toil the product never benefited from.

### Unknown Unknowns

- **Free-tier hours are per-account, not per-project.** If this AWS account hosts other experiments, t4g free-tier hours silently exhaust mid-month and EC2 jumps to ~$8/mo. RDS free tier ends at month 13 — the bill grows ~$13/mo without warning. *(Status checked 2026-05-25: t4g free tier extended through 2026-12-31.)*
- **Three TLS surfaces, two DNS hosts, no single source of truth.** Cloudflare DNS + ACM certs (for CloudFront/HTTPS to S3) + Let's Encrypt (Traefik on EC2 for `api.habitpair.com`). When a renewal fails, the operator has to diagnose which of the three certificate stores broke. The README does not document this layered cert story.
- **Terraform state lives locally.** Confirmed by inspection: [infra/terraform/terraform.tfstate](infra/terraform/terraform.tfstate) is committed/local. No remote backend is configured. Laptop dies → AWS resources orphaned → `terraform destroy` cannot see them. Fixable with an `s3` backend, but invisible until it bites.
- **arm64 cross-build is host-arch-dependent.** `docker build --platform linux/arm64` on an Intel Mac triggers qemu emulation — 10–20× slower than native. GitHub Actions runners are x86, so CI builds also pay this cost silently. Local M-series builds finish in 30s; CI builds can take 5–10 min with no warning.
- **`JWT_SECRET` lives in three places.** The k8s Secret `auth-jwt-secret`, the local `.env` files in `apps/*-api/`, and (if CI is wired) GitHub Actions Secrets. Rotation requires lockstep updates; `aws-bootstrap.sh` writes only the k8s Secret. Rotate one and dev or prod breaks — operator picks which.

## Operational Story

How AWS + k3s actually operates day-to-day. One concrete answer per axis.

- **Preview deploys.** None. The current GitHub Actions workflows in [.github/workflows/](.github/workflows/) are path-filtered per app and deploy only on push to `main`. Pull requests run `*-test.yaml` (lint + Jest with a real Postgres 16 service container) but do not produce preview URLs. Adding preview deploys means either standing up a second k3s node per branch (expensive on a `t4g.small`) or migrating that piece to Cloudflare Pages for the SPA only. Not in scope for MVP.
- **Secrets.** Three storage locations: (a) **k8s Secrets** (`db-credentials`, `habits-db-credentials`, `auth-jwt-secret`) — created by [`infra/scripts/aws-bootstrap.sh`](infra/scripts/aws-bootstrap.sh) on first apply, in the `habitpair` namespace. (b) **GitHub Actions Secrets** — `GHCR_PAT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, plus `SERVER_HOST`, `SERVER_SSH_KEY`, `WEB_BUCKET_NAME`, `WEB_DISTRIBUTION_ID` (the last four are written by `make aws-up` via `gh` CLI). (c) **`TF_VAR_cloudflare_api_token`** — env var only; never written to a file. Rotation flow is not automated — rotating `JWT_SECRET` or DB credentials means manually updating k8s Secret + local `.env` + GitHub Secrets, then rolling deployments.
- **Rollback.** Per-service via kubectl: `kubectl --context aws-k3s -n habitpair rollout undo deployment/auth-api` (or `habits-api`). Frontend rollback is "re-build a prior commit and re-run `make aws-deploy-web`" — there's no atomic CloudFront rollback because S3 sync overwrites in place. Time-to-revert for a backend: under 30s. For the SPA: as long as the Vite build takes (~1 min) plus CloudFront invalidation propagation (~1–5 min). DB migrations do not roll back automatically — Prisma migrations are forward-only; reverting a migration requires writing the inverse SQL by hand.
- **Approval.** Currently none. Merging to `main` auto-deploys both backends and the SPA. Destructive operations are gated by being manual-only: `terraform destroy` (gated by `make aws-down` prompt), RDS schema changes (manual `psql`), GHCR package deletion (manual). Adding a GitHub Environment with required reviewers would shift deploy-to-prod behind a human gate; not in place today.
- **Logs.** Runtime logs (backends): `kubectl --context aws-k3s -n habitpair logs deployment/auth-api --tail=200 -f`. Same for `habits-api`. Build/deploy logs: GitHub Actions UI per workflow run. Ingress logs: `kubectl --context aws-k3s logs -n kube-system -l app.kubernetes.io/name=traefik`. RDS logs: AWS Console (CloudWatch Logs) — not piped into k8s. No centralized log aggregation; an agent investigating an issue across all four layers reads four different streams.

## Risk Register

Every risk traced back to the lens that surfaced it. Likelihood = chance over a 6-month MVP window; Impact = severity if it lands.

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Single EC2 instance retirement / hardware refresh takes prod down | Pre-mortem | M | H | Enable AWS retirement notifications via SNS; document a recovery runbook; consider an ASG of size 1 so AWS replaces the instance automatically |
| Let's Encrypt cert lost on EIP swap; rate-limit lockout | Devil's advocate #2 | M | H | Replace Traefik default cert store with cert-manager + a `PersistentVolumeClaim`-backed store; alternatively, move TLS termination to CloudFront for the API as well |
| k3s in-place upgrade fails on single-node cluster | Devil's advocate #3 | L | H | Pin k3s version explicitly in [`cloud-init.yaml`](infra/terraform/cloud-init.yaml); test upgrades on a separate `make k8s` k3d cluster before applying to prod; keep `aws-bootstrap.sh` idempotent so a re-bootstrap is a real recovery path |
| Public GHCR packages leak app source structure | Devil's advocate #4 | H (already true) | M | Either accept the exposure (acceptable for a learning project) or configure `imagePullSecrets` on the deployments and switch GHCR packages to private; document the choice |
| AWS MCP region limit confuses agent operations from EU | Devil's advocate #5 | L | L | Pin MCP server to us-east-1 explicitly in agent config; tolerate the cross-region call latency for the MVP |
| Local Terraform state lost when laptop dies | Unknown unknowns #3 | L | H | Configure `terraform { backend "s3" { ... } }` against an S3 bucket + DynamoDB lock table created out-of-band; do this before the next non-trivial infra change |
| Three-surface TLS cert renewal failure goes undiagnosed | Unknown unknowns #2 | M | M | Add a `make aws-status` extension that hits `https://habitpair.com` and `https://api.habitpair.com/api/auth/health` and reports cert expiry days remaining; runs after every deploy |
| RDS automated backup retention default (7 days) too short for slow-to-discover data loss | Pre-mortem | L | H | Bump RDS backup retention to 14–30 days in [`infra/terraform/rds.tf`](infra/terraform/rds.tf); add `--preview` flag review for Prisma migrations affecting NOT-NULL columns |
| Free-tier expiry triggers unexpected bill | Unknown unknowns #1 | M | L | Set an AWS Budgets alert at $40/mo; review free-tier usage in AWS Billing once per quarter |
| arm64 cross-build slow on x86 GHA runners | Unknown unknowns #4 | H (already true) | L | Use `docker/setup-buildx-action` with `linux/arm64` only (not multi-arch) to avoid wasted x86 builds; consider GHA arm64 runners (~$$) if build time becomes a bottleneck |
| `JWT_SECRET` rotation drift between k8s / `.env` / GHA Secrets | Unknown unknowns #5 | M | H | Document a single rotation runbook; consider AWS Secrets Manager + External Secrets Operator on k3s to centralize the source of truth |
| Cross-DB Prisma migration silently truncates a column | Pre-mortem | L | H | Enforce `prisma migrate dev --create-only` for any migration touching existing columns; PR review checklist for NOT-NULL additions on populated tables |
| RDS single-AZ failure takes prod offline | Devil's advocate #1 | L | H | Acceptable for MVP. If the project leaves MVP scope, enable Multi-AZ (~2× RDS cost) before that transition |

## Getting Started

The project is already deployed — these are the day-to-day commands an agent or developer needs, validated against the actual Makefile targets and stack versions in this repo (Node 22, Terraform 1.6+, k3s pinned by cloud-init, AWS provider v5/v6 — confirm with `terraform version` before any apply).

1. **Confirm credentials are live.** Run `aws sts get-caller-identity --profile development`. If the SSO token expired, `aws sso login --profile development`. Cloudflare token belongs in `TF_VAR_cloudflare_api_token` (env var, never in the file).
2. **Check current state.** `make aws-status` runs `terraform output` + `kubectl --context aws-k3s -n habitpair get pods` and reports both. Use this first when anything looks off.
3. **Deploy a backend change.** `make aws-deploy-auth` (or `make aws-deploy-habits`). The target builds a `linux/arm64` Docker image, pushes to GHCR, and runs `kubectl set image` + `kubectl rollout status` on the AWS context. The frontend uses `make aws-deploy-web` (Vite build → S3 sync → CloudFront invalidation).
4. **Tail logs.** `kubectl --context aws-k3s -n habitpair logs deployment/auth-api --tail=200 -f` for runtime; GitHub Actions UI for build/deploy.
5. **Rollback.** `kubectl --context aws-k3s -n habitpair rollout undo deployment/auth-api` reverts to the previous ReplicaSet. For the SPA, re-run `make aws-deploy-web` from an earlier commit.
6. **Migrate the DB.** Local first: `npm run migrate -w @habitpair/auth-api` (and `-habits`). Production migrations run as part of the deploy workflow against RDS — confirm in `.github/workflows/<service>-deploy.yaml`.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration (Dockerfiles exist per service; not part of this decision)
- CI/CD pipeline tuning (path-filtered GHA workflows exist and are out of scope here)
- Production-scale architecture (multi-AZ RDS, multi-node k3s cluster, blue/green deploys, disaster recovery) — explicit MVP scope per the PRD's `target_scale: medium-users / low-qps / small-data`
- Migration off EC2 + k3s to AWS App Runner, ECS Fargate, or EKS (would address Devil's-advocate #1 and #3; possible v2 workstream)
