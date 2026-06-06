import os
import json
from pathlib import Path
from qdrant_client import QdrantClient

# ── CONFIG ─────────────────────────────────────────────

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", None)

CHECKPOINT_FILE = Path(
    os.getenv("CHECKPOINT_DIR", "./checkpoint")
) / "ingest_checkpoint.json"

client = QdrantClient(
    url=QDRANT_URL,
    api_key=QDRANT_API_KEY
)

# ── QDRANT FUNCTIONS ───────────────────────────────────

def list_collections():
    return [c.name for c in client.get_collections().collections]


def wipe_collections(selected):
    for name in selected:
        client.delete_collection(name)
        print(f"🧨 Deleted Qdrant collection: {name}")


# ── CHECKPOINT FUNCTIONS ───────────────────────────────

def load_checkpoint():
    if CHECKPOINT_FILE.exists():
        try:
            return json.loads(CHECKPOINT_FILE.read_text())
        except Exception:
            return None
    return None


def delete_checkpoint():
    if CHECKPOINT_FILE.exists():
        CHECKPOINT_FILE.unlink()
        print(f"🧹 Deleted checkpoint: {CHECKPOINT_FILE}")
    else:
        print("ℹ️ No checkpoint found")


# ── UI HELPERS ─────────────────────────────────────────

def show_menu(collections):
    print("\n🧠 QDRANT COLLECTIONS")
    print("=" * 40)
    for i, c in enumerate(collections, 1):
        print(f"{i}. {c}")
    print("=" * 40)


def show_checkpoint(cp):
    print("\n📦 CHECKPOINT STATUS")
    print("=" * 40)

    if not cp:
        print("No checkpoint found.")
        return

    done = cp.get("done", {})
    failed = cp.get("failed", {})

    print(f"✔ Done files   : {len(done)}")
    print(f"❌ Failed files : {len(failed)}")
    print("=" * 40)


def get_selection(collections):
    choice = input("\nSelect collections (e.g. 1 2 3 or ALL): ").strip()

    if choice.upper() == "ALL":
        return collections

    selected = []
    try:
        indexes = [int(x) for x in choice.split()]
        for i in indexes:
            if 1 <= i <= len(collections):
                selected.append(collections[i - 1])
    except ValueError:
        return []

    return selected


# ── MAIN ───────────────────────────────────────────────

def main():
    collections = list_collections()
    checkpoint = load_checkpoint()

    if not collections:
        print("🧹 No Qdrant collections found.")
    else:
        show_menu(collections)

    show_checkpoint(checkpoint)

    if collections:
        selected = get_selection(collections)
    else:
        selected = []

    print("\n⚠️ YOU ARE ABOUT TO DELETE:")
    for c in selected:
        print(f" - Qdrant: {c}")

    if CHECKPOINT_FILE.exists():
        print(f" - Checkpoint: {CHECKPOINT_FILE}")

    confirm = input("\nType WIPE to confirm FULL RESET: ").strip()

    if confirm != "WIPE":
        print("❌ Aborted. Nothing deleted.")
        return

    # ── EXECUTE WIPE ────────────────────────────────
    if selected:
        wipe_collections(selected)

    delete_checkpoint()

    print("\n✅ FULL RESET COMPLETE")


if __name__ == "__main__":
    main()
