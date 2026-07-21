# Assembled via `pnpm deploy` — runtime derived from the actual dependency graph,
# so no hand-maintained per-package COPY lists to drift.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages packages
COPY apps/worker apps/worker
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @meshify/worker... build
RUN pnpm --filter=@meshify/worker deploy --prod /prod

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod ./
# No HEALTHCHECK — the worker has no HTTP surface; restart-on-exit only.
USER node
CMD ["node", "dist/main.js"]
