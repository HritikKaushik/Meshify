# Assembled via `pnpm deploy` — runtime derived from the actual dependency graph,
# so no hand-maintained per-package COPY lists to drift.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages packages
COPY apps/bff apps/bff
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @meshify/bff... build
RUN pnpm --filter=@meshify/bff deploy --prod /prod

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
EXPOSE 3001
# Liveness only — /healthz answers from this process alone (no downstream call).
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||process.env.BFF_PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
