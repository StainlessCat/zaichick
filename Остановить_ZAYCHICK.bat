@echo off
chcp 65001 >nul
title Остановка ZAYCHICK 2.0

echo =====================================================================
echo   Остановка сервисов ZAYCHICK 2.0 (FastAPI :8000, Vite :5173, :3000)
echo =====================================================================
echo.

REM 1. Остановка порта 8000 (FastAPI backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING 2^>nul') do (
    echo Завершение процесса Backend PID %%a ...
    taskkill /F /PID %%a >nul 2>nul
)

REM 2. Остановка порта 5173 (Vite frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING 2^>nul') do (
    echo Завершение процесса Frontend PID %%a ...
    taskkill /F /PID %%a >nul 2>nul
)

REM 3. Остановка порта 3000 (Legacy Express, если был запущен)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    echo Завершение legacy-процесса PID %%a ...
    taskkill /F /PID %%a >nul 2>nul
)

echo [OK] Все сервисы ZAYCHICK остановлены.
timeout /t 2 >nul
exit /b 0
