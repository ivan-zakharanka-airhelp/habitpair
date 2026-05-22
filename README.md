# habitpair

A habit-tracking app — a full-stack learning project exercising production patterns end-to-end at small scale: two NestJS services on k3s, a Vite/React SPA on S3 + CloudFront, infra-as-code with Terraform, Traefik ingress with Let's Encrypt, per-service path-filtered CI/CD.

Live at [habitpair.com](https://habitpair.com); APIs at [api.habitpair.com/api/auth/health](https://api.habitpair.com/api/auth/health) and [api.habitpair.com/api/habits/health](https://api.habitpair.com/api/habits/health).

## How it works

Two NestJS services — `auth-api` and `habits-api` — backed by one RDS PostgreSQL with two logical databases (`auth`, `habits`), one per service. A Vite/React SPA consumes both APIs through a shared ingress prefix (`/api/auth/...` and `/api/habits/...`).

In production: a single AWS EC2 `t4g.small` (~$12/mo) running k3s with Traefik ingress + Let's Encrypt; RDS `db.t4g.micro` (~$13/mo); the SPA served from S3 behind CloudFront. Locally: same NestJS apps and same kustomize manifests, against either Docker Compose Postgres or a k3d cluster.

## Local development

Two modes — pick one.

### Mode 1 — Local dev (recommended, fastest feedback)

NestJS apps run directly on the host, Postgres runs in Docker Compose. File changes hot-reload instantly — no container rebuilds.

**Prerequisites:**

- Node.js 22 (see [`.nvmrc`](.nvmrc))
- Docker + Docker Compose (Docker Desktop or Colima on macOS)
- npm (ships with Node)

**Env files:** `make setup` copies `apps/web/.env.example` → `apps/web/.env` automatically. The two services read their `.env.example` directly if `.env` is missing — both default to local Postgres on port 5434 with the same dev `JWT_SECRET`. You only need to edit them to override defaults.

```bash
make setup     # one-time: install deps, start Postgres, generate Prisma clients, run migrations
make up        # daily: Postgres + auth-api + habits-api + Vite SPA, all in one foreground process
make down      # stop containers
```

**Ports:**

| Service | URL |
|---|---|
| auth-api | http://localhost:3000 (health at `/auth/health`) |
| habits-api | http://localhost:3001 (health at `/habits/health`) |
| web SPA | http://localhost:5173 |
| Postgres | localhost:5434 (user `dev`, pass `dev`, DBs `auth` + `habits`) |

### Mode 2 — Local Kubernetes via k3d (optional)

For testing the K8s manifests themselves — ingress routes, probes, resource limits, anything that only shows up under K8s. Skaffold rebuilds + redeploys both services on file change.

**Additional prerequisites on top of Mode 1:**

- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- [k3d](https://k3d.io)
- [Skaffold](https://skaffold.dev)

```bash
make k8s-setup   # one-time: creates k3d cluster named "habitpair" (ingress on 8080/8443)
make k8s         # daily: skaffold dev --port-forward → auth on 3000, habits on 3001
```

Skaffold uses the `infra/k8s/overlays/local` kustomize overlay. Service ports forward to the same host ports as Mode 1, so the SPA configuration (`VITE_AUTH_API_URL` / `VITE_HABITS_API_URL`) doesn't need to change.

## Deployment to AWS

Two stages: provision infra once, then deploy app images on every release.

### Prerequisites

- AWS CLI with `AWS_PROFILE=development` configured for SSO (run `aws sso login --profile development` if the session expired)
- Terraform >= 1.6
- kubectl
- Docker with arm64 builder (production runs on Graviton)
- SSH keypair at `~/.ssh/aws_learning_ed25519` (+ `.pub`) — Terraform imports the public half to EC2
- Cloudflare API token with **`Zone:DNS:Edit`** on `habitpair.com` — create at https://dash.cloudflare.com/profile/api-tokens
- The AirHelp `development` AWS account, which has the pre-existing VPC + subnets Terraform expects

### One-time setup

1. **Copy the Terraform vars template:**

   ```bash
   cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
   ```

   The only **required** value is `cloudflare_api_token`. Everything else (`region`, `owner_email`, `project_name`, `ssh_public_key_path`, …) has a working default in [`variables.tf`](infra/terraform/variables.tf) — uncomment and override only if you need to.

2. **Export credentials:**

   ```bash
   export AWS_PROFILE=development
   export TF_VAR_cloudflare_api_token=<your-cloudflare-token>
   ```

   `TF_VAR_*` env vars override anything in `terraform.tfvars`, so the token never has to land in a file.

3. **Provision everything with one command:**

   ```bash
   make aws-up
   ```

   This runs `terraform apply` followed by [`infra/scripts/aws-bootstrap.sh`](infra/scripts/aws-bootstrap.sh), which:
   - Creates EC2 + Elastic IP + security groups + RDS + S3 + CloudFront + ACM cert + Cloudflare DNS
   - Waits for cloud-init to signal k3s readiness
   - Merges the cluster's kubeconfig into `~/.kube/config` as context `aws-k3s`
   - SSHes to EC2 to create the `habits` database alongside the default `auth`
   - Creates K8s Secrets (`db-credentials`, `habits-db-credentials`, `auth-jwt-secret`)
   - Applies the `infra/k8s/overlays/aws` kustomize overlay

4. **Configure GitHub Actions secrets** (required for CI deploys to work). In **Settings → Secrets and variables → Actions** of the repo, add these four secrets manually:

   | Name | Source |
   |---|---|
   | `GHCR_PAT` | Personal Access Token with `write:packages` (push images to GHCR) |
   | `AWS_ACCESS_KEY_ID` | Your AWS SSO short-lived credentials |
   | `AWS_SECRET_ACCESS_KEY` | Your AWS SSO short-lived credentials |
   | `AWS_SESSION_TOKEN` | Your AWS SSO short-lived credentials |

   The remaining values (`SERVER_HOST`, `SERVER_SSH_KEY`, `WEB_BUCKET_NAME`, `WEB_DISTRIBUTION_ID`) are written automatically by `make aws-up` via the `gh` CLI.

5. **Make the GHCR packages public.** After the first image push, two packages appear at `ghcr.io/<owner>/habitpair/auth-api` and `ghcr.io/<owner>/habitpair/habits-api`. Open each in GitHub → **Package settings → Change visibility → Public**. k3s on the EC2 instance pulls anonymously, so private packages cause `ImagePullBackOff`.

### Deploy app images

Once `make aws-up` is green, deploy services:

```bash
make aws-deploy           # all three (auth + habits + web)
make aws-deploy-auth      # auth-api only (docker build → GHCR → kubectl rollout)
make aws-deploy-habits    # habits-api only
make aws-deploy-web       # SPA only (vite build → S3 sync → CloudFront invalidation)
```

Or merge to `main` and let GitHub Actions handle it (workflows are path-filtered — only the touched service redeploys).

### Status, SSH, teardown

```bash
make aws-status   # terraform outputs + pod status
make aws-ssh      # SSH into the EC2 instance
make aws-down     # destroys everything (prompts for confirmation; deletes RDS data)
```

### Common gotchas

- **`Error: failed to create resource: …` from Cloudflare provider** — `TF_VAR_cloudflare_api_token` not exported, or the token lacks `Zone:DNS:Edit`.
- **`UnauthorizedOperation` from AWS** — SSO session expired. Run `aws sso login --profile development`.
- **Bootstrap hangs on `kubectl get nodes`** — your public IP changed since the security group was created. Re-run `make aws-up`; Terraform picks up the new IP via `checkip.amazonaws.com`.
- **`/api/auth/health` returns 404 right after `aws-up`** — Let's Encrypt cert still issuing. Wait ~60s; check `kubectl --context aws-k3s logs -n kube-system -l app.kubernetes.io/name=traefik` if it persists.

Deeper Terraform reference (failure modes, OIDC migration, remote-state migration, teardown verification) lives in [`infra/terraform/README.md`](infra/terraform/README.md).

## Command reference

Run `make help` to see all targets. Summary:

**Local dev**

| Command | Description |
|---|---|
| `make setup` | First-time setup: install deps + Prisma clients + Postgres + `.env` files |
| `make up` | Postgres + both APIs + web SPA in one foreground process |
| `make web` | Web SPA only (no DB, no API) |
| `make down` | Stop local services |
| `make db-up` | Start Postgres (creates `auth` + `habits` on first boot) |
| `make db-migrate` / `make db-migrate-habits` | Run Prisma migrations per service |
| `make db-studio` | Open Prisma Studio (auth-api by default — change the `-w` flag for habits) |
| `make build` / `make lint` / `make test` | All apps |

**Local K8s (k3d, optional)**

| Command | Description |
|---|---|
| `make k8s-setup` | Create k3d cluster |
| `make k8s` | Start Skaffold dev loop against k3d (builds both service images, port-forwards) |

**AWS deploy**

| Command | Description |
|---|---|
| `make aws-up` | Terraform apply + k3s bootstrap (creates both DBs + all K8s secrets) + sync GH Actions vars |
| `make aws-deploy` | Build + push + roll out both backends and the frontend |
| `make aws-deploy-auth` | auth-api only (Docker → GHCR → kubectl) |
| `make aws-deploy-habits` | habits-api only |
| `make aws-deploy-web` | Frontend only (Vite build → S3 sync → CloudFront invalidate) |
| `make aws-status` | Terraform outputs + pod status |
| `make aws-ssh` | SSH into the current EC2 instance |
| `make aws-down` | Destroy everything (prompts for confirmation) |

## Adding a new service

1. Create `apps/<service-name>/` as a NestJS app (`@habitpair/<service-name>`) — mirror `apps/habits-api/` for structure (Prisma per service, `JwtGuard` if it serves authenticated users)
2. Set `app.setGlobalPrefix('<service-name>')` in `main.ts` so its URLs become `/api/<service-name>/...`
3. Add `prisma/schema.prisma` with `output = "../generated/prisma"` (avoids hoist conflicts), then create a new database for it in [`aws-bootstrap.sh`](infra/scripts/aws-bootstrap.sh) + [`infra/docker/init-databases.sql`](infra/docker/init-databases.sql)
4. Add K8s manifests in [`infra/k8s/base/`](infra/k8s/base/), register them in `kustomization.yaml`, add an ingress route ahead of the catch-all
5. Add the image mapping in [`infra/k8s/overlays/aws/kustomization.yaml`](infra/k8s/overlays/aws/kustomization.yaml)
6. Add a path-filtered workflow in [`.github/workflows/<service-name>-ci.yaml`](.github/workflows/)
7. Add a Skaffold artifact + port-forward in [`skaffold.yaml`](skaffold.yaml)

## Tools we use (and why)

Grouped by where they run.

### Shared across all environments

| Tool | Purpose | Why this one |
|---|---|---|
| **make** | Single entry point for every workflow (`make up`, `make k8s`, `make aws-up`, …) | One command set instead of "remember which npm/docker/kubectl/terraform incantation goes where" |
| **npm workspaces** | Monorepo for `apps/*` (auth-api, habits-api, web) | Built into npm, no extra tooling; each service is still independently buildable |
| **NestJS 11** | Backend framework for both services | Module system + DI; bundled `terminus` (health probes) module fits K8s probes cleanly |
| **Prisma 6** | ORM + migrations, **per service** | Type-safe queries; `output` path keeps each service's generated client isolated (no hoist conflicts) |
| **Vite + React 18** | Frontend SPA | Fast dev server, static output → trivial to host on S3 + CloudFront |
| **kustomize** | K8s manifests with base + overlays (`local/`, `aws/`) | Same base manifests in dev and prod; only env-specific patches differ |

### Local development only

| Tool | Purpose | Why this one |
|---|---|---|
| **Docker Compose** | Local Postgres in dev | Reproducible DB without polluting the host; one `pgdata` volume across both DBs |
| **k3d** | Local Kubernetes cluster (k3s in Docker) | Same Traefik + ingress behavior as prod, runnable on a MacBook |
| **Skaffold** | Watch-build-deploy loop for k3d | Auto-rebuilds + redeploys on file changes; one config drives both services |

### Production / deployment only

| Tool | Purpose | Why this one |
|---|---|---|
| **Terraform** | AWS + Cloudflare infrastructure as code | One `make aws-up` provisions EC2, RDS, S3, CloudFront, ACM, DNS, IAM |
| **k3s** | Kubernetes distribution on EC2 | Single binary (~512 MB RAM), CNCF-certified, Traefik bundled — fits a `t4g.small` |
| **Traefik** (bundled with k3s) | Ingress + TLS | Automatic Let's Encrypt cert issuance; path-prefix routing per service |
| **GitHub Actions** | CI/CD, path-filtered per service | A change to `apps/auth-api/**` only triggers auth-api's pipeline — others stay green |
