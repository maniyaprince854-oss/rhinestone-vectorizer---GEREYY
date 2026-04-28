@echo off
echo ===============================================
echo  Rhinestone Vectorizer - Quick Start
echo ===============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    echo Please install from: https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo Installing dependencies (first time only)...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
)

echo.
echo Starting dev server at http://localhost:5173
echo Press Ctrl+C in this window to stop.
echo.
call npm run dev
pause
