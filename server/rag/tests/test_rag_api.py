import os, sys, json, pathlib, urllib.request
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv(pathlib.Path(__file__).resolve().parents[3] / ".env")

from fastapi.testclient import TestClient
from retrieval.retrieval_service import app

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333").rstrip("/")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")


def _qdrant_get(path):
    req = urllib.request.Request(f"{QDRANT_URL}{path}")
    if QDRANT_API_KEY:
        req.add_header("api-key", QDRANT_API_KEY)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def test_rag01_docs_page_loads():
    with TestClient(app) as client:
        assert client.get("/docs").status_code == 200


def test_rag02_api_lists_its_routes():
    with TestClient(app) as client:
        spec = client.get("/openapi.json").json()
        print("RAG routes:", list(spec["paths"].keys()))
        assert len(spec["paths"]) > 0


def test_rag03_qdrant_is_reachable():
    data = _qdrant_get("/collections")
    assert data["status"] == "ok"


def test_rag04_qdrant_has_data():
    data = _qdrant_get("/collections/text_chunks_general")
    assert data["result"]["points_count"] > 0