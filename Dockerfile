FROM node:12.16.1-slim
WORKDIR /app
COPY . .
RUN npm ci --no-optional --only=production
CMD npm run start
