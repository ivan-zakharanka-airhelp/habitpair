# Mobile backend

A learning project that implements a production-grade authentication service using the same infrastructure patterns used in larger multi-service platforms, but at smaller scale. Runs on a single AWS EC2 instance with k3s (lightweight Kubernetes).

**Learning goals:** practice full Kubernetes deployment lifecycle, CI/CD pipelines, Traefik ingress with TLS, and kustomize overlays — exercised against a realistic application (auth with JWT, refresh token rotation, OAuth).
Generic backend for a React Native + Expo mobile app. npm workspaces monorepo with NestJS services, deployed to k3s on Hetzner.

See [Architecture.md](Architecture.md) for the full design document.

## Stack

- **Runtime:** Node.js 22 + TypeScript 5.x + NestJS 11
- **Data:** PostgreSQL 16 + Prisma 6
- **Infra:** Docker, k3s (prod on EC2), k3d (local K8s), Skaffold, kustomize
- **CI/CD:** GitHub Actions → GHCR → SSH deploy to k3s

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

Run `make help` to see all commands:

| Command | Description |
|---|---|
| `make setup` | First-time project setup (one command) |
| `make install` | Install deps + generate Prisma + build database package |
| `make up` | Start Postgres + auth-api dev server |
| `make down` | Stop local services |
| `make build` | Build all packages and apps |
| `make db-migrate` | Run Prisma migrations |
| `make db-studio` | Open Prisma Studio |
| `make lint` | Lint code |
| `make test` | Run unit tests |
| `make test-e2e` | Run e2e tests |
| `make k8s-setup` | Create local k3d cluster |
| `make k8s` | Start Skaffold dev loop |
| `make deploy` | Build, push, deploy to production |

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

- **`apps/auth-api/**`** → `auth-api-deploy.yaml` builds a Docker image, pushes to GHCR, SSHes to EC2 and runs `kubectl set image`.
- **`apps/web/**`** → `web-ci.yaml` builds the SPA, syncs to S3, invalidates CloudFront.
- **`infra/terraform/**`** → `infra-ci.yaml` posts a `terraform plan` on PR; `apply` runs on merge to `main` behind a manual approval gate.

Production backend runs on a single AWS EC2 `t4g.small` (~$12/mo) with k3s + RDS PostgreSQL. The SPA is served from S3 behind CloudFront at `https://habitpair.com`.

See [infra/terraform/README.md](infra/terraform/README.md) for the one-time bootstrap (Cloudflare token, GitHub Variables/Secrets to set, `production` Environment approval gate).

```bash
make deploy   # manual backend deploy (alternative to merging to main)
```
