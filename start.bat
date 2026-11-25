@echo off
setlocal enabledelayedexpansion
set ROOT=%~dp0

:: Quoted, space-safe working directories.
:: %~dp0 ends in a backslash, and "C:\path\" lets the trailing backslash escape
:: the closing quote - appending "." gives a valid directory that quotes cleanly.
:: Needed because the repo path may contain spaces (e.g. "...\SEM 6\...").
set "ROOTDIR=%~dp0."
set "MOBILEDIR=%~dp0LLM-Mobile"
set "BACKENDDIR=%~dp0backend-node"

echo ============================================
echo  Maintenance Copilot - Pre-flight Checks
echo ============================================

:: Reads QDRANT_URL from .env to decide whether this run needs local
:: Docker at all. Qdrant Cloud deployments don't - only a bare
:: localhost/127.0.0.1 URL (or no .env yet) does.
:: Pulls only the single QDRANT_URL line via findstr into a temp file
:: first, rather than looping every line of .env in a batch block -
:: .env holds raw API keys that can contain characters the batch
:: parser chokes on when processed inside a block.
set "QDRANT_URL="
if exist "%ROOT%.env" (
    findstr /b /i "QDRANT_URL=" "%ROOT%.env" > "%TEMP%\mc_qdrant_url.tmp" 2>nul
    for /f "usebackq tokens=1,* delims==" %%A in ("%TEMP%\mc_qdrant_url.tmp") do set "QDRANT_URL=%%B"
    del "%TEMP%\mc_qdrant_url.tmp" 2>nul
)

set "NEEDS_DOCKER=1"
if defined QDRANT_URL (
    echo !QDRANT_URL! | findstr /i "localhost 127.0.0.1" >nul
    if errorlevel 1 set "NEEDS_DOCKER=0"
)

if "!NEEDS_DOCKER!"=="0" (
    echo  [OK] QDRANT_URL points to Qdrant Cloud - skipping Docker check.
) else (
    docker info > nul 2>&1
    if errorlevel 1 (
        echo.
        echo  [WARNING] Docker Desktop does not appear to be running.
        echo  Qdrant vector database may be unavailable.
        echo  Start Docker Desktop and re-run this script.
        echo.
        pause
        exit /b 1
    )
    echo  [OK] Docker is running.
)

netstat -ano | findstr ":8000 " > nul 2>&1
if not errorlevel 1 (
    echo  [WARNING] Port 8000 is already in use. Node backend may not start.
) else (
    echo  [OK] Port 8000 is free.
)

netstat -ano | findstr ":8001 " > nul 2>&1
if not errorlevel 1 (
    echo  [WARNING] Port 8001 is already in use. FastAPI may not start.
) else (
    echo  [OK] Port 8001 is free.
)

if "!NEEDS_DOCKER!"=="1" (
    netstat -ano | findstr ":6333 " > nul 2>&1
    if not errorlevel 1 (
        echo  [OK] Port 6333 is in use - Qdrant appears to be running.
    ) else (
        echo  [WARNING] Port 6333 is not active. Qdrant may not be running.
        echo  Run: docker start qdrant
    )
)

echo.
echo ============================================
echo  Starting Maintenance Copilot Services...
echo ============================================

:: FastAPI (port 8001): Python retrieval service - embeds and searches
:: Node Backend (port 8000, backend-node/server.js): Express API routes
:: Expo (LAN mode): mobile app, served over local network
:: Qdrant (port 6333, local Docker only): skipped when QDRANT_URL is cloud

if exist "%ROOT%venv\Scripts\python.exe" (
    set "PYEXE=%ROOT%venv\Scripts\python.exe"
) else (
    echo  [WARNING] .venv not found - falling back to system Python.
    echo  Create it with:  python -m venv .venv
    set "PYEXE=python"
)
start "FastAPI" /D "%ROOTDIR%" cmd /k ""%PYEXE%" -m uvicorn server.rag.retrieval.retrieval_service:app --reload --port 8001 --host 0.0.0.0"
timeout /t 8 /nobreak > nul

start "Backend" /D "%BACKENDDIR%" cmd /k "node server.js"
timeout /t 3 /nobreak > nul

start "Expo" /D "%MOBILEDIR%" cmd /k "npx expo start --lan --clear"

echo.
echo ============================================
echo  All services started!
echo ============================================
if "!NEEDS_DOCKER!"=="1" (
    echo  Qdrant     : http://localhost:6333
) else (
    echo  Qdrant     : Qdrant Cloud ^(see QDRANT_URL in .env^)
)
echo  FastAPI    : http://localhost:8001
echo  Backend    : http://localhost:8000
echo  Expo Web   : Press W in the Expo terminal
echo ============================================
echo.
echo IMPORTANT:
if "!NEEDS_DOCKER!"=="1" (
    echo 1. Docker Desktop must be running ^(Qdrant needs it^).
) else (
    echo 1. Using Qdrant Cloud - Docker is not required.
)
echo 2. Update EXPO_PUBLIC_API_URL in .env with your current IP.
echo 3. Phone and PC must be on the same WiFi for Expo Go.
echo 4. Press W in the Expo terminal to open the web demo.
echo ============================================
pause
