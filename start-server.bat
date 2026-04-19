@echo off
title Azterra Backend Server
cd /d "%~dp0"
echo.
echo  ===================================
echo   AZTERRA BACKEND SERVER
echo  ===================================
echo.
echo  Starting on http://localhost:3000
echo  Press Ctrl+C to stop.
echo.
node server/server.js
pause
