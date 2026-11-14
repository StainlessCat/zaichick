@echo off
chcp 65001 >nul
title ZAYCHICK (Legacy v1.0 — Express + SQLite)

echo =====================================================================
echo   [LEGACY / АРХИВНЫЙ РЕЖИМ] ZAYCHICK v1.0
echo   Express.js + SQLite WAL (порт 3000)
echo   Актуальная версия 2.0: Запустить_ZAYCHICK.bat (FastAPI + PostgreSQL)
echo =====================================================================
echo.

cd /d "%~dp0"
set NODE_ENV=production
call npx tsx server.ts
pause
