@echo off
echo ============================================
echo  Starting Maintenance Copilot Services...
echo ============================================

:: Step 1: Start Qdrant (Docker)
echo [1/4] Starting Qdrant vector database...
start cmd /k "docker start heuristic_spence"
timeout /t 5 /nobreak

:: Step 2: Start FastAPI retrieval service
echo [2/4] Starting FastAPI retrieval service on port 8001...
start cmd /k "cd C:\Users\Prince\Documents\GitHub\LLM-MaintainanceSystem && set EMBEDDING_MODEL=./models/bge-base-en-v1.5 && set QDRANT_URL=http://localhost:6333 && set EXTRACTION_DIR=C:\Users\Prince\Desktop\content_extraction && python -m uvicorn server.rag.retrieval.retrieval_service:app --reload --port 8001"
timeout /t 5 /nobreak

:: Step 3: Start Node.js backend
echo [3/4] Starting Node.js backend on port 8000...
start cmd /k "cd C:\Users\Prince\Documents\GitHub\LLM-MaintainanceSystem\LLM-Mobile && node server.js"
timeout /t 3 /nobreak

:: Step 4: Start Expo in LAN mode (phone and PC must be on same WiFi)
echo [4/4] Starting Expo in LAN mode for Expo Go...
start cmd /k "cd C:\Users\Prince\Documents\GitHub\LLM-MaintainanceSystem\LLM-Mobile && npx expo start --lan"

echo.
echo ============================================
echo  All services started!
echo ============================================
echo  Qdrant     : http://localhost:6333
echo  FastAPI    : http://localhost:8001
echo  Backend    : http://172.17.99.155:8000
echo  Expo Go    : Scan QR code in Expo terminal
echo ============================================
echo.
echo  IMPORTANT: Phone must be on the same WiFi as this PC
echo  Open Expo Go on your phone and scan the QR code
echo ============================================
pause