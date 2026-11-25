# Production image for treflestudio.com, built on the VPS by deploy/deploy.sh.
FROM node:22-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install from the lockfile first so this layer is cached between deploys.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
