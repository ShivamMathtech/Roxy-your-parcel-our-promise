@echo off
setlocal
cd /d "%~dp0"
title Roxy Parcel Delivery
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 24.x from https://nodejs.org/
  echo Then close this window and run START-WINDOWS.bat again.
  pause
  exit /b 1
)
echo Starting Roxy. Keep this window open while using the app.
echo Press Ctrl+C to stop the server.
node scripts\launch.mjs
if errorlevel 1 pause
