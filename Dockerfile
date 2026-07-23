# Apex — container image for Azure Container Apps.
#
# Two stages: a builder that installs the full dependency tree and compiles,
# and a runtime that carries only Next's traced standalone output. The runtime
# has no package manager, no node_modules tree of its own and no source — the
# smaller the surface, the less there is to patch later.

# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first so the dependency layer is cached independently of the
# source. Editing a component should not reinstall the world.
COPY package.json package-lock.json ./
# `npm ci` rather than `npm install`: it installs exactly what the lockfile
# pins and fails loudly on drift, which is what a reproducible build needs.
RUN npm ci

COPY . .

# Telemetry off at build AND run — this is a healthcare demo and outbound
# calls we did not ask for are not something to shrug at.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------------------
# Controlled migration runner (explicit target only)
# ---------------------------------------------------------------------------
# This stage is published separately from the web image. It contains only the
# V1 importer and its runtime dependency, and defaults to a read-only dry run.
# An apply still needs all three controls enforced by migrate-v1.ts.
FROM node:22-alpine AS migration

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY scripts/migrate-v1.ts scripts/register-alias.mjs scripts/alias-hooks.mjs ./scripts/
COPY lib/migration/v1.ts ./lib/migration/v1.ts
COPY lib/authz/profiles.ts ./lib/authz/profiles.ts
COPY lib/mock/roster.ts ./lib/mock/roster.ts

USER node
CMD ["node", "--experimental-strip-types", "--no-warnings", "--import", "./scripts/register-alias.mjs", "scripts/migrate-v1.ts", "--mode=rehearsal"]

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Container Apps routes to the container's own interface; binding to localhost
# would make the app unreachable from ingress while looking perfectly healthy.
ENV HOSTNAME=0.0.0.0

# Run as a non-root user. `node` already exists in the base image with uid 1000.
USER node

# `standalone` carries the server and exactly the traced dependencies. `static`
# is NOT part of that trace and must be copied separately — omitting it yields
# a site that boots fine and renders completely unstyled.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Brand assets (the real Alpha Health logo PNGs). Static files under public/ are
# NOT part of Next's standalone trace, so they must be copied explicitly — the
# same reason .next/static is copied above. Apex previously shipped no public/
# dir at all; the logo lockups are the first real static assets.
COPY --from=builder --chown=node:node /app/public ./public

# Migrations are READ FROM DISK at runtime by a path string, so Next's
# dependency tracer never sees them and `standalone` does not carry them. The
# symptom is not a missing file error at build time — it is a container that
# boots happily and then reports
#   [apex] migration failed: Can't find meta/_journal.json file
# on the first database call, which is a long way from the cause.
COPY --from=builder --chown=node:node /app/lib/db/migrations ./lib/db/migrations

EXPOSE 3000

CMD ["node", "server.js"]
