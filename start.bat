@echo off
set ROOT=%~dp0

echo ============================================
echo  Maintenance Copilot - Pre-flight Checks
echo ============================================

:: ── Docker check ─────────────────────────────────────────────────
:: Verifies Docker Desktop is running before attempting to use Qdrant.
:: Qdrant runs as a Docker container on port 6333.
:: If Docker is not running, Qdrant will be unavailable and
:: document retrieval will fail on all AI queries.
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

:: ── Port conflict checks ─────────────────────────────────────────
:: Checks whether ports 8000, 8001, and 6333 are already in use.
:: A port conflict will prevent a service from starting correctly.
:: If a conflict is found, identify and close the process using
:: that port before re-running this script.

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

netstat -ano | findstr ":6333 " > nul 2>&1
if not errorlevel 1 (
    echo  [OK] Port 6333 is in use - Qdrant appears to be running.
) else (
    echo  [WARNING] Port 6333 is not active. Qdrant may not be running.
    echo  Run: docker start qdrant
)

echo.
echo ============================================
echo  Starting Maintenance Copilot Services...
echo ============================================

:: ── Service descriptions ─────────────────────────────────────────
::
::  FastAPI  (port 8001)
::    Python retrieval service built with FastAPI.
::    Handles document embedding, semantic search via Qdrant,
::    and returns the most relevant manual chunks for each query.
::
::  Node Backend  (port 8000)
::    Express.js server handling all API routes.
::    Manages Firebase auth, HITL approve/reject endpoints,
::    input sanitisation middleware, and the main /api/query route
::    that connects the mobile app to FastAPI and the LLM.
::
::  Expo  (LAN mode)
::    React Native mobile app served over the local network.
::    Use Expo Go on your phone or press W to open in browser.
::    Requires EXPO_PUBLIC_API_URL in .env to match your current IP.
::
::  Qdrant  (port 6333)
::    Vector database running as a Docker container.
::    Stores document embeddings used by the FastAPI retrieval service.
::    Must be started manually via Docker before running this script.
:: ─────────────────────────────────────────────────────────────────

:: Step 1: FastAPI
start "FastAPI" cmd /k "cd /d %ROOT% && python -m uvicorn server.rag.retrieval.retrieval_service:app --reload --port 8001 --host 0.0.0.0"
timeout /t 8 /nobreak > nul

:: Step 2: Node backend
start "Backend" cmd /k "cd /d %ROOT% && node server.js"
timeout /t 3 /nobreak > nul

:: Step 3: Expo
start "Expo" cmd /k "cd /d %ROOT%LLM-Mobile && npx expo start --lan --clear"

echo.
echo ============================================
echo  All services started!
echo ============================================
echo  Qdrant     : http://localhost:6333
echo  FastAPI    : http://localhost:8001
echo  Backend    : http://localhost:8000
echo  Expo Web   : Press W in the Expo terminal
echo ============================================
echo.
echo IMPORTANT:
echo 1. Docker Desktop must be running (Qdrant needs it).
echo 2. Update EXPO_PUBLIC_API_URL in .env with your current IP.
echo 3. Phone and PC must be on the same WiFi for Expo Go.
echo 4. Press W in the Expo terminal to open the web demo.
echo ============================================
pause