╔══════════════════════════════════════════════════════════════════════════════════════════════════════╗
║                                       HABITPAIR — FULL SYSTEM FLOW                                    ║
╚══════════════════════════════════════════════════════════════════════════════════════════════════════╝

 ┌─[ 1. YOU TYPE A COMMAND ]─────────────────────────────────────────────────────────────────────────┐
 │                                                                                                     │
 │    make setup         make up          make k8s-setup         make k8s              make aws-deploy │
 │  first-time install  Docker Compose    create k3d cluster   Skaffold dev loop    prod → AWS EC2   │
 │    (one time)       + NestJS watch       (one time)         (k3d K8s)                              │
 │                                                                                                     │
 └────────┬──────────────────┬───────────────────┬────────────────────┬─────────────────────┬─────────┘
          │                  │                   │                    │                     │
          ▼                  ▼                   ▼                    ▼                     ▼
 ┌─[ 2. ENTRY FILE: Makefile ]─────────────────────────────────────────────────────────────────────────┐
 │                                                                                                     │
 │  Every make target maps to:  npm run <script> -w <workspace>  OR  docker compose / skaffold / bash  │
 │                                                                                                     │
 └────────┬──────────────────┬───────────────────┬────────────────────┬─────────────────────┬─────────┘
          │                  │                   │                    │                     │
          ▼                  ▼                   ▼                    ▼                     ▼
 ┌─[ 3. MONOREPO: npm workspaces — `apps/*` (no shared packages — each service is self-contained) ]──┐
 │                                                                                                     │
 │    package.json  (root)                       "workspaces": ["apps/*", "packages/*"]                │
 │    └──────────┬──────────────────────────────────────────────┬────────────────────────┐             │
 │               │                                              │                        │             │
 │  ┌────────────▼──────────────────┐   ┌───────────────────────▼─────────┐  ┌───────────▼──────────┐  │
 │  │ apps/auth-api/                │   │ apps/habits-api/                │  │ apps/web/            │  │
 │  │ (@habitpair/auth-api)         │   │ (@habitpair/habits-api)         │  │ (@habitpair/web)     │  │
 │  │                               │   │                                 │  │                      │  │
 │  │  setGlobalPrefix('auth')      │   │  setGlobalPrefix('habits')      │  │ React + Vite + TQ    │  │
 │  │                               │   │                                 │  │                      │  │
 │  │  prisma/schema.prisma         │   │  prisma/schema.prisma           │  │ apiClient sends      │  │
 │  │   └─ own datasource           │   │   └─ own datasource             │  │   Authorization:     │  │
 │  │   └─ generator (output:       │   │   └─ generator (output:         │  │   Bearer <jwt>       │  │
 │  │      ../generated/prisma)     │   │      ../generated/prisma)       │  │                      │  │
 │  │   └─ (User, Session ...)      │   │   └─ Habit                      │  │                      │  │
 │  │                               │   │                                 │  └──────────────────────┘  │
 │  │  src/prisma/                  │   │  src/prisma/                    │                            │
 │  │   ├─ prisma.service.ts        │   │   ├─ prisma.service.ts          │                            │
 │  │   └─ prisma.module.ts         │   │   └─ prisma.module.ts           │                            │
 │  │      (per-service, not shared)│   │      (per-service, not shared)  │                            │
 │  │                               │   │                                 │                            │
 │  │  src/health/                  │   │  src/health/                    │                            │
 │  │   ├─ GET /auth/health         │   │   ├─ GET /habits/health         │                            │
 │  │   └─ GET /auth/health/ready   │   │   └─ GET /habits/health/ready   │                            │
 │  │      (Prisma DB ping)         │   │      (Prisma DB ping)           │                            │
 │  │                               │   │                                 │                            │
 │  │  src/(login/users — future)   │   │  src/auth/jwt.guard.ts          │                            │
 │  │   └─ POST /auth/login         │   │   └─ verifies HS256 with        │                            │
 │  │      signs JWT (HS256)        │   │      shared JWT_SECRET          │                            │
 │  │                               │   │  src/habits/                    │                            │
 │  │                               │   │   ├─ GET  /habits  (list)       │                            │
 │  │                               │   │   └─ POST /habits  (create)     │                            │
 │  └───────────────────────────────┘   └─────────────────────────────────┘                            │
 │                                                                                                     │
 │   JWT_SECRET injected into BOTH services from the same K8s secret `auth-jwt-secret` (key: secret).  │
 │   No service-to-service HTTP: habits-api verifies the token locally with the shared key.            │
 │                                                                                                     │
 └────────┬──────────────────┬─────────────────────────────────┬────────────────────┬─────────────────┘
          │                  │                                 │                    │
  make up │                  │ make k8s                        │                    │ make aws-deploy
          │                  │                                 │                    │
          ▼                  ▼                                 ▼                    ▼
 ┌─[ 4. LOCAL DEV ]────┐ ┌─[ 5. BUILD ARTIFACTS ]───────────────┐              ┌─[ 6. CI/CD ]──────────┐
 │                     │ │                                       │              │                       │
 │ docker-compose.yaml │ │ TypeScript: nest build (per service)  │              │ .github/workflows/    │
 │  └─ Postgres :5434  │ │  └─ apps/auth-api/dist/               │              │  ├─ auth-api-ci.yaml  │
 │     POSTGRES_DB=auth│ │  └─ apps/habits-api/dist/             │              │  ├─ habits-api-ci.yaml│
 │     init.sql →      │ │                                       │              │  ├─ web-ci.yaml       │
 │       CREATE        │ │ Prisma: prisma generate (per service) │              │  └─ infra-ci.yaml     │
 │       DATABASE      │ │  └─ apps/<svc>/generated/prisma/      │              │                       │
 │       habits;       │ │     (own output dir per service —     │              │ Path-filtered: each   │
 │                     │ │      avoids hoist conflict on the     │              │ workflow only fires on│
 │ Both NestJS         │ │      root node_modules/.prisma)       │              │ its own app's files.  │
 │  services on host,  │ │                                       │              │                       │
 │  watch mode:        │ │ Docker: per-service Dockerfile        │              │ On merge → main:      │
 │  - auth :3000       │ │  (context = repo root, workspace-     │              │  - build arm64 image  │
 │  - habits :3001     │ │   aware multi-stage)                  │              │  - push to GHCR       │
 │                     │ │  └─ ghcr.io/.../auth-api:<sha>        │              │  - SSH kubectl set-   │
 │ Web (Vite) :5173    │ │  └─ ghcr.io/.../habits-api:<sha>      │              │    image deployment/.. │
 │                     │ │                                       │              │                       │
 └─────────────────────┘ └───────────────────┬───────────────────┘              └───────────┬───────────┘
                                             │                                              │
                                             ▼                                              ▼
 ┌─[ 7. SKAFFOLD ORCHESTRATES (local k3d only) ]─────────────────────────────────────────────────────┐
 │                                                                                                    │
 │   skaffold.yaml                                                                                    │
 │     build.artifacts:                                                                               │
 │        - image: auth-api    (apps/auth-api/Dockerfile)                                             │
 │        - image: habits-api  (apps/habits-api/Dockerfile)                                           │
 │     manifests.kustomize.paths:                                                                     │
 │        └─ infra/k8s/overlays/local  ──────────────────────────────────────┐                       │
 │     deploy.kubectl: {}                                                     │                       │
 │     portForward:                                                           │                       │
 │       - auth-api-service   :3000 → localhost:3000                          │                       │
 │       - habits-api-service :3000 → localhost:3001                          │                       │
 │                                                                            │                       │
 └────────────────────────────────────────────────────────────────────────────┼───────────────────────┘
                                                                              │
                                                                              ▼
 ┌─[ 8. KUSTOMIZE: base + overlay ]──────────────────────────────────────────────────────────────────┐
 │                                                                                                    │
 │   overlays/local/kustomization.yaml                       base/kustomization.yaml                  │
 │    resources:                                              resources:                              │
 │     - ../../base  ───────────────────────────────────►      - namespace.yaml                       │
 │     - secrets.yaml                                          - auth-api-deployment.yaml             │
 │        ├ db-credentials       (auth DB url)                 - auth-api-service.yaml                │
 │        ├ habits-db-credentials (habits DB url)              - habits-api-deployment.yaml           │
 │        └ auth-jwt-secret      (HS256 key)                   - habits-api-service.yaml              │
 │    patches:                                                 - ingress.yaml                         │
 │     - ingress-patch.yaml (web entrypoint, no Host)            (Middlewares + IngressRoute          │
 │     - remove /spec/tls   (no Let's Encrypt in k3d)             with /api/auth + /api/habits        │
 │                                                                routes — no catch-all)              │
 │                                                                                                    │
 │   overlays/aws/kustomization.yaml                                                                  │
 │    resources: - ../../base                                                                         │
 │    images:    - auth-api   → ghcr.io/.../auth-api                                                  │
 │               - habits-api → ghcr.io/.../habits-api                                                │
 │    patches:   ingress-patch.yaml (Host(api.habitpair.com), websecure, letsencrypt)                 │
 │                                                                                                    │
 │   AWS-only secrets are NOT in kustomize — they're created by aws-bootstrap.sh post-apply so the    │
 │   RDS-generated password and HS256 key never enter the git repo.                                   │
 │                                                                                                    │
 └───────────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                     │
                                                     ▼
 ┌─[ 9. KUBERNETES RESOURCES (applied in dependency order) ]─────────────────────────────────────────┐
 │                                                                                                    │
 │   ①  Namespace: habitpair                    ← isolated "room" for all resources                  │
 │           │                                                                                        │
 │           ▼                                                                                        │
 │   ②  Secrets (created by aws-bootstrap.sh on AWS, by kustomize overlay locally):                  │
 │       ├─ db-credentials         (url → auth DB)                                                    │
 │       ├─ habits-db-credentials  (url → habits DB)                                                  │
 │       └─ auth-jwt-secret        (secret → 32-byte HS256 key, shared by both services)              │
 │           │                                                                                        │
 │           ▼                                                                                        │
 │   ③  Deployment: auth-api (replicas: 1) ───► ReplicaSet ───► Pod                                  │
 │           │   env: DATABASE_URL ← db-credentials.url                                               │
 │           │        JWT_SECRET   ← auth-jwt-secret.secret                                           │
 │           │   livenessProbe:  GET /auth/health       every 15s                                     │
 │           │   readinessProbe: GET /auth/health/ready every 10s                                     │
 │           │                                                                                        │
 │   ④  Deployment: habits-api (replicas: 1) ─► ReplicaSet ───► Pod                                  │
 │           │   env: DATABASE_URL ← habits-db-credentials.url                                        │
 │           │        JWT_SECRET   ← auth-jwt-secret.secret  ← SAME key as auth-api                   │
 │           │   livenessProbe:  GET /habits/health       every 15s                                   │
 │           │   readinessProbe: GET /habits/health/ready every 10s                                   │
 │           │                                                                                        │
 │           ▼                                                                                        │
 │   ⑤  Services: auth-api-service:3000  ── selects app=auth-api                                     │
 │                habits-api-service:3000 ── selects app=habits-api                                   │
 │           │                                                                                        │
 │           ▼                                                                                        │
 │   ⑥  Middlewares (Traefik CRDs):  rate-limit │ rate-limit-auth │ security-headers │ api-strip     │
 │           │                                                                                        │
 │           ▼                                                                                        │
 │   ⑦  IngressRoute: api-gateway                                                                    │
 │           routes (order matters — first match wins, no catch-all):                                 │
 │             /api/auth/*   → auth-api-service     (rate-limit-auth — stricter)                     │
 │             /api/habits/* → habits-api-service   (rate-limit)                                      │
 │           any other /api/... → 404 at the gateway                                                  │
 │                                                                                                    │
 └───────────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                     │
                                                     ▼
 ┌─[ 10. REQUEST FLOW (runtime) ]────────────────────────────────────────────────────────────────────┐
 │                                                                                                    │
 │   Browser:  http://localhost:8080/api/habits  (with Authorization: Bearer <jwt>)                   │
 │        │                                                                                           │
 │        ▼                                                                                           │
 │   k3d proxy container (Docker port map 8080 → 80)                                                  │
 │        │                                                                                           │
 │        ▼                                                                                           │
 │   Traefik (in kube-system, listens on :80 = "web" entryPoint)                                      │
 │        │                                                                                           │
 │        ▼                                                                                           │
 │   IngressRoute match: PathPrefix(`/api/habits`)                                                    │
 │        │                                                                                           │
 │        ▼                                                                                           │
 │   Pipeline: rate-limit → security-headers → api-strip  (/api/habits → /habits)                     │
 │        │                                                                                           │
 │        ▼                                                                                           │
 │   Service habits-api-service:3000  ──► load-balances to matching pods                              │
 │        │                                                                                           │
 │        ▼                                                                                           │
 │   Pod (container: habits-api)                                                                      │
 │        │                                                                                           │
 │        ▼                                                                                           │
 │   NestJS: global prefix `habits` + JwtGuard on HabitsController                                    │
 │        │     ├─ guard verifies token with JWT_SECRET (no call to auth-api)                         │
 │        │     ├─ attaches req.user = { sub: userId }                                                │
 │        │     └─ HabitsController.list(req) → prisma.habit.findMany({ where: { userId } })          │
 │        ▼                                                                                           │
 │   200 OK [ { id, userId, title, createdAt } ]                                                      │
 │                                                                                                    │
 │   ─────────────────────────────────────────────────────────────────────────────────────────────   │
 │                                                                                                    │
 │   Health-check paths (no auth):                                                                    │
 │      http://localhost:8080/api/auth/health   → auth-api    HealthController                        │
 │      http://localhost:8080/api/habits/health → habits-api  HealthController                        │
 │                                                                                                    │
 │   Skaffold port-forward (bypasses Traefik — direct to pod):                                        │
 │      http://localhost:3000/auth/health      → auth-api                                             │
 │      http://localhost:3001/habits/health    → habits-api                                           │
 │                                                                                                    │
 └────────────────────────────────────────────────────────────────────────────────────────────────────┘


 ╔══════════════════════════════════════════════════════════════════════════════════════════════════╗
 ║  FILE RESPONSIBILITY CHEAT-SHEET                                                                  ║
 ╠══════════════════════════════════════════════════════════════════════════════════════════════════╣
 ║  Makefile                       → developer-facing command aliases                                ║
 ║  package.json (root)            → declares workspace layout                                       ║
 ║  apps/auth-api/                 → auth service (NestJS, global prefix /auth, own Prisma schema)   ║
 ║  apps/habits-api/               → habits service (NestJS, global prefix /habits, own Prisma)     ║
 ║  apps/web/                      → React SPA (Vite + TanStack Router/Query + Tailwind v4)         ║
 ║  apps/<svc>/Dockerfile          → per-service multi-stage container build (context = repo root)  ║
 ║  infra/docker/*                 → local Postgres via Docker Compose; init.sql adds `habits` DB   ║
 ║  infra/k8s/base/*               → production-accurate K8s manifests (both services)              ║
 ║  infra/k8s/overlays/local/      → k3d-specific patches (web entryPoint, no TLS, local secrets)   ║
 ║  infra/k8s/overlays/aws/        → AWS k3s patches (Host(api.habitpair.com), letsencrypt, GHCR)   ║
 ║  infra/scripts/aws-bootstrap.sh → post-Terraform: create `habits` DB on RDS, all K8s secrets     ║
 ║  skaffold.yaml                  → build both images + kustomize + deploy + port-forward          ║
 ║  .github/workflows/*-ci.yaml    → per-service CI/CD pipelines, path-filtered                     ║
 ║  .env.example files             → document required env vars (DATABASE_URL, JWT_SECRET, etc.)    ║
 ╚══════════════════════════════════════════════════════════════════════════════════════════════════╝


## Custom domain: api.habitpair.com

The AWS overlay accepts two hostnames in parallel:

- `api.habitpair.com` — canonical. Cloudflare A record (proxy status: **DNS only** / grey cloud) pointing at the current Elastic IP. Terraform manages this record.
- `<EIP-with-dashes>.sslip.io` — fallback. Resolves to the EIP via sslip.io's wildcard DNS, so the cluster is reachable even before any DNS change propagates.

The Elastic IP is destroyed and re-allocated on every `make aws-down` / `aws-up` cycle. Terraform updates the Cloudflare record automatically.

Let's Encrypt issues one certificate per matched `Host()` on first request to that host (~60s). Certs are persisted in `/data/acme.json` on the EC2 node, so they survive Traefik pod restarts.
