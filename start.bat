@echo off
set ROOT=%~dp0

echo ============================================
echo  Starting Maintenance Copilot Services...
echo ============================================

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
echo ============================================
echo.
echo IMPORTANT:
echo 1. Docker Desktop must be running.
echo 2. Update EXPO_PUBLIC_API_URL in .env with your PC's IP.
echo 3. Phone and PC must be on the same WiFi.
echo ============================================
pause


@REM @echo off
@REM echo ============================================
@REM echo  Starting Maintenance Copilot Services...
@REM echo ============================================

@REM :: Step 1: Start Qdrant (Docker)
@REM echo [1/4] Starting Qdrant vector database...
@REM start cmd /k "docker start qdrant"
@REM timeout /t 5 /nobreak

@REM :: Step 2: Start FastAPI retrieval service
@REM echo [2/4] Starting FastAPI retrieval service on port 8001...
@REM start cmd /k "cd C:\Users\Prince\Documents\GitHub\LLM-MaintainanceSystem && python -m uvicorn server.rag.retrieval.retrieval_service:app --reload --port 8001 --host 0.0.0.0"
@REM timeout /t 8 /nobreak

@REM :: Step 3: Start Node.js backend
@REM echo [3/4] Starting Node.js backend on port 8000...
@REM start cmd /k "cd C:\Users\Prince\Documents\GitHub\LLM-MaintainanceSystem && node server.js"
@REM timeout /t 3 /nobreak

@REM :: Step 4: Start Expo in LAN mode
@REM echo [4/4] Starting Expo in LAN mode for Expo Go...
@REM start cmd /k "cd C:\Users\Prince\Documents\GitHub\LLM-MaintainanceSystem\LLM-Mobile && npx expo start --lan --clear"

@REM echo.
@REM echo ============================================
@REM echo  All services started!
@REM echo ============================================
@REM echo  Qdrant     : http://localhost:6333
@REM echo  FastAPI    : http://0.0.0.0:8001
@REM echo  Backend    : http://172.17.104.34:8000
@REM echo  Expo Go    : Scan QR code in Expo terminal
@REM echo ============================================
@REM echo.
@REM echo  IMPORTANT: Phone must be on the same WiFi as this PC
@REM echo  Open Expo Go on your phone and scan the QR code
@REM echo ============================================
@REM pause