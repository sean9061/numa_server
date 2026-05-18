# Stage 1: build React frontend
FROM node:20-slim AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: production server
FROM node:20-slim
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/
COPY --from=frontend-builder /frontend/dist/ ./frontend/dist/

EXPOSE 3000
CMD ["node", "src/server.js"]
