@echo off
setlocal
cd /d "%~dp0"
title Roxy Developer Setup
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24.x from https://nodejs.org/ first.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])!==24){console.error('Node.js 24.x is required.');process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)
echo Installing the exact frontend dependencies from package-lock.json...
call npm ci --no-fund --no-audit
if errorlevel 1 (
  echo Installation failed. Check your internet connection. See README.md.
  pause
  exit /b 1
)
call npm run build
if errorlevel 1 (
  pause
  exit /b 1
)
echo Setup complete. Run START-WINDOWS.bat to open Roxy.
pause
