# Збірка: фронт (Vite) + BFF (NestJS) в одному образі. Nest роздає зібраний React.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY packages packages
COPY apps apps
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev -w apps/api --include-workspace-root=false
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist
RUN mkdir -p /app/data/uploads && chown -R node /app/data
USER node
ENV UPLOADS_DIR=/app/data/uploads
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
