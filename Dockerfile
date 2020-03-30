ARG NODE_IMAGE_TAG="12.16.1-slim"

# --- build --------------------------------------------------------------------
FROM node:${NODE_IMAGE_TAG} AS build

COPY ./ /app

RUN set -x \
    && cd /app \
    && npm install \
    && npm run lint \
    && npm run test \
    && rm -rf node_modules \
    && npm install --no-optional --only=production

# --- release ------------------------------------------------------------------
FROM node:${NODE_IMAGE_TAG} AS release

USER node

WORKDIR /usr/src/app

ENV NODE_ENV "production"

COPY --from=build /app/config /usr/src/app/config/
COPY --from=build /app/node_modules /usr/src/app/node_modules/
COPY --from=build /app/src /usr/src/app/src/
COPY --from=build /app/index.js /usr/src/app

CMD [ "node", "index.js" ]
