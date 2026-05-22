# habitpair

A habit-tracking app — full-stack learning project. The point isn't the app itself; it's exercising production patterns end-to-end at small scale: two NestJS services on k3s, Vite/React SPA on S3 + CloudFront, infra as code with Terraform, Traefik ingress with Let's Encrypt, per-service path-filtered CI/CD.

**Learning goals:** full Kubernetes deployment lifecycle, CI/CD pipelines, Traefik ingress with TLS, kustomize overlays, S3+CloudFront SPA hosting, IAM/OIDC trust, Cloudflare DNS via Terraform, stateless service-to-service auth with JWT — exercised against a realistic application (auth, habits, OAuth eventually).

Live at [habitpair.com](https://habitpair.com); APIs at [api.habitpair.com/api/auth](https://api.habitpair.com/api/auth/health) and [api.habitpair.com/api/habits](https://api.habitpair.com/api/habits/health). See [docs/Architecture.md](docs/Architecture.md) for the design and [docs/Infra.md](docs/Infra.md) for the infra notes.

## Stack

- **Backend:** Node.js 22 + TypeScript 5.x + NestJS 11. Two services: `auth-api`, `habits-api`.
- **Frontend:** Vite + React 18 + TanStack Router/Query + Tailwind v4
- **Data:** PostgreSQL 16 + Prisma 6. One RDS instance, two logical databases (`auth`, `habits`) — one per service.
- **Auth:** HS256 JWT signed by `auth-api`, verified locally by `habits-api` via a shared K8s secret (no inter-service HTTP).
- **Infra:** Docker, k3s (prod on AWS EC2), k3d (local K8s), Skaffold, kustomize, Terraform
- **CDN/DNS:** AWS S3 + CloudFront for the SPA, Cloudflare for DNS, Let's Encrypt for the API cert
- **CI/CD:** GitHub Actions, path-filtered per service (`auth-api`, `habits-api`, `web`, `infra`)

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- Docker and Docker Compose (Docker Desktop or Colima on macOS)
- kubectl (for K8s deployment)
- k3d (optional, for local K8s testing)
- Skaffold (optional, for local K8s dev loop)

## Quick Start

```bash
# First-time setup (installs deps, starts Postgres with `auth` + `habits` DBs,
# generates Prisma clients, copies apps/web/.env.example → apps/web/.env)
make setup

# Daily development (Postgres + auth-api + habits-api + Vite SPA, all in foreground)
make up

# Stop everything
make down
```

- Auth API: `http://localhost:3000` (health at [`/auth/health`](http://localhost:3000/auth/health))
- Habits API: `http://localhost:3001` (health at [`/habits/health`](http://localhost:3001/habits/health) — `/habits` itself requires a Bearer JWT)
- Web SPA: `http://localhost:5173`

Each service is reachable at `/<service-prefix>/...` — that's NestJS `setGlobalPrefix` matching the path Traefik routes on. Same shape locally and in prod.

## Available Commands

Run `make help` to see all commands.

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

## Project Structure

```
apps/
  auth-api/          - Auth service (NestJS, port 3000, global prefix /auth)
    prisma/          - Own schema + migrations
    src/
      auth/          - (Eventually) login, JWT signing
      health/
      prisma/        - PrismaModule + PrismaService (per-service, no shared pkg)
  habits-api/        - Habits service (NestJS, port 3001, global prefix /habits)
    prisma/          - Own schema (Habit model) + migrations
    src/
      auth/          - JwtGuard (verifies HS256 with shared secret)
      habits/        - HabitsController + HabitsService
      health/
      prisma/
  web/               - SPA (Vite + React + TanStack Router/Query + Tailwind v4, port 5173)
infra/
  docker/
    docker-compose.yaml    - Local Postgres
    init-databases.sql     - Creates the `habits` DB alongside the default `auth`
  k8s/
    base/                  - Production-accurate K8s manifests (both services)
    overlays/local/        - k3d-specific patches for local dev
    overlays/aws/          - AWS k3s-specific patches
  terraform/               - AWS + Cloudflare resources
  scripts/                 - k3s/k3d setup + aws-bootstrap.sh
.github/workflows/         - Per-service path-filtered CI/CD
  auth-api-ci.yaml
  habits-api-ci.yaml
  web-ci.yaml
  infra-ci.yaml
```

### Adding a new service

1. Create `apps/<service-name>/` as a NestJS app (`@habitpair/<service-name>`) — mirror `apps/habits-api/` for structure (Prisma per service, JwtGuard if it serves authenticated users)
2. Set `app.setGlobalPrefix('<service-name>')` in `main.ts` so its URLs become `/api/<service-name>/...`
3. Add `prisma/schema.prisma` with `output = "../generated/prisma"` (avoids hoist conflicts) and create a new database for it in [`aws-bootstrap.sh`](infra/scripts/aws-bootstrap.sh) + [`infra/docker/init-databases.sql`](infra/docker/init-databases.sql)
4. Add K8s manifests in `infra/k8s/base/`, register them in `kustomization.yaml`, add an ingress route ahead of the catch-all
5. Add image mapping in `infra/k8s/overlays/aws/kustomization.yaml`
6. Add a path-filtered workflow in `.github/workflows/<service-name>-ci.yaml`
7. Add a Skaffold artifact + port-forward in `skaffold.yaml`

## Local Development

By default, local development uses **Docker Compose** for Postgres while NestJS runs directly on the host. This gives the fastest feedback loop — file changes trigger instant reloads without rebuilding containers.

```bash
make setup   # one-time
make up      # daily: Postgres (Docker Compose) + both NestJS services + web in watch mode
```

If you want the full Kubernetes experience locally (test manifests, ingress routing, probes, resource limits), use **k3d** + **Skaffold** instead:

```bash
make k8s-setup   # one-time: creates a local k3d cluster
make k8s         # builds both service images, deploys to k3d, port-forwards auth → 3000, habits → 3001
```

k3d runs k3s inside Docker so the local cluster behaves the same way as production — same Traefik ingress, same health probes, same resource constraints.

**Auth flow locally:** auth-api signs JWTs with `JWT_SECRET` from `.env`; habits-api verifies with the same secret. The same key must be in both `.env` files. K8s injects it via the `auth-jwt-secret` Secret.

**Port conflicts:** Postgres uses 5434, auth-api 3000, habits-api 3001, web 5173. If something else holds those, free them or change them in the relevant `.env`/`docker-compose.yaml`.

## Deployment

Four independent pipelines, each triggered only when its own files change:

- **`apps/auth-api/**`** → [auth-api-ci.yaml](.github/workflows/auth-api-ci.yaml) — tests on PR; on merge to main, builds arm64 Docker image, pushes to GHCR, SSHes to EC2, `kubectl set image deployment/auth-api`.
- **`apps/habits-api/**`** → [habits-api-ci.yaml](.github/workflows/habits-api-ci.yaml) — same pattern for habits-api. Path-scoped, so it doesn't fire on auth changes and vice versa.
- **`apps/web/**`** → [web-ci.yaml](.github/workflows/web-ci.yaml) — lint/typecheck/vitest on PR; on merge to main, builds the SPA with `VITE_API_URL=https://api.habitpair.com/api`, syncs to S3, invalidates CloudFront.
- **`infra/terraform/**`** → [infra-ci.yaml](.github/workflows/infra-ci.yaml) — `terraform fmt -check` + `validate` only. Plan/apply runs manually via `make aws-up` from a laptop until OIDC + remote state are in place.

Production backend runs on a single AWS EC2 `t4g.small` (~$12/mo) with k3s + RDS PostgreSQL (~$13/mo). The SPA is served from S3 behind CloudFront at `https://habitpair.com`. RDS hosts both DBs (`auth`, `habits`) — see [docs/Architecture.md](docs/Architecture.md#data-topology) for why.

See [infra/terraform/README.md](infra/terraform/README.md) for the one-time bootstrap (Cloudflare token, GitHub Variables/Secrets, etc.).

```bash
make aws-deploy   # manual full-stack deploy (alternative to merging to main)
```
