ARG NODE_IMAGE_TAG="12.16.1-slim"

# --- base ---------------------------------------------------------------------
FROM node:${NODE_IMAGE_TAG} AS base

WORKDIR /app

COPY . .

RUN set -x \
    && npm install --no-optional --only=production \
    && cp -R node_modules node_modules_production \
    && npm install

# --- test ---------------------------------------------------------------------
FROM base AS test

RUN set -x \
    && npm run lint \
    && npm run test

# --- release ------------------------------------------------------------------
FROM node:${NODE_IMAGE_TAG} AS release

USER node

WORKDIR /usr/src/app

ENV NODE_ENV "production"

COPY --from=base /app/config /usr/src/app/config/
COPY --from=base /app/node_modules_production /usr/src/app/node_modules/
COPY --from=base /app/src /usr/src/app/src/
COPY --from=base /app/index.js /usr/src/app

CMD [ "node", "index.js" ]
