@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Для запуска нужен Node.js 18 или новее.
  pause
  exit /b 1
)
start "ATOLYE Server" /min cmd /c "node server.mjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4173"
