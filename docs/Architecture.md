# habitpair — Architecture

## Overview

Two NestJS services (`auth-api`, `habits-api`) and a Vite/React SPA, deployed on Kubernetes (k3s on a single AWS EC2 instance for production, k3d on a MacBook for local dev). The point of the project isn't the app — it's exercising production patterns end-to-end at small scale.

What's running:

- **[apps/auth-api](../apps/auth-api)** — NestJS service, global prefix `/auth`. Currently exposes `/auth/health` and `/auth/health/ready` (Prisma DB ping). Login + JWT signing is the next obvious task.
- **[apps/habits-api](../apps/habits-api)** — NestJS service, global prefix `/habits`. Exposes `/habits/health`, `/habits/health/ready`, and a `Habit` CRUD scaffold (`/habits`, `POST /habits`) guarded by JwtGuard.
- **[apps/web](../apps/web)** — React + Vite SPA. Stores a JWT in memory after login, attaches `Authorization: Bearer <token>` to all API calls.
- One RDS PostgreSQL instance with **two logical databases** (`auth`, `habits`) — one per service.
- k3s in production (one EC2 node, Traefik ingress with Let's Encrypt TLS).
- k3d locally with the same kustomize base, patched via a `local/` overlay.
- GitHub Actions per-service CI: PR checks + (on push to main) build → GHCR → SSH → `kubectl set image`.
- AWS infrastructure as code via Terraform (`infra/terraform/`).

## Key architectural decisions

### Two services, one repo

`auth-api` owns identity. `habits-api` owns habit data. They share a Postgres instance and a JWT secret — nothing else. No shared `packages/` library: each service is self-contained, ships its own Prisma client and migrations, and is built/deployed by its own GitHub Actions workflow.

Rejected alternative: a single `packages/database` shared by both services. Looks like DRY at first, but couples deploys and migrations and lets either service silently read the other's tables. For two services the ~30 lines of duplicated `PrismaService` boilerplate is much cheaper than that coupling.

### Stateless inter-service auth (JWT, HS256)

`auth-api` signs JWTs on login. `habits-api` verifies them locally with the same secret — no HTTP callback, no latency, no cascading failure. The shared secret lives in a single K8s secret (`auth-jwt-secret`) mounted into both deployments.

Why HS256 (symmetric) and not RS256: simpler to operate for two services. Switch to RS256 when a third party needs to verify tokens — change is localized to the JWT module config in each service.

The JWT carries `sub` (user id). Habits-api never has to "ask" auth-api who the user is. If you ever need richer profile data in habits-api, fetch it via cluster DNS (`http://auth-api-service:3000/...`) — see "How services talk" below.

### One RDS, two databases (database-per-service)

Each service owns its data:

- `auth` — owned by auth-api (auth tables when added)
- `habits` — owned by habits-api (`Habit`, etc.)

Both live on one RDS `db.t4g.micro`. Tradeoff vs two RDS instances:

- **Get:** half the cost (~$15/mo not $30), one backup target, one upgrade target. Service isolation at the *logical* DB boundary (separate WAL, separate connection pools, no accidental cross-table joins).
- **Give up:** shared CPU/RAM/IOPS, shared `max_connections`. Single-point-of-failure for the data layer.

For 2 services at small scale: fine. Split into separate instances when one service's load measurably affects the other.

### Per-service URL prefix

Both services live under `https://api.habitpair.com/api/<service>/...`:

- `/api/auth/health`, `/api/auth/login`, ...
- `/api/habits`, `/api/habits/health`, `/api/habits/:id`, ...

Implementation: each NestJS app calls `app.setGlobalPrefix('<service>')` in `main.ts`. Traefik routes by `PathPrefix(/api/<service>)` and strips only `/api`, leaving `/<service>/...` for NestJS. There's no catch-all — paths outside the two prefixes 404 cleanly at the gateway. URLs are self-identifying (no ambiguous `/health` that could mean either service).

### k3s from the start

1. **Parallels real production patterns** (EKS, GKE) while staying runnable on a single small VPS.
2. **Scales without re-platforming** — the same manifests work on a multi-node cluster.

k3s specifically: single binary, ~512 MB RAM, CNCF-certified, Traefik bundled, fits a `t4g.small` (~$12/mo).

### Monorepo with npm workspaces

All services, frontend, and infra in one repo. Root `package.json` declares `workspaces: ["apps/*", "packages/*"]`. The `packages/*` glob is empty today — services don't share code beyond the JWT secret and DB instance.

## Tech stack

| Layer | Tool | Version | Why |
|---|---|---|---|
| Language | TypeScript | 5.x | Type safety, NestJS native |
| Runtime | Node.js | 22 LTS | Long-term support, stable |
| Framework | NestJS | 11.x | Module system, DI, Terminus + Jwt modules |
| ORM | Prisma | 6.x | Type-safe queries, per-service schemas, `output` path keeps clients isolated per service |
| Database | PostgreSQL | 16 | AWS RDS in production, Docker Compose for local |
| Auth | `@nestjs/jwt` (HS256) | 11.x | Shared-secret JWT verification, no inter-service HTTP |
| Container runtime | Docker | 27.x | Build images for K8s |
| K8s (production) | k3s | latest stable | Lightweight, single-node, Traefik included |
| K8s (local dev) | k3d | latest stable | k3s-in-Docker for MacBook testing |
| Build/deploy bridge | Skaffold | 2.x | Watch → rebuild → redeploy loop |
| Manifest management | kustomize | built-in to kubectl | Base + overlay pattern for environments |
| CI/CD | GitHub Actions | — | Path-filtered per service, parallel pipelines |
| AWS IaC | Terraform | 1.x | EC2, RDS, security groups, SSH key, S3, CloudFront, Cloudflare DNS |
| Ingress | Traefik | (bundled with k3s) | TLS via Let's Encrypt, routing, middlewares |
| Health checks | `@nestjs/terminus` | — | Liveness + readiness probes for K8s |
| Config | `@nestjs/config` | — | Env-based config |

## Repository structure

```
habitpair/
├── package.json                       # npm workspaces root
│
├── apps/
│   ├── auth-api/                      # ── Auth service ──
│   │   ├── prisma/
│   │   │   ├── schema.prisma          # own datasource, output to ../generated/prisma
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── main.ts                # setGlobalPrefix('auth'), bootstrap on :3000
│   │   │   ├── app.module.ts          # ConfigModule, JwtModule, PrismaModule, HealthModule
│   │   │   ├── health/                # /auth/health, /auth/health/ready
│   │   │   └── prisma/                # per-service PrismaService + PrismaModule
│   │   ├── test/                      # e2e tests
│   │   ├── Dockerfile                 # workspace-aware multi-stage build
│   │   ├── .env.example
│   │   └── package.json
│   │
│   ├── habits-api/                    # ── Habits service ──
│   │   ├── prisma/
│   │   │   ├── schema.prisma          # Habit model
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── main.ts                # setGlobalPrefix('habits'), bootstrap on :3000
│   │   │   ├── app.module.ts          # + JwtModule.register({ secret: env.JWT_SECRET })
│   │   │   ├── auth/
│   │   │   │   ├── jwt.guard.ts       # CanActivate, verifies HS256, attaches req.user
│   │   │   │   ├── jwt.guard.spec.ts  # 5 unit tests
│   │   │   │   └── jwt-payload.ts     # { sub, iat?, exp? }
│   │   │   ├── habits/                # HabitsController @UseGuards(JwtGuard)
│   │   │   ├── health/
│   │   │   └── prisma/
│   │   ├── test/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── web/                           # ── React SPA ──
│       ├── src/lib/apiClient.ts       # in-memory bearer token, attaches Authorization header
│       └── ...
│
├── infra/
│   ├── k8s/
│   │   ├── base/                      # production-accurate manifests
│   │   │   ├── namespace.yaml
│   │   │   ├── auth-api-deployment.yaml      # env: DATABASE_URL, JWT_SECRET
│   │   │   ├── auth-api-service.yaml
│   │   │   ├── habits-api-deployment.yaml    # env: DATABASE_URL, JWT_SECRET (same secret)
│   │   │   ├── habits-api-service.yaml
│   │   │   ├── ingress.yaml                  # /api/auth, /api/habits — no catch-all
│   │   │   └── kustomization.yaml
│   │   ├── overlays/
│   │   │   ├── local/                 # k3d-specific patches + local secrets
│   │   │   └── aws/                   # AWS-specific patches + image mapping to GHCR
│   │   ├── traefik-config.yaml        # HelmChartConfig for k3s Traefik
│   │   └── secrets.yaml.example
│   ├── docker/
│   │   ├── docker-compose.yaml        # Local Postgres (creates `auth` DB)
│   │   └── init-databases.sql         # Creates `habits` DB on first boot
│   ├── scripts/
│   │   ├── setup-k3s.sh               # One-time k3s install on EC2 (legacy — cloud-init does this now)
│   │   ├── setup-k3d.sh               # One-time k3d cluster for local dev
│   │   ├── aws-bootstrap.sh           # Post-Terraform: creates `habits` DB + all K8s secrets
│   │   ├── aws-teardown.sh            # Destroy AWS + clean local kubeconfig
│   │   └── cleanup-manual-resources.sh
│   └── terraform/                     # AWS infra as code (RDS, EC2, S3, CloudFront, ACM, Cloudflare)
│
├── Makefile                           # All DX commands
├── skaffold.yaml                      # Skaffold config — builds both service images, port-forwards both
├── .github/
│   └── workflows/
│       ├── auth-api-ci.yaml           # Path: apps/auth-api/**
│       ├── habits-api-ci.yaml         # Path: apps/habits-api/**
│       ├── web-ci.yaml                # Path: apps/web/**
│       └── infra-ci.yaml              # Path: infra/terraform/**
└── README.md
```

The Prisma client per service generates into `apps/<service>/generated/prisma/` (gitignored). The `output` config in each `schema.prisma` keeps the two clients from overwriting each other in the hoisted root `node_modules/.prisma/client`.

## Data topology

```
                     ┌───────────────────┐
                     │   AWS RDS         │
                     │   db.t4g.micro    │
                     │   PostgreSQL 16   │
                     ├───────────────────┤
                     │   DB:  auth       │◄── auth-api (its own Prisma schema + migrations)
                     │   DB:  habits     │◄── habits-api (its own Prisma schema + migrations)
                     └───────────────────┘
```

Tables in `auth` are unknown to habits-api; tables in `habits` are unknown to auth-api. The `userId` field in `Habit` is a plain string carrying the JWT `sub` claim — not a foreign key (cross-database FKs aren't possible in Postgres, and they wouldn't be desirable here even if they were).

## Request flow

```
Browser  ─►  CloudFront/S3 (the SPA at habitpair.com)
              │
              ▼
Browser sends:  GET https://api.habitpair.com/api/habits
                Authorization: Bearer <jwt>
              │
              ▼
   ┌──────────────────────────────────┐
   │ Cloudflare DNS (A record)        │
   │   api.habitpair.com → EC2 EIP    │
   └──────────────┬───────────────────┘
                  │
                  ▼
   ┌──────────────────────────────────┐
   │ Traefik on k3s (TLS terminates) │
   │ IngressRoute api-gateway         │
   │  rule: PathPrefix(/api/habits)   │
   │  middlewares: rate-limit,        │
   │   security-headers, api-strip    │
   └──────────────┬───────────────────┘
                  │  /api/habits → /habits
                  ▼
   ┌──────────────────────────────────┐
   │ Service: habits-api-service:3000 │
   │  → ClusterIP → habits-api pod    │
   └──────────────┬───────────────────┘
                  │
                  ▼
   ┌──────────────────────────────────┐
   │ NestJS (habits-api)              │
   │  global prefix /habits           │
   │  JwtGuard verifies HS256 with    │
   │   JWT_SECRET (no auth-api call)  │
   │  attaches req.user = { sub }     │
   │  HabitsController.list()         │
   └──────────────┬───────────────────┘
                  │
                  ▼
   ┌──────────────────────────────────┐
   │ Prisma → RDS, db `habits`        │
   │  SELECT * FROM "Habit"           │
   │  WHERE "userId" = req.user.sub   │
   └──────────────────────────────────┘
```

## Infrastructure details

### AWS setup

| Resource | Spec | Cost (approx) |
|---|---|---|
| EC2 instance | `t4g.small` — 2 vCPU, 2 GB RAM (ARM64, Graviton) | ~$12/mo |
| RDS PostgreSQL | `db.t4g.micro` — PG 16, 20 GB (hosts both DBs) | ~$13/mo |
| **Total** | | **~$25/mo** |

All AWS resources are provisioned via Terraform — see [infra/terraform/](../infra/terraform/). `make aws-up` runs `terraform apply` then [aws-bootstrap.sh](../infra/scripts/aws-bootstrap.sh).

### k3s installation

Done via cloud-init when the EC2 launches — see [cloud-init.yaml](../infra/terraform/cloud-init.yaml). ServiceLB disabled (single-node, Traefik binds host ports directly). `setup-k3s.sh` exists as a fallback / manual reference.

### Ingress routing

Production (base) IngressRoute matches:

- `Host('api.habitpair.com') && PathPrefix('/api/auth')`  → auth-api-service (with `rate-limit-auth` — stricter)
- `Host('api.habitpair.com') && PathPrefix('/api/habits')` → habits-api-service
- Anything else under `/api` → 404 at Traefik (no catch-all)

All routes share the `api-strip` middleware (strips `/api`) and `security-headers`. TLS via Let's Encrypt (HTTP-01).

Local overlay drops the `Host()` match (k3d uses plain HTTP on `localhost:8080`) and removes the TLS block — see [overlays/local/](../infra/k8s/overlays/local/).

### K8s secrets

Three secrets, all in namespace `habitpair`:

| Secret | Key | Mounted into | Source |
|---|---|---|---|
| `db-credentials` | `url` | auth-api `DATABASE_URL` | aws-bootstrap.sh (AWS) / overlay (local) |
| `habits-db-credentials` | `url` | habits-api `DATABASE_URL` | aws-bootstrap.sh / overlay |
| `auth-jwt-secret` | `secret` | both services `JWT_SECRET` | aws-bootstrap.sh creates a random 32-byte HS256 key on first run, preserves it across re-runs |

### Health probes

Each pod's liveness/readiness hits its own service-prefixed path (because of `setGlobalPrefix`):

- auth-api: `/auth/health` (liveness), `/auth/health/ready` (Prisma ping)
- habits-api: `/habits/health` (liveness), `/habits/health/ready` (Prisma ping)

Kubelet hits the pod directly (no Traefik in the path), so probes use the in-pod URL, not the gateway URL.

## How services talk

By design: they don't. The JWT carries `sub`, so habits-api never has to ask auth-api who the user is. Both services share `JWT_SECRET` (HS256) and verify locally — stateless, no inter-service HTTP, no cascading failures.

If a future feature *does* need a service-to-service call (e.g., habits-api looking up a user's display name from auth-api), the path is straightforward:

- **In-cluster DNS:** `http://auth-api-service:3000/auth/users/:id` from habits-api's container. Bypasses Traefik (no rate-limits, no TLS, no `/api` prefix — hit the in-pod URL directly).
- **NestJS HttpModule:** `@nestjs/axios` provides `HttpService` for DI-friendly typed clients.
- **Forward the JWT:** the cheapest way to keep cross-service calls authenticated.

## CI/CD

Four GitHub Actions workflows, each path-filtered to one concern, all running in parallel when changes span multiple:

| Workflow | Paths | What it does on `main` |
|---|---|---|
| [auth-api-ci.yaml](../.github/workflows/auth-api-ci.yaml) | `apps/auth-api/**` | Build arm64 → GHCR → SSH → `kubectl set image deployment/auth-api` |
| [habits-api-ci.yaml](../.github/workflows/habits-api-ci.yaml) | `apps/habits-api/**` | Same shape, for habits-api |
| [web-ci.yaml](../.github/workflows/web-ci.yaml) | `apps/web/**` | Vite build → S3 sync → CloudFront invalidation |
| [infra-ci.yaml](../.github/workflows/infra-ci.yaml) | `infra/terraform/**` | `terraform fmt -check` + `validate` only (apply is manual from a laptop until OIDC + remote state are in place) |

PR runs use a Postgres service container for migrations and unit tests. The deploy job only runs on push to `main`.

## Environment variables

Each service reads its own `.env` locally and K8s secrets in deployments. Required vars:

**[apps/auth-api/.env](../apps/auth-api/.env.example):**
- `DATABASE_URL` — Postgres connection string (db `auth`)
- `JWT_SECRET` — HS256 key, must match habits-api's
- `PORT`, `NODE_ENV`, `CORS_ORIGINS` (optional)

**[apps/habits-api/.env](../apps/habits-api/.env.example):**
- `DATABASE_URL` — Postgres connection string (db `habits`)
- `JWT_SECRET` — same value as auth-api's
- `PORT` (default 3001 locally), `NODE_ENV`, `CORS_ORIGINS`

In K8s, both come from secrets: `DATABASE_URL` from `db-credentials` / `habits-db-credentials`, `JWT_SECRET` from the shared `auth-jwt-secret`.
