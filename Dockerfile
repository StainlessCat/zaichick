# =========================================================================
# Multi-stage Dockerfile для промышленного развёртывания ZAYCHICK 2.0
# Стек: FastAPI + PostgreSQL + React/Vite
# =========================================================================

# --- ЭТАП 1: Сборка фронтенда (React + Vite) ---
FROM node:22-alpine AS frontend-builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# --- ЭТАП 2: Production Backend (FastAPI + Python 3.12) ---
FROM python:3.12-slim AS backend

WORKDIR /app/backend

# Установка системных зависимостей для сборки и healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Установка Python-зависимостей
COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
    "fastapi>=0.115.0" \
    "uvicorn[standard]>=0.32.0" \
    "sqlalchemy[asyncio]>=2.0.36" \
    "asyncpg>=0.30.0" \
    "alembic>=1.14.0" \
    "pydantic>=2.10.0" \
    "pydantic-settings>=2.6.0" \
    "pyjwt>=2.10.0" \
    "pwdlib[argon2]>=0.2.1" \
    "openpyxl>=3.1.5" \
    "python-multipart>=0.0.17" \
    greenlet

# Копируем исходный код бэкенда и миграции Alembic
COPY backend/ ./

# Копируем собранный фронтенд (на случай прямой раздачи статики)
COPY --from=frontend-builder /app/dist /app/dist

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/backend

EXPOSE 8000

# Healthcheck API и БД
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:8000/api/health || exit 1

# Запуск миграций и сервера FastAPI
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
