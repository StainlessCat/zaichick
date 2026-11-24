# Анализ проекта ZAYCHICK

Дата: 22 ноября 2026 года (актуализировано: 24 ноября 2026 года)

## Общая оценка

Проект находится на стадии завершённого перехода с legacy-архитектуры на ZAYCHICK 2.0:

- Frontend: React 19, TypeScript, Vite.
- Backend: FastAPI, SQLAlchemy 2.0, PostgreSQL.
- Миграции: Alembic.
- Аутентификация: JWT в HttpOnly cookie и ролевое разграничение доступа.
- Дополнительно: SSE, PostgreSQL `LISTEN/NOTIFY`, аудит, резервное копирование, отчёты и экспорт журналов.

Текущая ветка представляет собой рабочую миграцию: предметная модель сохранена, все замечания аудитов закрыты, нумерация стыков приведена к корпоративному стандарту.

## Результаты проверок

### Frontend

- TypeScript typecheck: успешно (`npm run lint`).
- Unit-тесты: 139 тестов прошли в 15 тестовых файлах (`npx vitest run`).
- Production build: успешно (`npm run build`).
- Production-бандл собран без ошибок; крупные функциональные модули вынесены в отдельные chunks.

### Backend

- Полный набор backend-тестов: 94 теста прошли (`pytest`).
- Alembic имеет актуальную миграционную вершину:
  `0010_add_lrv_marking_pn_full_name_and_categories`.
- Backend Ruff lint: устранены все замечания, `ruff check backend` проходит с 0 ошибок.

### Docker

- Dockerfile и docker-compose валидны.
- Подготовлен `Dockerfile.amvera` и `amvera.yml` для прямого развёртывания в PaaS/K8s.

## Устранённые замечания аудита

1. **Ruff Lint**: Все замечания устранены, `ruff check backend` проходит с 0 ошибок.
2. **Pytest Warnings**: Устранены PytestCollectionWarning для `TestCircuit` и `TestCircuitUpdate` через `__test__ = False`. Добавлен фильтр для `Connection._cancel` во время teardown.
3. **Безопасность и DSN**: Добавлена нормализация облачных строк подключения и сборка из отдельных переменных окружения (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`).
4. **Корпоративная нумерация стыков (Правило 3)**:
   - В миграции `0009_fix_legacy_joint_numbers` и функции `fix_legacy_baseline_joint_numbers` устранён дефект сопоставления линий: условия переведены на универсальный поиск `LIKE '%01-ГП%'` / `LIKE '%02-ШФЛУ%'` / `LIKE '%03-МТ%'`.
   - В [mappers.ts](file:///C:/Users/ilche/Documents/ZAYCHICK/src/api/mappers.ts), [dataIntegrityGuard.ts](file:///C:/Users/ilche/Documents/ZAYCHICK/src/utils/dataIntegrityGuard.ts) и [RegistryTable.tsx](file:///C:/Users/ilche/Documents/ZAYCHICK/src/components/registry/RegistryTable.tsx) обеспечено сквозное отображение и нормализация корпоративных номеров (`010, 020...` и доборных `011, 012...`).
   - Исключено появление предупреждающих бейджей для валидных стыков технологических линий.
5. **Сохранение состояния при обновлении страницы (F5 State Persistence)**:
   - Инициализация `activeSection`, `selectedObjectName` и `selectedRdCode` в [useAppState.ts](file:///C:/Users/ilche/Documents/ZAYCHICK/src/hooks/useAppState.ts) переведена на ленивые функции чтения из `URLSearchParams` (`?tab=...&project=...&rd=...`) и `localStorage`.
   - Добавлен двусторонний эффект синхронизации состояния с `history.replaceState` и обработчик события `popstate`.
   - При перезагрузке страницы выбранный объект (например, УКПГ-1С) и текущая вкладка сохраняются без сброса.

## Проверка белого экрана хостинга

Дата повторной проверки: 24 ноября 2026 года.

### Подтверждённая причина

Белая страница была вызвана ошибкой выполнения JavaScript:

```text
ReferenceError: globalSearch is not defined
```

Недопустимое состояние обнаружено в [JointsRegistryView.tsx](file:///C:/Users/ilche/Documents/ZAYCHICK/src/components/JointsRegistryView.tsx): компонент использовал `globalSearch` в расчёте активных фильтров, но состояние не принималось через props и не передавалось из `useRegistryFilters`.

В процессе устранения выявлена и устранена отдельная серия незавершённых привязок модальных компонентов:

- неопределённые переменные состояния в `BulkEditModal`;
- отсутствующие вызовы `useModalDismiss` в нескольких модальных окнах;
- состояние хука использовалось до его корректной инициализации;
- устаревшее обращение к отсутствующему полю `medium` контуров испытаний.

### Исправленные файлы

- `src/components/JointsRegistryView.tsx`
- `src/components/layout/AppMainContent.tsx`
- `src/App.tsx`
- `src/components/BulkEditModal.tsx`
- `src/components/FacilityLocationModal.tsx`
- `src/components/laboratory/LabRequestModal.tsx`
- `src/components/lrv/LrvSupersedeModal.tsx`
- `src/components/registry/RegistryLabRequestModal.tsx`
- `src/components/testCircuits/CircuitAssignModal.tsx`
- `src/components/linelist/LineListEditModal.tsx`
- `src/components/materials/MaterialPartialReplaceModal.tsx`
- `src/hooks/useAppState.ts`
- `src/components/registry/RegistryTable.tsx`
- `src/api/mappers.ts`
- `src/utils/dataIntegrityGuard.ts`
- `backend/alembic/versions/0009_fix_legacy_joint_numbers.py`
- `backend/app/services/baseline_seed.py`

### Финальная проверка

- `npm run lint`: успешно.
- `npm run build`: успешно.
- `npm test -- --reporter=dot`: 139 тестов успешно.
- Backend pytest: 94 теста успешно.
- Корень приложения отдаётся через FastAPI со статусом `200`.
- Playwright подтвердил рендер интерфейса и наличие одного корневого React-узла.
- Runtime-ошибки `globalSearch is not defined` и последующие ошибки модальных компонентов устранены.
- Для неавторизованной страницы остаётся ожидаемый ответ API `/api/auth/session`: `401`, после входа интерфейс загружает серверное состояние.

Для деплоя необходимо публиковать именно содержимое каталога `dist` и перезапускать контейнер после сборки. Старые `prebuilt` или `dist`-assets нельзя оставлять в кэше хостинга или CDN.
