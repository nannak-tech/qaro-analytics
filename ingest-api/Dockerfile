FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --include=dev || npm install

COPY . .

ENV NODE_ENV=production
EXPOSE 4100
# tsx runs TS directly (no build step), matching the dev workflow.
CMD ["node", "--import", "tsx", "src/server.ts"]
