FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY packages/gateway/package.json packages/gateway/package.json
COPY packages/skill/package.json packages/skill/package.json
RUN npm install --omit=dev --workspace @alexa-plex-proxy/gateway

COPY packages/gateway packages/gateway

ENV NODE_ENV=production
EXPOSE 3000

USER node
CMD ["node", "packages/gateway/src/server.js"]
