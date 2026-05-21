# Mobile Backend — Architecture

## Overview

A NestJS service deployed on Kubernetes (k3s on a single AWS EC2 instance for production, k3d on a MacBook for local dev). Today the application is a scaffold exposing only health endpoints; the focus has been on getting the full deployment pipeline working end-to-end.

What's running:

- A single NestJS app (`auth-api`) with a `HealthModule` exposing `/health` and `/health/ready`.
- A shared `@mobile-backend/database` package providing a global `PrismaModule`.
- One PostgreSQL instance — Docker Compose for local dev, AWS RDS in production.
- k3s in production (one EC2 node, Traefik ingress with Let's Encrypt TLS).
- k3d locally with the same kustomize base, patched via a `local/` overlay.
- GitHub Actions CI (PR checks) and Deploy (push-to-main → arm64 image → GHCR → SSH to EC2 → `kubectl set image`).
- AWS infrastructure as code via Terraform (`infra/terraform/`).

---

## Architecture decisions and rationale

### NestJS modules per domain

The app is structured as one NestJS module per domain. `HealthModule` is the only module currently. Modules communicate through service interfaces, not SQL.

### k3s from the start

Reasons:

1. **Parallels production patterns** used in larger environments (EKS, GKE) while staying runnable on a single VPS.
2. **Scales without re-platforming** — the same manifests work on a multi-node cluster.

k3s specifically because:

- Single binary, ~512 MB RAM footprint.
- Production-grade (CNCF certified Kubernetes distribution).
- Traefik ingress controller pre-installed.
- Runs comfortably on a small EC2 instance (~$12/mo for a `t4g.small`).

### Shared database with schema discipline

One PostgreSQL instance shared by all modules, with per-module table ownership (no cross-module joins; modules talk through NestJS service interfaces; tables prefixed with the owning module name).

The Prisma schema lives in `packages/database/prisma/schema/` — currently only `base.prisma` (datasource + generator).

### Monorepo with npm workspaces

All services, shared libraries, and infrastructure code in one repository. Uses npm workspaces:

```json
// root package.json
{ "workspaces": ["apps/*", "packages/*"] }
```

Shared code lives in `packages/database/`. Each app in `apps/` depends on it via workspace symlinks — no publishing required.

---

## Tech stack

| Layer | Tool | Version | Why |
|---|---|---|---|
| Language | TypeScript | 5.x | Type safety, NestJS native |
| Runtime | Node.js | 22 LTS | Long-term support, stable |
| Framework | NestJS | 11.x | Module system, DI |
| ORM | Prisma | 6.x | Type-safe queries, clean migrations, multi-file schema |
| Database | PostgreSQL | 16 | AWS RDS in production, Docker Compose for local dev |
| Container runtime | Docker | 27.x | Build images for K8s |
| K8s (production) | k3s | latest stable | Lightweight, single-node, Traefik included |
| K8s (local dev) | k3d | latest stable | k3s-in-Docker for MacBook testing |
| Build/deploy bridge | Skaffold | 2.x | Watch → rebuild → redeploy loop |
| Manifest management | kustomize | built-in to kubectl | Base + overlay pattern for environments |
| CI/CD | GitHub Actions | — | Build, test, deploy on merge to main |
| AWS IaC | Terraform | 1.x | EC2, RDS, security groups, SSH key |
| Ingress | Traefik | (bundled with k3s) | TLS, routing, middlewares |
| Health checks | @nestjs/terminus | — | Liveness + readiness probes for K8s |
| Config | @nestjs/config | — | Env-based config |

---

## Repository structure

```
mobile-backend/
├── package.json                       # npm workspaces root
│
├── packages/
│   └── database/                      # ── Shared database package ──
│       ├── src/
│       │   ├── prisma.service.ts      # PrismaClient wrapper with lifecycle hooks
│       │   ├── prisma.module.ts       # @Global() NestJS module
│       │   └── index.ts               # Re-exports PrismaModule + PrismaService
│       ├── prisma/
│       │   ├── schema/
│       │   │   └── base.prisma        # datasource + generator config
│       │   └── migrations/
│       ├── package.json
│       └── tsconfig.json
│
├── apps/
│   └── auth-api/                      # ── Auth API service ──
│       ├── src/
│       │   ├── main.ts                # Bootstrap, listen on :3000
│       │   ├── app.module.ts          # Root module
│       │   └── health/
│       │       ├── health.module.ts
│       │       └── health.controller.ts
│       ├── test/
│       │   ├── app.e2e-spec.ts
│       │   └── jest-e2e.json
│       ├── Dockerfile                 # Workspace-aware multi-stage build
│       ├── .env.example
│       ├── nest-cli.json
│       ├── tsconfig.json
│       └── package.json
│
├── infra/
│   ├── k8s/
│   │   ├── base/                      # Production-accurate manifests
│   │   │   ├── namespace.yaml
│   │   │   ├── auth-api-deployment.yaml
│   │   │   ├── auth-api-service.yaml
│   │   │   ├── ingress.yaml
│   │   │   └── kustomization.yaml
│   │   ├── overlays/
│   │   │   ├── local/                 # k3d-specific patches
│   │   │   │   ├── kustomization.yaml
│   │   │   │   ├── ingress-patch.yaml
│   │   │   │   ├── secrets.yaml
│   │   │   │   └── traefik-config.yaml
│   │   │   └── aws/                   # AWS k3s-specific patches
│   │   │       ├── kustomization.yaml
│   │   │       ├── ingress-patch.yaml
│   │   │       └── README.md
│   │   ├── traefik-config.yaml        # HelmChartConfig for k3s Traefik
│   │   └── secrets.yaml.example
│   ├── docker/
│   │   └── docker-compose.yaml        # Local dev: Postgres only
│   ├── scripts/
│   │   ├── setup-k3s.sh               # One-time k3s install on EC2
│   │   ├── setup-k3d.sh               # One-time k3d cluster for local dev
│   │   ├── aws-bootstrap.sh           # K8s bootstrap on a fresh EC2
│   │   ├── aws-teardown.sh            # Destroy AWS + clean local kubeconfig
│   │   └── cleanup-manual-resources.sh
│   └── terraform/                     # AWS infra as code
│       ├── versions.tf
│       ├── variables.tf
│       ├── terraform.tfvars.example
│       ├── data.tf
│       ├── ec2.tf
│       ├── rds.tf
│       ├── security-groups.tf
│       ├── ssh-key.tf
│       ├── outputs.tf
│       ├── cloud-init.yaml
│       └── README.md
│
├── Makefile                           # All DX commands (uses npm workspace flags)
├── skaffold.yaml                      # Skaffold config for K8s dev loop
├── .github/
│   └── workflows/
│       ├── ci.yaml                    # Lint, test, build on PR
│       └── deploy.yaml                # Build arm64 image, push, deploy on merge to main
├── .gitignore
├── .nvmrc                             # Node 22
└── README.md
```

---

## DX commands (Makefile)

All commands use npm workspace flags (`-w`) to target specific packages.

```makefile
# ── First-time setup ──
setup: install db-up db-migrate  ## First-time project setup (one command)
install:                         ## Install all workspace deps + generate Prisma + build database package

# ── Local development (no K8s, fastest feedback loop) ──
up:                              ## Start Postgres + NestJS in watch mode
down:                            ## Stop local services
db-up:                           ## Start Postgres container
db-migrate:                      ## Run Prisma migrations
db-studio:                       ## Open Prisma Studio (DB GUI)
build:                           ## Build all packages and apps

# ── K8s local development ──
k8s-setup:                       ## Create k3d cluster (one-time)
k8s:                             ## Start Skaffold dev loop against local k3d

# ── AWS infrastructure ──
aws-up:                          ## Provision AWS (Terraform) + bootstrap k8s
aws-bootstrap:                   ## Re-run K8s bootstrap only (idempotent)
aws-down:                        ## Destroy everything (AWS + local kubeconfig)
aws-status:                      ## Show Terraform outputs + pod status
aws-ssh:                         ## SSH to the current EC2 instance
aws-deploy:                      ## Build + push image + rollout on AWS k3s
aws-cleanup-manual:              ## ONE-TIME — delete pre-Terraform resources

# ── Deploy (Skaffold alternative) ──
deploy:                          ## Build, push, deploy via Skaffold

# ── Quality ──
lint:                            ## Lint all code
test:                            ## Run unit tests
test-e2e:                        ## Run e2e tests
```

---

## Infrastructure details

### AWS setup

| Resource | Spec | Cost (approx) |
|---|---|---|
| EC2 instance | `t4g.small` — 2 vCPU, 2 GB RAM (ARM64, Graviton) | ~$12/mo |
| RDS PostgreSQL | `db.t4g.micro` — PG 16, 20 GB | ~$13/mo |
| **Total** | | **~$25/mo** |

All AWS resources (EC2, RDS, security groups, SSH key) are provisioned via Terraform — see `infra/terraform/`. `make aws-up` runs `terraform apply` then the k8s bootstrap script.

### k3s installation (one-time, on EC2)

```bash
# infra/scripts/setup-k3s.sh
curl -sfL https://get.k3s.io | sh -s - \
  --disable=servicelb \
  --write-kubeconfig-mode=644
```

ServiceLB is disabled because on a single-node setup the Traefik ingress uses hostPort (80/443) directly. No load balancer abstraction needed.

### k3d setup (one-time, on MacBook for local dev)

```bash
# infra/scripts/setup-k3d.sh
k3d cluster create mobile-backend \
  --port "8080:80@loadbalancer" \
  --port "8443:443@loadbalancer" \
  --agents 0
```

### Traefik configuration

Traefik comes pre-installed with k3s. Customised via HelmChartConfig in `infra/k8s/traefik-config.yaml`:

- Traefik pod ports bound directly to host ports 80/443 (needed because `--disable=servicelb`).
- Single replica with `maxSurge: 0` so two pods don't conflict on the same hostPort during rollouts (~10s downtime is acceptable).
- `/data` persisted via k3s's local-path-provisioner so the Let's Encrypt cert survives pod restarts and we don't hit the LE rate limit.
- Let's Encrypt production resolver via HTTP-01 challenge on the `web` entryPoint.

### Ingress routing

Production (base) IngressRoute uses:

- `entryPoints: [websecure]` — HTTPS only.
- `Host('<your-domain>') && PathPrefix('/api')` — matches on domain.
- `tls: { certResolver: letsencrypt }` — auto-provisioned TLS cert.

Local (overlay) patches:

- `entryPoints: [web]` — plain HTTP on k3d's 8080→80 mapping.
- `PathPrefix('/api')` only — no Host check.
- `tls` block removed.

See `infra/k8s/base/ingress.yaml` and `infra/k8s/overlays/local/` for the full manifests.

### Deployment + Service

```yaml
# infra/k8s/base/auth-api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-api
  namespace: mobile-backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: auth-api
  template:
    metadata:
      labels:
        app: auth-api
    spec:
      containers:
        - name: auth-api
          image: auth-api:latest
          ports:
            - containerPort: 3000
          livenessProbe:
            httpGet: { path: /health, port: 3000 }
            initialDelaySeconds: 10
            periodSeconds: 15
          readinessProbe:
            httpGet: { path: /health/ready, port: 3000 }
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests: { memory: "128Mi", cpu: "100m" }
            limits:   { memory: "384Mi", cpu: "500m" }
          env:
            - name: DATABASE_URL
              valueFrom: { secretKeyRef: { name: db-credentials, key: url } }
---
apiVersion: v1
kind: Service
metadata:
  name: auth-api-service
  namespace: mobile-backend
spec:
  selector:
    app: auth-api
  ports:
    - port: 3000
      targetPort: 3000
```

The liveness/readiness probes hit `HealthController` — the readiness probe checks Prisma DB connectivity via `@nestjs/terminus`.

---

## Docker setup

### Dockerfile (`apps/auth-api/Dockerfile`)

Build context is the repo root (not the app directory) so workspace dependencies resolve correctly. Multi-stage build with separate `build` and `production` stages — the final image contains only compiled JS + production node_modules.

### docker-compose.yaml (local dev only)

```yaml
# infra/docker/docker-compose.yaml
name: mobile-backend

services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: mobile_backend
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dev"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
```

### Skaffold config

```yaml
# skaffold.yaml
apiVersion: skaffold/v4beta11
kind: Config
metadata:
  name: mobile-backend
build:
  local:
    useBuildkit: false
  artifacts:
    - image: auth-api
      context: .
      docker:
        dockerfile: apps/auth-api/Dockerfile
manifests:
  kustomize:
    paths:
      - infra/k8s/overlays/local
deploy:
  kubectl: {}
portForward:
  - resourceType: service
    resourceName: auth-api-service
    namespace: mobile-backend
    port: 3000
    localPort: 3000
```

---

## CI/CD (GitHub Actions)

### CI — on every PR

```yaml
# .github/workflows/ci.yaml
name: CI
on:
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run generate -w @mobile-backend/database
      - run: npm run build -w @mobile-backend/database
      - run: npm run lint -w @mobile-backend/auth-api
      - run: npm run build -w @mobile-backend/auth-api
      - run: npm run migrate:deploy -w @mobile-backend/database
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
      - run: npm test -w @mobile-backend/auth-api
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
```

### Deploy — on merge to main

```yaml
# .github/workflows/deploy.yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # QEMU lets the amd64 runner build for arm64 (EC2 is t4g/Graviton).
      - uses: docker/setup-qemu-action@v3
        with:
          platforms: arm64
      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GHCR_PAT }}

      - uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/auth-api/Dockerfile
          platforms: linux/arm64
          push: true
          tags: ghcr.io/${{ github.repository }}/auth-api:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Deploy to k3s
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ubuntu
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
            kubectl set image deployment/auth-api \
              auth-api=ghcr.io/${{ github.repository }}/auth-api:${{ github.sha }} \
              -n mobile-backend
            kubectl rollout status deployment/auth-api -n mobile-backend --timeout=120s
```

---

## Environment variables

```bash
# apps/auth-api/.env.example

# Database
DATABASE_URL=postgresql://dev:dev@localhost:5433/mobile_backend

# App
PORT=3000
NODE_ENV=development
```
