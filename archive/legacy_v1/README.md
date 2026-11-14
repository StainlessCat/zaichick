# ZAYCHICK v1.0 Legacy Archive

В этой директории сохранены исторические файлы архитектуры v1.0 прототипа системы ZAYCHICK:

- `server.ts` — исходный сервер Express.js + SQLite WAL;
- `server-local.cjs` — легковесный автономный HTTP-сервер раздачи статики;
- `start-demo-windows.bat` — скрипт запуска демонстрационного standalone-режима;
- `Запуск_ZAYCHICK_Legacy.bat` — запуск legacy-сервера на порту 3000.

---

### Архитектура ZAYCHICK 2.0

Начиная с версии 2.0, промышленная эксплуатация полностью переведена на:
- **Backend:** FastAPI + Python 3.11+, SQLAlchemy 2.0 (async), Alembic миграции;
- **Database:** PostgreSQL 15/16;
- **Frontend:** React 19, TypeScript, Vite.

Все исторические данные SQLite импортируются через идемпотентный скрипт миграции:
```bash
python -m app.cli.migrate_sqlite --sqlite-path data/zaychick.sqlite
```
