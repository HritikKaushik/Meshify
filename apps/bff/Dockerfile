FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json packages/config/package.json
COPY packages/data-access/package.json packages/data-access/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/bff/package.json apps/bff/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/config packages/config
COPY packages/data-access packages/data-access
COPY packages/shared packages/shared
COPY apps/bff apps/bff
RUN pnpm --filter @meshify/config --filter @meshify/data-access --filter @meshify/shared build \
	&& pnpm --filter @meshify/bff build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/pnpm-workspace.yaml /repo/package.json /repo/pnpm-lock.yaml ./
COPY --from=build /repo/packages/config/package.json packages/config/package.json
COPY --from=build /repo/packages/config/dist packages/config/dist
COPY --from=build /repo/packages/data-access/package.json packages/data-access/package.json
COPY --from=build /repo/packages/data-access/dist packages/data-access/dist
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/bff/package.json apps/bff/package.json
COPY --from=build /repo/apps/bff/dist apps/bff/dist
RUN pnpm install --frozen-lockfile --prod

# Drop root: node:alpine ships an unprivileged `node` user (uid 1000). K8s also
# pins runAsNonRoot, but this makes `docker run`/compose non-root by default too.
USER node

EXPOSE 3001
# Liveness only — hits the BFF's own /healthz, never a downstream service, so a
# transient platform-api outage doesn't flap the BFF container.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.BFF_PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/bff/dist/main.js"]
