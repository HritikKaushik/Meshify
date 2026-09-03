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

# Runtime: a plain node image (no corepack/pnpm), OS packages patched to the
# latest Alpine builds, and npm/yarn removed. Nothing here runs npm - the app,
# the HEALTHCHECK and the migrator are all `node ...` - and npm's bundled deps
# (node-tar, minimatch) are what the Trivy gate keeps flagging in the base image.
FROM node:22-alpine AS runtime
RUN apk upgrade --no-cache \
	&& rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
		/usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
		/usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-v*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod ./
# No HEALTHCHECK — the DAP subscriber has no HTTP surface; restart-on-exit only.
USER node
CMD ["node", "dist/main.js"]
