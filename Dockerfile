# =========================================================================
# Multi-stage Dockerfile для промышленного развёртывания системы ZAYCHICK
# =========================================================================

# --- ЭТАП 1: Сборка фронтенда и ассетов ---
FROM node:22-alpine AS builder

WORKDIR /app

# Копируем манифесты зависимостей для эффективного кеширования слоёв
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Копируем исходный код
COPY . .

# Сборка оптимизированного production-бандла
RUN npm run build

# --- ЭТАП 2: Легковесный Production-образ ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Установка зависимостей (включая tsx для запуска TypeScript бэкенда)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm install tsx --legacy-peer-deps

# Копируем скомпилированный фронтенд из этапа сборки
COPY --from=builder /app/dist ./dist

# Копируем серверный код и вспомогательные модули
COPY server.ts ./
COPY src/server ./src/server
COPY src/utils ./src/utils
COPY src/types ./src/types
COPY src/data ./src/data
COPY public ./public

# Создаем каталог для хранения базы данных SQLite и резервных копий
RUN mkdir -p /app/data/backups

# Том для персистентного хранения базы SQLite
VOLUME ["/app/data"]

EXPOSE 3000

# Проверка здоровья контейнера
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Запуск единого сервера ZAYCHICK (Express + SQLite WAL + OCC)
CMD ["npx", "tsx", "server.ts"]
