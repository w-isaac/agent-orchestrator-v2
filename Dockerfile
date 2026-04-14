FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

FROM base AS dev
CMD ["npx", "ts-node", "--transpile-only", "src/index.ts"]

FROM base AS build
RUN npx tsc

FROM node:22-alpine AS production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY src/migrations ./src/migrations
CMD ["node", "dist/index.js"]
