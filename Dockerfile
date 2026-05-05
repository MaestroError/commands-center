FROM node:24-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS deps

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/frontend/package.json packages/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS builder

COPY . .
RUN pnpm --filter commandscenter build

FROM base AS runtime

ENV NODE_ENV=production
ENV CC_DOCKER=true
ENV CC_HOST=0.0.0.0
ENV CC_PORT=3000
ENV CC_WORKSPACE_DIR=/workspace/.cc/workspace

COPY --from=builder /app /app

RUN mkdir -p /workspace \
  && chown -R node:node /app /workspace

USER node

EXPOSE 3000
VOLUME ["/workspace"]

CMD ["node", "packages/cli/dist/bin.mjs", "start"]
