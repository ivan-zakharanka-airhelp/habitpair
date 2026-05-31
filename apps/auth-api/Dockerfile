# Build context: repo root (habitpair/)
# node:22-slim (Debian/glibc), not alpine (musl): argon2 ships prebuilt glibc
# binaries, so `npm ci` needs no python3/make/g++ toolchain to compile it.
FROM node:22-slim AS build
WORKDIR /app

# Prisma's engines dynamically link libssl. Without it, the install picks the
# openssl-1.1.x engine and TLS to RDS (PG16 enforces SSL) fails. Install before
# `npm ci` so the generated query engine matches the system openssl (3.0.x).
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/auth-api/package.json ./apps/auth-api/
RUN npm ci

COPY apps/auth-api/ ./apps/auth-api/
RUN npm run generate -w @habitpair/auth-api
RUN npm run build -w @habitpair/auth-api

FROM node:22-slim AS production
WORKDIR /app
ENV NODE_ENV=production

# Runtime libssl for Prisma's schema engine (migrate deploy, run as an
# initContainer) and query engine; also selects the openssl-3.0.x engine here.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/auth-api/package.json ./apps/auth-api/
RUN npm ci --omit=dev

COPY --from=build /app/apps/auth-api/dist ./apps/auth-api/dist
COPY --from=build /app/apps/auth-api/generated ./apps/auth-api/generated
COPY --from=build /app/apps/auth-api/prisma ./apps/auth-api/prisma

EXPOSE 3000
CMD ["node", "apps/auth-api/dist/main.js"]
