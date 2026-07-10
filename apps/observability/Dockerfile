FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/config/package.json packages/config/package.json
COPY packages/data-access/package.json packages/data-access/package.json
COPY packages/rocketride-gateway/package.json packages/rocketride-gateway/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/observability/package.json apps/observability/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/config packages/config
COPY packages/data-access packages/data-access
COPY packages/rocketride-gateway packages/rocketride-gateway
COPY packages/shared packages/shared
COPY apps/observability apps/observability
RUN pnpm --filter @meshify/config --filter @meshify/data-access --filter @meshify/rocketride-gateway --filter @meshify/shared build \
	&& pnpm --filter @meshify/observability build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/pnpm-workspace.yaml /repo/package.json /repo/pnpm-lock.yaml ./
COPY --from=build /repo/packages/config/package.json packages/config/package.json
COPY --from=build /repo/packages/config/dist packages/config/dist
COPY --from=build /repo/packages/data-access/package.json packages/data-access/package.json
COPY --from=build /repo/packages/data-access/dist packages/data-access/dist
COPY --from=build /repo/packages/rocketride-gateway/package.json packages/rocketride-gateway/package.json
COPY --from=build /repo/packages/rocketride-gateway/dist packages/rocketride-gateway/dist
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/observability/package.json apps/observability/package.json
COPY --from=build /repo/apps/observability/dist apps/observability/dist
RUN pnpm install --frozen-lockfile --prod

CMD ["node", "apps/observability/dist/main.js"]
