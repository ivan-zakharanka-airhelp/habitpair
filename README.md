# habitpair

A habit-tracking app — full-stack learning project. The point isn't the app itself; it's exercising production patterns end-to-end at small scale: NestJS backend on k3s, Vite/React SPA on S3 + CloudFront, infra as code with Terraform, Traefik ingress with Let's Encrypt, path-filtered CI/CD per concern.

**Learning goals:** full Kubernetes deployment lifecycle, CI/CD pipelines, Traefik ingress with TLS, kustomize overlays, S3+CloudFront SPA hosting, IAM/OIDC trust, Cloudflare DNS via Terraform — exercised against a realistic application (auth with JWT, refresh token rotation, OAuth eventually).

Live at [habitpair.com](https://habitpair.com); API at [api.habitpair.com/api](https://api.habitpair.com/api). See [docs/Architecture.md](docs/Architecture.md) for the full design document and [docs/Infra.md](docs/Infra.md) for the infra notes.

## Stack

- **Backend:** Node.js 22 + TypeScript 5.x + NestJS 11
- **Frontend:** Vite + React 18 + TanStack Router/Query + Tailwind v4
- **Data:** PostgreSQL 16 + Prisma 6
- **Infra:** Docker, k3s (prod on AWS EC2), k3d (local K8s), Skaffold, kustomize, Terraform
- **CDN/DNS:** AWS S3 + CloudFront for the SPA, Cloudflare for DNS, Let's Encrypt for the API cert
- **CI/CD:** GitHub Actions, path-filtered per concern (auth-api / web / infra)

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- Docker and Docker Compose (Docker Desktop or Colima on macOS)
- kubectl (for K8s deployment)
- k3d (optional, for local K8s testing)
- Skaffold (optional, for K8s dev loop)

## Quick Start

```bash
# First-time setup (installs deps, starts Postgres, runs migrations,
# copies apps/web/.env.example → apps/web/.env)
make setup

# Daily development (Postgres + auth-api + Vite SPA in one foreground process)
make up

# Stop everything
make down
```

- Auth API: `http://localhost:3000` (health check at `/health`)
- Web SPA: `http://localhost:5173` (hits the auth API for `/health` via CORS)

## Available Commands

Run `make help` to see all commands.

**Local dev**

| Command | Description |
|---|---|
| `make setup` | First-time setup: install deps + Prisma + Postgres + `.env` files |
| `make up` | Postgres + auth-api + web SPA in one foreground process |
| `make web` | Web SPA only (no DB, no API) |
| `make down` | Stop local services |
| `make db-migrate` | Run Prisma migrations |
| `make db-studio` | Open Prisma Studio |
| `make build` / `make lint` / `make test` | Self-explanatory |

**Local K8s (k3d, optional)**

| Command | Description |
|---|---|
| `make k8s-setup` | Create k3d cluster |
| `make k8s` | Start Skaffold dev loop against k3d |

**AWS deploy**

| Command | Description |
|---|---|
| `make aws-up` | Terraform apply + k3s bootstrap + sync GH Actions secrets/variables |
| `make aws-deploy` | Build + push + roll out both backend and frontend |
| `make aws-deploy-api` | Backend only (Docker → GHCR → kubectl) |
| `make aws-deploy-web` | Frontend only (Vite build → S3 sync → CloudFront invalidate) |
| `make aws-status` | Terraform outputs + pod status |
| `make aws-ssh` | SSH into the current EC2 instance |
| `make aws-down` | Destroy everything (prompts for confirmation) |

## Project Structure

```
apps/
  auth-api/          - Authentication service (NestJS, port 3000)
  web/               - SPA (Vite + React + TanStack Router/Query + Tailwind v4, port 5173)
packages/
  database/          - Shared Prisma schema, client, and NestJS module
infra/
  docker/            - Docker Compose for local Postgres
  k8s/
    base/            - Production-accurate K8s manifests
    overlays/local/  - k3d-specific patches for local dev
  terraform/         - AWS + Cloudflare resources (EC2/k3s, S3+CloudFront, OIDC)
  scripts/           - k3s/k3d setup scripts
.github/workflows/   - Path-filtered CI/CD pipelines (auth-api, web, infra)
```

### Adding a new service

1. Create `apps/<service-name>/` with a new NestJS app
2. Add the database package to its `package.json` dependencies
3. Import `PrismaModule` from the database package in the app module
4. Add Prisma models to `packages/database/prisma/schema/<domain>.prisma`
5. Create K8s manifests in `infra/k8s/base/` and a Skaffold artifact for the new service

## Local Development

By default, local development uses **Docker Compose** for Postgres while NestJS runs directly on the host. This gives the fastest feedback loop — file changes trigger instant reloads without rebuilding containers.

```bash
make setup   # one-time
make up      # daily: Postgres (Docker Compose) + NestJS watch mode
```

If you want the full Kubernetes experience locally (test manifests, ingress routing, probes, resource limits), use **k3d** + **Skaffold** instead:

```bash
make k8s-setup   # one-time: creates a local k3d cluster
make k8s         # builds Docker image, deploys to k3d, port-forwards to localhost:3000
```

k3d runs k3s inside Docker, so the app behaves in local dev the same way it does in production — same Traefik ingress, same health probes, same resource constraints. macOS can't run k3s directly (k3s is Linux-only), so k3d creates Docker containers that act as Linux nodes and runs k3s inside them. Docker Desktop or Colima provides the container runtime.

**Port conflicts:** If you already have Postgres running on port 5433, stop it before running `make up`, or change the port in `infra/docker/docker-compose.yaml`.

## Deployment

Three independent pipelines, each triggered only when its own files change:

- **`apps/auth-api/**`** → `auth-api-ci.yaml` runs tests on PRs; on merge to main, its `deploy` job builds a Docker image, pushes to GHCR, SSHes to EC2 and runs `kubectl set image`.
- **`apps/web/**`** → `web-ci.yaml` runs lint/typecheck/vitest on PRs; on merge to main, its `build-and-deploy` job builds the SPA with `VITE_API_URL=https://api.habitpair.com/api`, syncs to S3, invalidates CloudFront.
- **`infra/terraform/**`** → `infra-ci.yaml` runs `terraform fmt -check` + `validate` only. Plan/apply are intentionally disabled until (a) state is migrated to S3 and (b) an admin can provision an OIDC role — apply runs manually via `make aws-up` from a laptop until then.

Production backend runs on a single AWS EC2 `t4g.small` (~$12/mo) with k3s + RDS PostgreSQL. The SPA is served from S3 behind CloudFront at `https://habitpair.com`.

See [infra/terraform/README.md](infra/terraform/README.md) for the one-time bootstrap (Cloudflare token, IAM user for CI, GitHub Variables/Secrets to set).

```bash
make aws-deploy   # manual full-stack deploy (alternative to merging to main)
```
