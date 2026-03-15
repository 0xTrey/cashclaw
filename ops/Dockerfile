FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts tsup.config.ts ./
COPY src ./src
RUN npm ci --ignore-scripts
RUN npm run build:all
RUN npm prune --omit=dev

FROM node:22-bookworm-slim

RUN useradd --create-home --uid 10001 --shell /bin/bash worker
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER worker
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
