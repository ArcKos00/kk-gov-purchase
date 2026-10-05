FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data/uploads && chown -R node /app/data
USER node
VOLUME /app/data
EXPOSE 3000
CMD ["node", "src/server.js"]
