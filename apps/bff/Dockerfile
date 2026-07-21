# Assembled via `pnpm deploy` — runtime derived from the actual dependency graph,
# so no hand-maintained per-package COPY lists to drift.
FROM node:26-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages packages
COPY apps/bff apps/bff
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @meshify/bff... build
RUN pnpm --filter=@meshify/bff deploy --prod /prod

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod ./
USER node
EXPOSE 3001
# Liveness only — /healthz answers from this process alone (no downstream call).
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||process.env.BFF_PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
