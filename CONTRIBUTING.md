# Руководство разработчика (CONTRIBUTING) — ZAYCHICK 2.0

Добро пожаловать в разработку **ZAYCHICK 2.0** — промышленной системы оперативного учёта сварочно-монтажных работ, входного контроля материалов (ЛРВ) и неразрушающего контроля (НК) по требованиям **СТО Газпром 15-1.1-002-2023**, **ГОСТ 16037-80** и **ВСН 012-88**.

---

## 🏗️ 1. Архитектура проекта

Кодовая база разделена на два изолированных уровня:

```
ZAYCHICK/
├── backend/                  # Асинхронный сервер FastAPI + PostgreSQL
│   ├── alembic/              # Миграции схемы реляционной БД
│   │   └── versions/         # Версии миграций (0001_initial_schema, 0002_add_ndt_lab_requests)
│   ├── app/                  # Исходный код бэкенда
│   │   ├── api/routes/       # REST эндпоинты (/joints, /lines, /lab-requests, /auth, /events)
│   │   ├── cli/              # Утилиты командной строки (bootstrap, migrate_sqlite, backup)
│   │   ├── core/             # Конфигурация, безопасность (scrypt/JWT), пул asyncpg
│   │   ├── models/           # SQLAlchemy 2.0 модели (WeldJoint, ProjectLine, NdtLabRequest)
│   │   ├── services/         # Бизнес-логика, экспорт Excel (openpyxl), квоты НК
│   │   └── tests/            # Набор тестов Pytest (43 теста, asyncpg/FastAPI)
│   ├── pyproject.toml        # Зависимости бэкенда и настройки Ruff/Pytest
│   └── alembic.ini           # Конфигурация запуска Alembic
├── src/                      # Frontend SPA (React 19 + TypeScript + Tailwind + Vite)
│   ├── api/                  # HTTP-клиент к FastAPI и SSE подписчик
│   ├── components/           # UI-компоненты разделов (реестр, ЛНК, лайнлист, техкарты, журналы)
│   │   ├── registry/         # Модульный реестр стыков (Toolbar, Table, Footer, Modal)
│   │   ├── linelist/         # Модуль лайнлиста проекта
│   │   └── layout/           # Каркас приложения (AppHeader, AppMainContent, AppModalsContainer)
│   ├── context/              # React Context (AuthContext, AppContext)
│   ├── hooks/                # Кастомные хуки (useAppState, useServerSync, useJointActions)
│   ├── types/                # Строгая типизация доменных сущностей
│   └── utils/                # Нормативная валидация, расчет эквивалентных дюймов, квоты НК
├── archive/legacy_v1/        # Архив исторического прототипа v1.0 (Express/SQLite)
├── .github/workflows/        # CI/CD Pipeline (GitHub Actions)
├── docker-compose.yml        # Production Docker развёртывание
├── docker-compose.dev.yml      # Hot-reload окружение для локальной разработки
└── Dockerfile                # Multi-stage сборка для production
```

---

## 🚀 2. Быстрый старт и Dev-окружение

### Вариант А: Локальная разработка (Рекомендуемый)

#### Требования:
- **Python**: 3.10+ (рекомендуется 3.11 или 3.12)
- **Node.js**: 20 LTS или 22 LTS
- **PostgreSQL**: 15+ (запущен локально на порту 5432)

#### 1. Подготовка базы данных:
```sql
CREATE USER zaychick WITH PASSWORD 'zaychick_dev_password';
CREATE DATABASE zaychick OWNER zaychick;
```

#### 2. Запуск Backend (FastAPI):
```bash
cd backend
python -m venv .venv

# Активация venv:
# Windows (PowerShell):
.\.venv\Scripts\Activate.ps1
# Linux / macOS:
source .venv/bin/activate

# Установка зависимостей (включая dev-пакеты: pytest, ruff):
pip install -e ".[dev]"

# Создание файла переменных окружения:
cp .env.example .env

# Применение миграций схемы БД:
alembic upgrade head

# Инициализация первого администратора (admin / admin123):
python -m app.cli.bootstrap_admin

# Запуск сервера API с горячей перезагрузкой:
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
Интерактивная документация Swagger UI доступна по адресу: `http://127.0.0.1:8000/docs`.

#### 3. Запуск Frontend (Vite):
В отдельном окне терминала из корня проекта:
```bash
npm install
npm run dev
```
Интерфейс откроется по адресу `http://127.0.0.1:5173/`. Запросы к `/api` автоматически проксируются на бэкенд (`http://127.0.0.1:8000`).

---

### Вариант Б: Запуск в Docker Compose с Hot-Reload

Для быстрого запуска всей инфраструктуры с горячей перезагрузкой кода:

```bash
# 1. Запуск всех сервисов (PostgreSQL + FastAPI + Nginx) с docker-compose.dev.yml:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# 2. Просмотр логов бэкенда в реальном времени:
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f backend

# 3. Остановка сервисов:
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

В dev-режиме:
- Исходный код `./backend/app` монтируется внутрь контейнера (любое изменение в Python-файлах мгновенно перезапускает `uvicorn`);
- Флаг `COOKIE_SECURE=false` позволяет авторизоваться по HTTP на `localhost`;
- Порт PostgreSQL `5432` доступен на хосте для подключения через DBeaver / DataGrip;
- Порт FastAPI `8000` доступен на хосте для прямого обращения к API и Swagger UI.

---

## 🗄️ 3. База данных и миграции Alembic

Все изменения структуры таблиц производятся **исключительно через миграции Alembic**. Прямое редактирование схемы БД через SQL в production запрещено.

### Добавление новой таблицы или столбца

1. **Опишите модель в `backend/app/models/`**:
   Используйте базовый класс `Base` из `app.models.base`. Для поддержки оптимистической блокировки (OCC) обязательно добавляйте столбец `version_id`:
   ```python
   # Пример добавления модели
   import uuid
   from sqlalchemy import Column, String, Integer, DateTime, text
   from sqlalchemy.dialects.postgresql import UUID
   from app.models.base import Base

   class CustomEntity(Base):
       __tablename__ = "custom_entities"

       id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
       name = Column(String(255), nullable=False)
       version_id = Column(Integer, nullable=False, server_default="1")
       created_at = Column(DateTime(timezone=True), server_default=text("now()"))
   ```

2. **Зарегистрируйте модель в `backend/app/models/__init__.py`**:
   Это необходимо, чтобы Alembic увидел метаданные новой модели при автогенерации.

3. **Сгенерируйте миграцию**:
   ```bash
   cd backend
   alembic revision --autogenerate -m "add custom entities table"
   ```

4. **Проверьте созданный файл в `backend/alembic/versions/`**:
   - Убедитесь, что функции `upgrade()` и `downgrade()` симметричны и корректны;
   - Проверьте наличие внешних ключей (`sa.ForeignKey`) и индексов;
   - Добавьте `from __future__ import annotations` в начало файла.

5. **Примените миграцию к базе данных**:
   ```bash
   alembic upgrade head
   ```

6. **Откат миграции (если требуется отменить последнее действие)**:
   ```bash
   alembic downgrade -1
   ```

7. **Проверка текущего статуса схемы**:
   ```bash
   alembic current
   alembic history --verbose
   ```

---

## 🧪 4. Тестирование и качество кода

Перед созданием коммита или Pull Request **обязательно** выполните локальную проверку:

### Backend (Python)

```bash
cd backend

# 1. Запуск линтера Ruff (0 предупреждений):
ruff check .

# 2. Автоматическое исправление мелких замечаний:
ruff check --fix .

# 3. Запуск полного набора тестов Pytest (43 теста):
pytest app/tests -v --tb=short
```

> **Примечание**: Тесты бэкенда требуют запущенного PostgreSQL. Если используется локальный Docker, убедитесь, что контейнер `db` поднят.

### Frontend (TypeScript / React)

```bash
# 1. Строгая проверка типов TypeScript:
npm run lint

# 2. Запуск тестового пакета бизнес-логики (52 теста):
npm test

# 3. Проверка продакшн-сборки Vite:
npm run build
```

---

## 🔄 5. Правила работы с Git и коммитами

В проекте используется стандарт **Conventional Commits**:

- `feat(scope): ...` — добавление новой функциональности (например, `feat(ndt): add lab conclusion PDF export`);
- `fix(scope): ...` — исправление дефекта (например, `fix(joints): prevent duplicate joint number on same line`);
- `refactor(scope): ...` — переработка кода без изменения внешней логики (`refactor(layout): connect AppMainContent to context`);
- `test(scope): ...` — добавление или изменение тестов (`test(quotas): add multi-welder quota calculation tests`);
- `chore: ...` — рутинные задачи, обновление зависимостей, очистка (`chore: update dependencies`);
- `ci: ...` — изменения конфигурации GitHub Actions / Docker (`ci: add postgres service container to backend job`);
- `docs: ...` — обновление документации и руководств (`docs: add contributing guide`).

### Правила ветвления
- Основная ветка разработки: `main`.
- Изменения вносятся через feature-ветки (`feature/название-фичи` или `fix/название-исправления`) с последующим слиянием через Pull Request.

---

## 🛡️ 6. CI/CD автоматизация (GitHub Actions)

В проекте настроен автоматический пайплайн [`.github/workflows/ci.yml`](file:///C:/Users/ilche/antigravity/ZAYCHICK-—-Учёт-сварочных-работ-и-НК/.github/workflows/ci.yml), который запускается при каждом push и PR в ветку `main`:

1. **`backend`**:
   - Сервис-контейнер PostgreSQL 15;
   - Проверка линтером Ruff (`ruff check .`);
   - Применение миграций Alembic (`alembic upgrade head`);
   - Прогон всех 43 тестов Pytest.
2. **`frontend`**:
   - `npm run lint` (`tsc --noEmit`);
   - `npm test` (52 теста);
   - `npm run build` (компиляция бандла через Vite).

Если хотя бы одна из проверок завершается с ошибкой, Pull Request блокируется.
