# Givova TI API — production image (Railway builds this automatically when the
# service Root Directory is /backend-nest). Reproducible: pinned Node version and
# `npm ci` from package-lock.json. No secrets are read at build time.

# ---- build ----
FROM node:22.23.4-bookworm-slim AS build
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:22.23.4-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/src ./dist/src
COPY --chown=node:node migrations ./migrations
USER node
# Railway injects PORT; 8000 is the local default.
EXPOSE 8000
# node is PID 1 so SIGTERM reaches the app's graceful-shutdown handler
# (npm would not forward signals reliably). Migrations are NOT run here.
CMD ["node", "dist/src/main.js"]
