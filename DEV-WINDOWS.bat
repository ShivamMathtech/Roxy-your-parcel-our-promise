@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules\vite\bin\vite.js (
  echo Run SETUP-WINDOWS.bat first.
  pause
  exit /b 1
)
call npm run dev
if errorlevel 1 pause
