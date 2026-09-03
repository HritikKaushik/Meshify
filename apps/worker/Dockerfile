# Assembled via `pnpm deploy` — runtime derived from the actual dependency graph,
# so no hand-maintained per-package COPY lists to drift.
FROM node:26-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages packages
COPY apps/worker apps/worker
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @meshify/worker... build
RUN pnpm --filter=@meshify/worker deploy --prod /prod

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
USER node
EXPOSE 9091
# The worker now has a small metrics/health HTTP server (queue depth + process
# metrics). Liveness hits its /healthz — answers from this process alone.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.WORKER_METRICS_PORT||9091)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
