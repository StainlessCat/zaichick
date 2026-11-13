# ZAYCHICK 2.0 — Учёт сварочных работ и неразрушающего контроля

Цифровая B2B-система оперативного учёта сварочно-монтажных работ, входного контроля труб и деталей (ЛРВ), привязки лайнлиста проекта, неразрушающего контроля (ВИК, РК, УЗК, ПВК, МПК, дубль-контроль) и автоматического формирования исполнительной документации в строгом соответствии с требованиями **СТО Газпром 15-1.1-002-2023**, **ВСН 012-88** и **ГОСТ 16037-80**.

---

## 🏗️ Целевая архитектура ZAYCHICK 2.0

- **Backend:** Python 3.10+ / 3.12, **FastAPI**, Pydantic v2, асинхронный ORM **SQLAlchemy 2.0**, драйвер **asyncpg**, миграции **Alembic**.
- **База данных:** **PostgreSQL 12+** (16+ для production) со строгой реляционной схемой, внешними ключами, `UniqueConstraint`, индексами и серверными триггерами неизменяемости журнала аудита. Полный отказ от файловых SQLite/JSON fallback.
- **Frontend:** **React 19**, **TypeScript**, **Vite**, Tailwind CSS, Lucide Icons. Проксирование `/api` на FastAPI, строгая серверная аутентификация через HttpOnly-куки (`zaychick_access_token`).
- **События реального времени (SSE):** Отложенная рассылка точечных дельт (`event_bus.emit_delta`) строго **после успешного `commit`** транзакции в PostgreSQL.
- **Экспорт исполнительной документации:** Серверная генерация отчётов и журналов Excel через Python (`openpyxl`).

---

## 📋 Таблица поддерживаемых сценариев запуска

| Сценарий | Процессы и порты | База данных | Переменные окружения | Команда запуска | Команда остановки |
|---|---|---|---|---|---|
| **Локальная разработка (Dev)** | • FastAPI: `127.0.0.1:8000`<br>• Vite Dev: `127.0.0.1:5173` | PostgreSQL 12+ (`127.0.0.1:5432`, БД `zaychick`) | `backend/.env` | 1. `cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000`<br>2. `npx vite --host 127.0.0.1 --port 5173` | `Ctrl + C` или `Остановить_ZAYCHICK.bat` |
| **Автономный Windows-стенд** | • PostgreSQL: `5432`<br>• FastAPI: `8000`<br>• Vite: `5173` | Локальный кластер PostgreSQL | `backend/.env` (автосоздание из `.env.example`) | Запуск файла **`Запустить_ZAYCHICK.bat`** двойным кликом | Запуск файла **`Остановить_ZAYCHICK.bat`** |
| **Корпоративный Docker (Production)** | • `db`: PostgreSQL 16 (`5432`)<br>• `backend`: FastAPI (`8000`)<br>• `frontend`: Nginx (`80`, `3000`) | Постоянный Docker Volume `postgres_data` | `.env` в корне проекта или Docker secrets | `docker compose up -d --build` | `docker compose down` |
| **Legacy / Архив (v1.0)** | Express: `127.0.0.1:3000` | SQLite `data/zaychick.sqlite` (только для исторической сверки) | `NODE_ENV=production` | `Запустить_ZAYCHICK_Legacy.bat` или `npm run start:legacy` | `Ctrl + C` |

---

## 🚀 1. Локальная разработка (Local Development)

### Требования к окружению
- **Python:** 3.10+ (рекомендуется 3.12)
- **Node.js:** 20+ или 22 LTS
- **PostgreSQL:** 12+ (запущен локально на порту 5432)

### Пошаговый запуск
1. **Подготовка базы данных PostgreSQL:**
   ```sql
   CREATE USER zaychick WITH PASSWORD 'zaychick_dev_password';
   CREATE DATABASE zaychick OWNER zaychick;
   ```

2. **Настройка бэкенда (FastAPI):**
   ```bash
   cd backend
   python -m venv .venv
   # Windows:
   .\.venv\Scripts\activate
   # Linux/macOS:
   source .venv/bin/activate

   pip install -e .
   cp .env.example .env

   # Применение миграций схемы Alembic:
   alembic upgrade head

   # Запуск сервера API:
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

3. **Запуск фронтенда (React/Vite):**
   ```bash
   # В корневом каталоге проекта:
   npm install
   npm run dev
   ```
   Интерфейс откроется по адресу: **`http://localhost:5173`** (проксирует запросы `/api` на `http://127.0.0.1:8000`).

---

## 🖥️ 2. Запуск на Windows в один клик

Для работы на ПК или ноутбуке без Docker:
1. Запустите файл **`Запустить_ZAYCHICK.bat`**.
2. Скрипт автоматически:
   - Проверит подключение к PostgreSQL на порту 5432;
   - Настроит окружение Python `backend\.venv` и файл конфигурации;
   - Применит свежие миграции схемы БД через Alembic;
   - Запустит FastAPI (`:8000`) и Vite (`:5173`);
   - Автоматически откроет браузер на `http://127.0.0.1:5173/`.
3. Для остановки сервисов запустите **`Остановить_ZAYCHICK.bat`**.

---

## 🐳 3. Развёртывание через Docker Compose (Production)

Для промышленного развёртывания на сервере (Linux / Windows Server):

1. **Создайте файл конфигурации `.env`:**
   ```ini
   POSTGRES_USER=zaychick
   POSTGRES_PASSWORD=generate_strong_secret_db_password
   POSTGRES_DB=zaychick
   JWT_SECRET_KEY=generate_random_secret_at_least_32_characters_long
   INITIAL_ADMIN_PASSWORD=secure_admin_initial_password
   COOKIE_SECURE=true
   ```

2. **Запустите контейнеры:**
   ```bash
   docker compose up -d --build
   ```

3. **Проверьте статус готовности сервисов:**
   ```bash
   docker compose ps
   ```
   Веб-интерфейс и API доступны по адресам:
   - **Frontend (Nginx):** `http://<server-ip>:80/` (или `http://<server-ip>:3000/`)
   - **Backend API Docs (Swagger):** `http://<server-ip>:80/docs`
   - **Healthcheck:** `http://<server-ip>:80/api/health`

---

## ⚙️ Переменные окружения Backend (`backend/.env`)

| Переменная | По умолчанию | Описание |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://zaychick:zaychick_dev_password@127.0.0.1:5432/zaychick` | Строка подключения к PostgreSQL (драйвер `asyncpg`) |
| `JWT_SECRET_KEY` | *(обязательно задать в prod)* | Секретный ключ подписи JWT (минимум 32 байта) |
| `JWT_ALGORITHM` | `HS256` | Алгоритм подписи JWT |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` (24 часа) | Срок действия токена доступа |
| `COOKIE_NAME` | `zaychick_access_token` | Имя HttpOnly-cookie для хранения токена |
| `COOKIE_SECURE` | `false` (для dev) | Флаг `Secure` куки (в production с HTTPS строго `true`) |
| `COOKIE_SAMESITE` | `lax` | Политика `SameSite` для защиты от CSRF |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Разрешённые веб-источники (через запятую) |
| `INITIAL_ADMIN_PASSWORD` | *(пусто)* | Опциональный пароль для автосоздания первого администратора при пустой БД |

---

## 👥 Ролевая модель доступа (RBAC)

| Роль | Системный код | Доступные операции |
|---|---|---|
| **Администратор** | `ADMIN` | Полный доступ: управление пользователями, всеми справочниками, стыками, аудит |
| **Инженер ПТО** | `PTO` | Формирование лайнлиста, заведение/редактирование стыков, привязка чертежей, экспорт журналов |
| **Технолог ОГС** | `OGS` | Технологические карты сварки (ТК), допуск материалов, согласование разнотолщинности |
| **Специалист ЛНК / ПИЛ** | `PIL` | Внесение результатов ВИК, РК, УЗК, ПВК, МПК, дубль-контроля, ремонтных заключений |
| **Наблюдатель** | `VIEWER` | Просмотр реестров и документов без права внесения изменений |

---

## 💾 Резервное копирование и восстановление PostgreSQL

### Резервное копирование (`pg_dump`):
```bash
# Локально:
pg_dump -h 127.0.0.1 -U zaychick -d zaychick -F c -b -v -f "zaychick_backup_$(date +%Y%m%d_%H%M%S).dump"

# В Docker:
docker compose exec -T db pg_dump -U zaychick -d zaychick -F c -b > zaychick_backup.dump
```

### Восстановление (`pg_restore`):
```bash
# Локально:
pg_restore -h 127.0.0.1 -U zaychick -d zaychick --clean --if-exists -v "zaychick_backup.dump"

# В Docker:
docker compose exec -T db pg_restore -U zaychick -d zaychick --clean --if-exists < zaychick_backup.dump
```

---

## 🧪 Тестирование и верификация

```bash
# 1. Запуск интеграционных тестов транзакций и ограничений на PostgreSQL:
cd backend
.\.venv\Scripts\python -m pytest app/tests/test_transactions_and_integrity_postgres.py -v

# 2. Полный прогон тестов бэкенда:
.\.venv\Scripts\python -m pytest app/tests -v

# 3. Проверка типов фронтенда:
npm run lint
```
