# server\rag\retrieval\retrieval_service.py
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BASE_DIR))
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from server.rag.ragPhase2.retrieval_pipeline import RetrievalPipeline

app = FastAPI(title="RAG Retrieval Service")
pipeline = RetrievalPipeline()  # Initialised once at startup

class RetrievalRequest(BaseModel):
    question: str
    document_group_id: Optional[str] = None
    classification: Optional[str] = None
    category_level_1: Optional[str] = None
    category_level_2: Optional[str] = None
    top_k: int = 5

class ContextBlock(BaseModel):
    chunk_type: str
    score: float
    page: int
    document_group_id: str
    filename: str
    text: str

class Source(BaseModel):
    document_group_id: str
    filename: str
    page: int
    classification: str

class RetrievalResponse(BaseModel):
    prompt: str
    sources: List[Source]
    context_blocks: List[ContextBlock]

@app.post("/retrieve", response_model=RetrievalResponse)
async def retrieve(request: RetrievalRequest):
    try:
        result = pipeline.retrieve(
            question=request.question,
            document_group_id=request.document_group_id,
            classification=request.classification,
            category_level_1=request.category_level_1,
            category_level_2=request.category_level_2,
            top_k=request.top_k,
        )
        prompt = result.build_prompt(request.question)

        return {
            "prompt": prompt,
            "sources": result.sources,
            "context_blocks": [
                {
                    "chunk_type": b.chunk_type,
                    "score": b.score,
                    "page": b.page,
                    "document_group_id": b.document_group_id,
                    "filename": b.filename,
                    "text": b.text,
                }
                for b in result.context_blocks
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)