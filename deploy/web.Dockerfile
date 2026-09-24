# Фронтенд собирается здесь же и отдаётся Caddy вместе с проксированием API.
# Сборка идёт с относительным /api — фронт и бэкенд живут на одном домене.
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ENV VITE_API_URL=/api
RUN npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv/app
