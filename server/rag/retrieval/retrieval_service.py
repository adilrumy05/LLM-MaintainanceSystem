# server\rag\retrieval\retrieval_service.py
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(BASE_DIR))
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from server.rag.ragPhase2.retrieval_pipeline import RetrievalPipeline

app = FastAPI(title="RAG Retrieval Service")

pipeline = RetrievalPipeline()  # Initialised once at startup
@app.on_event("startup")
async def warmup():
    try:
        pipeline.retrieve(question="warmup", top_k=1)
        print("Pipeline warmed up — vector store initialized.")
    except Exception as e:
        print(f"Warmup warning (non-fatal): {e}")

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
    images: Optional[List[Dict[str, Any]]] = []   # new field

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

        # Build a dictionary of applied filters
        applied_filters = {
            k: v for k, v in request.dict().items()
            if k in ["document_group_id", "classification", "category_level_1", "category_level_2"] and v is not None
        }

        prompt = result.build_prompt(request.question)

        return {
            "prompt": prompt,
            "sources": result.sources,
            "applied_filters": applied_filters,  # <-- new field
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

@app.get("/filters")
async def get_filters():
    try:
        # Force initialization by accessing the lazy-init property
        vs = pipeline._vector_store
        
        # If still None, the pipeline uses lazy init — trigger it
        if vs is None:
            # Run a dummy retrieve to force the pipeline to initialize
            try:
                pipeline.retrieve(question="init", top_k=1)
            except Exception:
                pass  # We don't care about the result, just the side effect
            vs = pipeline._vector_store
        
        if vs is None:
            raise HTTPException(status_code=503, detail="Vector store not initialized after warmup.")
        
        filters = vs.get_known_filters()
        # Return flat — NOT nested under "filters" key
        return {
            "document_group_ids": filters["document_group_ids"],
            "filenames": filters["filenames"],
            "classifications": filters["classifications"],
            "category_level_1": filters["category_level_1"],
            "category_level_2": filters["category_level_2"],
            "model_numbers": filters["model_numbers"],
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f"{e}\n{traceback.format_exc()}")


@app.get("/debug-filters")
async def debug_filters():
    try:
        vs = pipeline._vector_store
        if vs is None:
            try:
                pipeline.retrieve(question="init", top_k=1)
            except Exception:
                pass
            vs = pipeline._vector_store
        
        if vs is None:
            return {"error": "Vector store is None even after warmup — check RetrievalPipeline init"}
        
        filters = vs.get_known_filters()
        return {
            "group_count": len(filters["document_group_ids"]),
            "file_count": len(filters["filenames"]),
            "document_group_ids": filters["document_group_ids"],
            "filenames": filters["filenames"],
        }
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}