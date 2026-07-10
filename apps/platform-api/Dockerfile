FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/package.json
COPY apps/platform-api/package.json apps/platform-api/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/config packages/config
COPY apps/platform-api apps/platform-api
RUN pnpm --filter @meshify/config build && pnpm --filter @meshify/platform-api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=build /repo/packages/config/package.json packages/config/package.json
COPY --from=build /repo/packages/config/dist packages/config/dist
COPY --from=build /repo/apps/platform-api/package.json apps/platform-api/package.json
COPY --from=build /repo/apps/platform-api/dist apps/platform-api/dist
RUN pnpm install --frozen-lockfile --prod

EXPOSE 3000
CMD ["node", "apps/platform-api/dist/main.js"]
