#
# Order tracking (purchase) — один образ: BFF (NestJS) + зібраний фронт (React/Vite, apps/web/dist),
# який Nest роздає сам (ServeStaticModule, усе поза /api/*).
#
# Контекст збірки — корінь репозиторію:
#     docker build -t purchase:local .
# Реєстр і версію Node можна перевизначити, не чіпаючи файл:
#     docker build --build-arg REGISTRY=docker.io/library --build-arg NPM_REGISTRY=https://registry.npmjs.org ...
#
# Збірка — на повному node-образі Nexus (у ньому вшиті корені К-2); рантайм — node:<v>-alpine без npm/yarn
# (стандарт образів К-2, kk-warspace docs/docker.md). Повний Debian-образ у рантаймі тягнув imagemagick,
# *-dev-бібліотеки та linux-libc-dev — звідти всі CRITICAL Trivy. Нативних модулів у prod-залежностях немає
# (npm ci --ignore-scripts), тож node_modules зі стадії deps (glibc) працюють і на musl.

ARG REGISTRY=10.20.50.25:8081
ARG NODE_VERSION=26
# Образ збірки можна підмінити на внутрішній з уже вшитим CA-ланцюжком:
#     docker build --build-arg BASE_IMAGE=10.20.50.25:8081/node-internal-ca:26 ...
ARG BASE_IMAGE=${REGISTRY}/node:${NODE_VERSION}
ARG RUNTIME_IMAGE=${REGISTRY}/node:${NODE_VERSION}-alpine
# Дзеркало npm для npm ci. Порожнє = registry.npmjs.org.
ARG NPM_REGISTRY=


FROM $BASE_IMAGE AS base
ARG NPM_REGISTRY
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY" --location=global; fi
WORKDIR /app
# Спершу лише маніфести — шари залежностей перезбираються тільки при зміні залежностей, не коду.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# Без RUN --mount: джоба «Purchase Build» збирає класичним збирачем (DOCKER_BUILDKIT=0).
FROM base AS build
RUN npm ci
COPY packages packages
COPY apps apps
RUN npm run build

# --- prod-залежності api (паралельно зі збіркою) ---
# packages/shared — лише типи (import type), у рантаймі не потрібен; маніфест копіюється тільки
# для того, щоб npm ci бачив усі воркспейси з package-lock.json.
FROM base AS deps
RUN npm ci --omit=dev --workspace=apps/api --include-workspace-root=false --ignore-scripts \
    && mkdir -p apps/api/node_modules
# Корені К-2 з бази Nexus — одним файлом для NODE_EXTRA_CA_CERTS (awk 1 — перевід рядка між файлами).
RUN awk 1 /usr/local/share/ca-certificates/*.crt > /k2-ca.pem

# --- runtime ---
FROM $RUNTIME_IMAGE
# Менеджери пакетів у рантаймі не потрібні (і несуть власні вразливі залежності).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=deps /k2-ca.pem /etc/ssl/k2-ca.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/k2-ca.pem
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/package.json ./
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/apps/api/package.json apps/api/
COPY --from=deps /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist

# Вкладені файли: у docker compose і Kubernetes сюди монтується том (див. deploy.yaml).
# Процес — node (uid 1000): з ним збігається chown в initContainer deploy.yaml.
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
ENV PORT=3000
ENV UPLOADS_DIR=/app/data/uploads
EXPOSE 3000
USER node
CMD ["node", "apps/api/dist/main.js"]
