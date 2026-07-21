# Assembled via `pnpm deploy` — runtime derived from the actual dependency graph,
# so no hand-maintained per-package COPY lists to drift.
FROM node:26-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages packages
COPY apps/observability apps/observability
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @meshify/observability... build
RUN pnpm --filter=@meshify/observability deploy --prod /prod

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod ./
# No HEALTHCHECK — the DAP subscriber has no HTTP surface; restart-on-exit only.
USER node
CMD ["node", "dist/main.js"]
