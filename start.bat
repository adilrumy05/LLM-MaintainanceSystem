@echo off
echo Starting all services...

start cmd /k "docker start heuristic_spence"

timeout /t 3

start cmd /k "cd C:\Users\Prince\Documents\GitHub\LLM-MaintainanceSystem && python -m uvicorn server.rag.retrieval.retrieval_service:app --reload --port 8001"

timeout /t 3

start cmd /k "cd C:\Users\Prince\Documents\GitHub\LLM-MaintainanceSystem\LLM-Mobile && node server.js"

timeout /t 2

start cmd /k "cd C:\Users\Prince\Documents\GitHub\LLM-MaintainanceSystem\LLM-Mobile && npx expo start"

echo All services started!
