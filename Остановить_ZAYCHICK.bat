@echo off
chcp 65001 >nul
title Остановка ZAYCHICK

echo =====================================================================
echo   Остановка локального сервера ZAYCHICK (порт 3000)
echo =====================================================================
echo.

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo Завершение процесса PID %%a ...
    taskkill /F /PID %%a >nul 2>nul
)

echo [OK] Сервер остановлен.
timeout /t 2 >nul
exit /b 0
