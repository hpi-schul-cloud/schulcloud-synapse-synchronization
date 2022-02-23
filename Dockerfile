ARG NODE_IMAGE_TAG="12.16.1-slim"

FROM node:${NODE_IMAGE_TAG} AS build

WORKDIR /app

COPY . .

RUN npm ci

FROM node:${NODE_IMAGE_TAG} AS release

USER node

WORKDIR /usr/src/app

ENV NODE_ENV "production"

COPY --from=build /app/config /usr/src/app/config/
COPY --from=build /app/node_modules /usr/src/app/node_modules/
COPY --from=build /app/src /usr/src/app/src/
COPY --from=build /app/data /usr/src/app/data/
COPY --from=build /app/index.js /usr/src/app
COPY --from=build /app/package.json /usr/src/app

CMD [ "node", "index.js" ]
