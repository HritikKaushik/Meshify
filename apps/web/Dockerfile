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

FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime
# Patch the OS packages to the latest Alpine builds: the Trivy gate fails on fixable
# HIGH/CRITICAL CVEs and base images lag the Alpine repos. Needs root; drop back.
USER root
RUN apk upgrade --no-cache
USER nginx
# Where nginx forwards /api. Override per environment (compose: http://bff:3001;
# split hosting: the BFF's private address - a full URL like Railway's
# http://meshify-bff.railway.internal:3001, or a bare host:port such as Render's
# `fromService: hostport` value; nginx.conf.template adds the scheme when missing).
# Rendered into the config at startup.
ENV BFF_UPSTREAM=http://bff:3001
# The port nginx listens on. Defaults to 8080 (unprivileged nginx can't bind <1024);
# a host that injects its own $PORT (Render, Railway) overrides this and nginx follows.
ENV PORT=8080
# Opt the image entrypoint into deriving ${NGINX_LOCAL_RESOLVERS} from /etc/resolv.conf
# (guarded off by default). The /api location's request-time resolver needs it so
# the container boots even when the BFF's internal DNS is briefly unresolvable.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
# Startup hook (sourced by the image entrypoint before envsubst): qualifies a bare
# BFF_UPSTREAM host with the DNS search domain on Kubernetes-style platforms such
# as Render, where nginx's resolver would otherwise fail on the short name.
COPY --chmod=0755 apps/web/docker-entrypoint.d/10-qualify-upstream.envsh /docker-entrypoint.d/10-qualify-upstream.envsh
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
	CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/" || exit 1
