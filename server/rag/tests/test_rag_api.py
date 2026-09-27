import sys, json, pathlib, urllib.request
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from retrieval.retrieval_service import app


def test_rag01_docs_page_loads():
    with TestClient(app) as client:
        assert client.get("/docs").status_code == 200


def test_rag02_api_lists_its_routes():
    with TestClient(app) as client:
        spec = client.get("/openapi.json").json()
        print("RAG routes:", list(spec["paths"].keys()))
        assert len(spec["paths"]) > 0


def test_rag03_qdrant_is_reachable():
    with urllib.request.urlopen("http://localhost:6333/collections", timeout=5) as r:
        data = json.loads(r.read())
    assert data["status"] == "ok"


def test_rag04_qdrant_has_data():
    with urllib.request.urlopen("http://localhost:6333/collections/text_chunks_general", timeout=5) as r:
        data = json.loads(r.read())
    assert data["result"]["points_count"] > 0