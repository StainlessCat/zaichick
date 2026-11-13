@echo off
chcp 65001 >nul
title ZAYCHICK 2.0 — Учёт сварочных работ и НК (FastAPI + PostgreSQL + Vite)

echo =====================================================================
echo   ZAYCHICK 2.0 — Профессиональный учёт сварки и НК трубопроводов
echo   Архитектура: FastAPI + PostgreSQL + React/Vite
echo =====================================================================
echo.

cd /d "%~dp0"

REM 1. Проверка доступности PostgreSQL (порт 5432)
netstat -aon | findstr :5432 | findstr LISTENING >nul 2>nul
if %errorlevel% neq 0 (
    echo [ИНФО] Служба PostgreSQL на порту 5432 не найдена.
    echo Попытка запуска локального кластера PostgreSQL...
    if exist "C:\Program Files\PostgreSQL\12\bin\pg_ctl.exe" (
        if exist "%USERPROFILE%\zaychick_pgdata" (
            call "C:\Program Files\PostgreSQL\12\bin\pg_ctl.exe" -D "%USERPROFILE%\zaychick_pgdata" -l "%USERPROFILE%\zaychick_pgdata\postgres.log" start
            timeout /t 2 /nobreak >nul
        )
    )
    netstat -aon | findstr :5432 | findstr LISTENING >nul 2>nul
    if %errorlevel% neq 0 (
        echo [ПРЕДУПРЕЖДЕНИЕ] PostgreSQL не отвечает на 127.0.0.1:5432.
        echo Убедитесь, что служба PostgreSQL запущена, либо настройте DATABASE_URL в backend\.env.
        echo.
    ) else (
        echo [OK] PostgreSQL запущен на 127.0.0.1:5432.
    )
) else (
    echo [OK] PostgreSQL доступен на 127.0.0.1:5432.
)

REM 2. Проверка Python-окружения
set "PYTHON_CMD="
if exist "backend\.venv\Scripts\python.exe" (
    set "PYTHON_CMD=backend\.venv\Scripts\python.exe"
    set "UVICORN_CMD=backend\.venv\Scripts\uvicorn.exe"
    set "ALEMBIC_CMD=backend\.venv\Scripts\alembic.exe"
    echo [OK] Найдено виртуальное окружение backend\.venv
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        set "PYTHON_CMD=python"
        set "UVICORN_CMD=python -m uvicorn"
        set "ALEMBIC_CMD=python -m alembic"
        echo [OK] Используется системный Python
    ) else (
        echo [ОШИБКА] Python 3.10+ не найден. Установите Python и создайте backend\.venv
        pause
        exit /b 1
    )
)

REM 3. Проверка конфигурации backend\.env
if not exist "backend\.env" (
    if exist "backend\.env.example" (
        echo [ИНФО] Создание backend\.env из .env.example ...
        copy "backend\.env.example" "backend\.env" >nul
    )
)

REM 4. Применение миграций Alembic
echo [ИНФО] Проверка и применение миграций PostgreSQL...
pushd backend
call %ALEMBIC_CMD% upgrade head
popd
if %errorlevel% neq 0 (
    echo [ПРЕДУПРЕЖДЕНИЕ] Ошибка применения миграций Alembic. Проверьте настройки подключения к БД.
)

REM 5. Запуск FastAPI бэкенда на порту 8000
echo [ИНФО] Запуск FastAPI backend (http://127.0.0.1:8000) ...
start "ZAYCHICK 2.0 Backend (FastAPI)" cmd /c "cd /d "%~dp0backend" && %UVICORN_CMD% app.main:app --host 127.0.0.1 --port 8000"

REM 6. Запуск Vite фронтенда на порту 5173
where npm >nul 2>nul
if %errorlevel% equ 0 (
    echo [ИНФО] Запуск фронтенда Vite (http://127.0.0.1:5173) ...
    start "ZAYCHICK 2.0 Frontend (Vite)" cmd /c "cd /d "%~dp0" && npx vite --host 127.0.0.1 --port 5173"
) else (
    echo [ПРЕДУПРЕЖДЕНИЕ] Node/npm не обнаружен. Фронтенд можно открыть через собранную статику или сборку Docker.
)

REM 7. Открытие браузера
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5173"

echo.
echo =====================================================================
echo   ZAYCHICK 2.0 запущен!
echo   Frontend (UI):     http://127.0.0.1:5173/ (или http://localhost:5173/)
echo   Backend API:       http://127.0.0.1:8000/
echo   Swagger Документация: http://127.0.0.1:8000/docs
echo.
echo   Для остановки используйте Остановить_ZAYCHICK.bat
echo =====================================================================
echo.
pause
