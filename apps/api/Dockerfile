# syntax=docker/dockerfile:1.7
#
# Production image for the Afghan IT Academy API.
# Build from the repository root:
#   docker build -f apps/api/Dockerfile -t aia-api .

# ---------------------------------------------------------------------------
# Stage 1 — install dependencies for the API workspace only
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
RUN corepack enable
WORKDIR /repo

# Copy only manifests first so the dependency layer is cached until they change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/ui/package.json packages/ui/

# `--ignore-scripts` here because the Prisma schema is not in this layer yet;
# the client is generated in the build stage instead.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------------------
# Stage 2 — build
# ---------------------------------------------------------------------------
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /repo/packages ./packages
COPY . .

RUN pnpm --filter @afghan-it-academy/shared build \
 && pnpm --filter @afghan-it-academy/api exec prisma generate \
 && pnpm --filter @afghan-it-academy/api build

# Re-resolve to production dependencies only, into a self-contained directory.
# The filter must precede `deploy`; pnpm 9 has no --legacy flag (that is pnpm 10).
RUN pnpm --filter=@afghan-it-academy/api deploy --prod /app

# ---------------------------------------------------------------------------
# Stage 3 — runtime
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Alpine images ship without tzdata; certificate rendering and scheduling depend
# on a correct Kabul offset.
RUN apk add --no-cache tzdata
ENV TZ=Asia/Kabul

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The generated Prisma client. `pnpm deploy` rebuilds the dependency tree and
# its store does NOT carry the client generated earlier in this stage, so
# copying it explicitly is what keeps the container from dying on first query.
COPY --from=build /repo/apps/api/generated ./generated
# Migrations, so `prisma migrate deploy` can run against this image.
COPY --from=build /repo/apps/api/prisma ./prisma

# Never run as root: a container escape should not start with uid 0.
USER node

EXPOSE 4000

# Readiness is checked by the orchestrator; this covers plain `docker run`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
