@echo off
chcp 65001 >nul
title ZAYCHICK — Учёт сварочных работ и НК

echo =====================================================================
echo   ZAYCHICK — Профессиональный учёт сварки и НК трубопроводов
echo   Локальный автономный запуск (SQLite WAL + OCC)
echo =====================================================================
echo.

cd /d "%~dp0"

REM 1. Поиск исполняемого файла Node.js (системный или встроенный portable)
set "NODE_CMD=node"
if exist "tools\node\node.exe" (
    set "NODE_CMD=tools\node\node.exe"
    echo [OK] Используется портативный Node.js из tools\node\
) else (
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo [ОШИБКА] Node.js не обнаружен в системе.
        echo Пожалуйста, установите Node.js (версии 20 или 22+) с официального сайта: https://nodejs.org
        echo Либо скопируйте файл node.exe в папку: "%~dp0tools\node\node.exe"
        echo.
        pause
        exit /b 1
    )
)

REM 2. Проверка собранного интерфейса dist
if not exist "dist\index.html" (
    echo [ИНФО] Папка скомпилированного интерфейса dist\ не найдена.
    echo Запуск сборки фронтенда (npm run build)...
    call npm run build
    if not exist "dist\index.html" (
        echo [ОШИБКА] Сборка интерфейса не удалась.
        pause
        exit /b 1
    )
)

echo [OK] Интерфейс готов к работе.
echo.
echo [ИНФО] Запуск веб-сервера ZAYCHICK на http://localhost:3000 ...
echo Браузер откроется автоматически через несколько секунд.
echo Для остановки программы просто закройте это окно (или нажмите Ctrl+C).
echo =====================================================================
echo.

REM Автоматическое открытие браузера по умолчанию через 2 секунды
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

REM Запуск production-сервера с единой СУБД SQLite
set NODE_ENV=production
call npx tsx server.ts

pause
