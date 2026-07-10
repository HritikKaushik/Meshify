FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/data-access/package.json packages/data-access/package.json
COPY packages/object-storage/package.json packages/object-storage/package.json
COPY packages/queues/package.json packages/queues/package.json
COPY packages/rocketride-gateway/package.json packages/rocketride-gateway/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/config packages/config
COPY packages/data-access packages/data-access
COPY packages/object-storage packages/object-storage
COPY packages/queues packages/queues
COPY packages/rocketride-gateway packages/rocketride-gateway
COPY packages/shared packages/shared
COPY apps/worker apps/worker
RUN pnpm --filter @meshify/config --filter @meshify/data-access --filter @meshify/object-storage --filter @meshify/queues --filter @meshify/rocketride-gateway --filter @meshify/shared build \
	&& pnpm --filter @meshify/worker build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=build /repo/packages/config/package.json packages/config/package.json
COPY --from=build /repo/packages/config/dist packages/config/dist
COPY --from=build /repo/packages/data-access/package.json packages/data-access/package.json
COPY --from=build /repo/packages/data-access/dist packages/data-access/dist
COPY --from=build /repo/packages/object-storage/package.json packages/object-storage/package.json
COPY --from=build /repo/packages/object-storage/dist packages/object-storage/dist
COPY --from=build /repo/packages/queues/package.json packages/queues/package.json
COPY --from=build /repo/packages/queues/dist packages/queues/dist
COPY --from=build /repo/packages/rocketride-gateway/package.json packages/rocketride-gateway/package.json
COPY --from=build /repo/packages/rocketride-gateway/dist packages/rocketride-gateway/dist
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/worker/package.json apps/worker/package.json
COPY --from=build /repo/apps/worker/dist apps/worker/dist
RUN pnpm install --frozen-lockfile --prod

CMD ["node", "apps/worker/dist/main.js"]
