@echo off
cd /d "%~dp0"
title ZAYCHICK - Local Server (Port 3000)

where node >nul 2>nul
if errorlevel 1 goto :nonode

node "%~dp0server-local.cjs"
if errorlevel 1 pause
goto :eof

:nonode
echo ============================================================================
echo [ERROR] Node.js is not installed on this computer.
echo Please download and install Node.js LTS from: https://nodejs.org/
echo ============================================================================
pause
exit /b 1
