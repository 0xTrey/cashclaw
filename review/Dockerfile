FROM node:22-bookworm-slim

RUN useradd --create-home --uid 10001 --shell /bin/bash reviewer

ENV HOME=/home/reviewer
WORKDIR /opt/cashclaw-src

COPY package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts tsup.config.ts ./
COPY src ./src
COPY test ./test
COPY review/entrypoint.sh /usr/local/bin/review-entrypoint

RUN chmod 0755 /usr/local/bin/review-entrypoint \
  && npm ci --ignore-scripts

USER reviewer

ENTRYPOINT ["/usr/local/bin/review-entrypoint"]
