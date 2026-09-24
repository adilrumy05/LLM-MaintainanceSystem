"""Thin wrapper around firebase-admin for the ManualImages collection."""

import logging
from typing import Any, Dict, List, Optional

from .utils import page_num_int

logger = logging.getLogger("describe_images.firebase")

from dotenv import load_dotenv 

load_dotenv()

COLLECTION_NAME = "ManualImages"


class FirebaseClient:
    def __init__(self, service_account_path: str, bucket_name: str):
        import firebase_admin
        from firebase_admin import credentials, firestore, storage

        if not firebase_admin._apps:
            cred = credentials.Certificate(service_account_path)
            firebase_admin.initialize_app(cred, {"storageBucket": bucket_name})

        self.db = firestore.client()
        self.bucket = storage.bucket()
        logger.info(f"Firebase connected: bucket={bucket_name}")

    def fetch_image_docs(
        self,
        document_group: Optional[str] = None,
        max_pages: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        query = self.db.collection(COLLECTION_NAME)
        if document_group:
            query = query.where("documentGroup", "==", document_group)

        docs = []
        for snap in query.stream():
            data = snap.to_dict() or {}
            data["_id"] = snap.id
            if max_pages is not None:
                pn = page_num_int(data.get("pageNum"))
                if pn is not None and pn > max_pages:
                    continue
            docs.append(data)
            if limit is not None and len(docs) >= limit:
                break
        return docs

    def download_image_bytes(self, storage_path: str) -> bytes:
        blob = self.bucket.blob(storage_path)
        return blob.download_as_bytes()

    def update_doc(self, doc_id: str, fields: Dict[str, Any]) -> None:
        from firebase_admin import firestore

        fields = dict(fields)
        fields["vlmUpdatedAt"] = firestore.SERVER_TIMESTAMP
        self.db.collection(COLLECTION_NAME).document(doc_id).update(fields)