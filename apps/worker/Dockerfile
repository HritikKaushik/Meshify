# The three package lists below MUST equal apps/worker/tsconfig.json's `references`
# closure (including transitive refs — providers pulls in github, slack, data-access).
# A clean in-image `tsc -b` fails if any referenced package's source is absent, so
# keep these in sync when the dependency graph changes.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json packages/config/package.json
COPY packages/data-access/package.json packages/data-access/package.json
COPY packages/github/package.json packages/github/package.json
COPY packages/object-storage/package.json packages/object-storage/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/queues/package.json packages/queues/package.json
COPY packages/rocketride-gateway/package.json packages/rocketride-gateway/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/slack/package.json packages/slack/package.json
COPY packages/vector-store/package.json packages/vector-store/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/config packages/config
COPY packages/data-access packages/data-access
COPY packages/github packages/github
COPY packages/object-storage packages/object-storage
COPY packages/providers packages/providers
COPY packages/queues packages/queues
COPY packages/rocketride-gateway packages/rocketride-gateway
COPY packages/shared packages/shared
COPY packages/slack packages/slack
COPY packages/vector-store packages/vector-store
COPY apps/worker apps/worker
RUN pnpm --filter @meshify/config --filter @meshify/data-access --filter @meshify/github --filter @meshify/object-storage --filter @meshify/providers --filter @meshify/queues --filter @meshify/rocketride-gateway --filter @meshify/shared --filter @meshify/slack --filter @meshify/vector-store build \
	&& pnpm --filter @meshify/worker build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/pnpm-workspace.yaml /repo/package.json /repo/pnpm-lock.yaml ./
COPY --from=build /repo/packages/config/package.json packages/config/package.json
COPY --from=build /repo/packages/config/dist packages/config/dist
COPY --from=build /repo/packages/data-access/package.json packages/data-access/package.json
COPY --from=build /repo/packages/data-access/dist packages/data-access/dist
COPY --from=build /repo/packages/github/package.json packages/github/package.json
COPY --from=build /repo/packages/github/dist packages/github/dist
COPY --from=build /repo/packages/object-storage/package.json packages/object-storage/package.json
COPY --from=build /repo/packages/object-storage/dist packages/object-storage/dist
COPY --from=build /repo/packages/providers/package.json packages/providers/package.json
COPY --from=build /repo/packages/providers/dist packages/providers/dist
COPY --from=build /repo/packages/queues/package.json packages/queues/package.json
COPY --from=build /repo/packages/queues/dist packages/queues/dist
COPY --from=build /repo/packages/rocketride-gateway/package.json packages/rocketride-gateway/package.json
COPY --from=build /repo/packages/rocketride-gateway/dist packages/rocketride-gateway/dist
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/slack/package.json packages/slack/package.json
COPY --from=build /repo/packages/slack/dist packages/slack/dist
COPY --from=build /repo/packages/vector-store/package.json packages/vector-store/package.json
COPY --from=build /repo/packages/vector-store/dist packages/vector-store/dist
COPY --from=build /repo/apps/worker/package.json apps/worker/package.json
COPY --from=build /repo/apps/worker/dist apps/worker/dist
RUN pnpm install --frozen-lockfile --prod

# Drop root: non-root `node` user (uid 1000), matching the K8s securityContext.
# No HEALTHCHECK — the worker has no HTTP surface; the kubelet/orchestrator
# restarts it on process exit (see the K8s worker deployment, which sets no probes).
USER node

CMD ["node", "apps/worker/dist/main.js"]
