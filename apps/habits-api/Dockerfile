# Build context: repo root (habitpair/)
FROM node:22-alpine AS build
WORKDIR /app

# Prisma's engines dynamically link libssl. Without it, the install picks the
# openssl-1.1.x engine and TLS to RDS (PG16 enforces SSL) fails. Install before
# `npm ci` so the generated query engine matches the system openssl (3.0.x).
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY apps/habits-api/package.json ./apps/habits-api/
RUN npm ci

COPY apps/habits-api/ ./apps/habits-api/
RUN npm run generate -w @habitpair/habits-api
RUN npm run build -w @habitpair/habits-api

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# Runtime libssl for Prisma's schema engine (the migration Job runs
# `migrate deploy` from this same image) and query engine; also selects the
# openssl-3.0.x engine here.
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY apps/habits-api/package.json ./apps/habits-api/
RUN npm ci --omit=dev

COPY --from=build /app/apps/habits-api/dist ./apps/habits-api/dist
COPY --from=build /app/apps/habits-api/generated ./apps/habits-api/generated
COPY --from=build /app/apps/habits-api/prisma ./apps/habits-api/prisma

EXPOSE 3000
CMD ["node", "apps/habits-api/dist/main.js"]
