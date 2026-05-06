FROM node:24-bookworm-slim

ARG CCENTER_PACKAGE_SPEC=commandscenter

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g "$CCENTER_PACKAGE_SPEC" \
  && mkdir -p /workspace \
  && chown -R node:node /workspace

ENV NODE_ENV=production
ENV CC_DOCKER=true
ENV CC_HOST=0.0.0.0
ENV CC_PORT=3000
ENV CC_WORKSPACE_DIR=/workspace/.cc/workspace

WORKDIR /workspace

USER node

EXPOSE 3000
VOLUME ["/workspace"]

CMD ["ccenter", "start", "--cc-env-file", "/workspace/.cc/.env"]
