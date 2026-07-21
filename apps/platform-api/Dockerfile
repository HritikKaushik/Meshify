# Assembled via `pnpm deploy` — the runtime image is derived from the actual
# dependency graph, so there are no hand-maintained per-package COPY lists to
# drift out of sync (the failure mode that previously shipped host-built dist).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Whole workspace source (the .dockerignore keeps node_modules/dist/tsbuildinfo
# out). Copying wholesale is what removes the drift — `pnpm deploy` prunes to just
# what platform-api needs. Other apps' manifests may be absent; pnpm tolerates it.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages packages
COPY apps/platform-api apps/platform-api
RUN pnpm install --frozen-lockfile
# Build the app and its workspace dependencies (`...` = "and its deps").
RUN pnpm --filter @meshify/platform-api... build
# Produce a self-contained prod deployment (app + injected workspace deps + prod
# node_modules). data-access ships its migrations/ so the migrate Job can run.
RUN pnpm --filter=@meshify/platform-api deploy --prod /prod

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod ./
USER node
EXPOSE 3000
# Liveness only — /health/live has no downstream checks (mirrors the K8s probe).
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||process.env.PLATFORM_PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
