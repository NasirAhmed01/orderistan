# Backend image for Cloudflare Containers (same Express app, unchanged).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
