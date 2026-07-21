# check=skip=SecretsUsedInArgOrEnv
# ^ The only build ARG is the Clerk PUBLISHABLE key, which is public by design, so
#   the SecretsUsedInArgOrEnv heuristic (it trips on the substring "KEY") is a
#   false positive here — the directive above silences it so CI stays green.
# Build the static SPA, then serve it from an unprivileged nginx that also proxies
# /api to the BFF (single-origin — see nginx.conf.template). The same dist/ can
# instead be uploaded to Cloudflare Pages/Netlify if you prefer a managed CDN;
# this image is the portable, self-hostable path that fits compose/K8s.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @meshify/web...
COPY tsconfig.base.json ./
COPY apps/web apps/web
# The Clerk PUBLISHABLE key is public by design; Vite inlines only VITE_-prefixed
# vars, so nothing secret can reach the bundle. Pass it at build time:
#   docker build --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_live_... -f apps/web/Dockerfile .
ARG VITE_CLERK_PUBLISHABLE_KEY
RUN VITE_CLERK_PUBLISHABLE_KEY="$VITE_CLERK_PUBLISHABLE_KEY" pnpm --filter @meshify/web build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
# Where nginx forwards /api. Override per environment (compose: http://bff:3001;
# split hosting: the BFF's internal URL). Rendered into the config at startup.
ENV BFF_UPSTREAM=http://bff:3001
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
	CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
