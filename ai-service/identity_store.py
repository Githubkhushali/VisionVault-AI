"""
identity_store.py — Persistent Person Re-Identification Engine
==============================================================
Replaces the ephemeral in-memory live_identity_store dict with a
durable identity registry backed by AWS S3.

S3 layout:
  s3://BUCKET/people/person_001/embeddings.npy   ← stacked (N,512) float32
  s3://BUCKET/people/person_001/face_1.jpg
  s3://BUCKET/people/person_001/face_2.jpg

On startup → load all embeddings → build FAISS index (or numpy fallback).
On each new face → search index → assign existing or mint new person_XXX.
"""

import os
import io
import re
import logging
import threading
import tempfile
import time
from typing import Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────
SIMILARITY_THRESHOLD  = 0.68   # cosine similarity to accept a match
QUALITY_THRESHOLD     = 80.0   # Laplacian variance — reject blurry/partial faces
MAX_EMBEDDINGS_STORED = 15     # max embeddings kept per person
BUCKET_PEOPLE_PREFIX  = "people"

# ── Try to load FAISS (native lib), fall back to numpy brute-force ────────────
try:
    import faiss
    _FAISS_AVAILABLE = True
    logger.info("[IdentityStore] FAISS loaded — fast ANN search enabled.")
except ImportError:
    _FAISS_AVAILABLE = False
    logger.warning("[IdentityStore] FAISS not available — using numpy brute-force search.")


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two 1-D float32 vectors."""
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)
    if na < 1e-8 or nb < 1e-8:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def face_quality_score(img_bgr: np.ndarray) -> float:
    """Return Laplacian variance (sharpness proxy). Higher = sharper."""
    if img_bgr is None or img_bgr.size == 0:
        return 0.0
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


class IdentityStore:
    """
    Thread-safe, S3-persisted person identity registry.

    Internal data structures
    ------------------------
    _persons : dict[person_id → dict]
        {
          "embeddings": list[np.ndarray shape(512,)],  ← all stored embeddings
          "mean_emb":   np.ndarray shape(512,),        ← current centroid
          "face_count": int,                            ← saved face images
          "best_quality": float,                        ← highest quality seen
        }

    _faiss_index : faiss.IndexFlatIP | None
        Flat inner-product index (embeddings are L2-normalised → cosine sim).
    _faiss_ids : list[person_id]
        Maps FAISS result index → person_id.
    """

    def __init__(self, s3_uploader):
        self._lock = threading.Lock()
        self._uploader = s3_uploader          # S3Uploader instance from app.py
        self._persons: dict = {}              # person_id → data dict
        self._faiss_index = None
        self._faiss_ids: list = []
        self._next_id_counter: int = 1        # used when minting new IDs
        self._loaded = False

    # ─────────────────────────────────────────────────────────────────────────
    #  Startup: load all embeddings from S3
    # ─────────────────────────────────────────────────────────────────────────
    def load_from_s3(self):
        """
        Download all people/<person_id>/embeddings.npy from S3 and build
        the in-memory index.  Called once at app startup.
        """
        if not self._uploader or not self._uploader.available:
            logger.warning("[IdentityStore] S3 unavailable — starting with empty identity store.")
            self._loaded = True
            return

        logger.info("[IdentityStore] Loading embeddings from S3...")
        try:
            s3 = self._uploader.s3
            bucket = self._uploader.bucket_name
            paginator = s3.get_paginator("list_objects_v2")
            pages = paginator.paginate(Bucket=bucket, Prefix=f"{BUCKET_PEOPLE_PREFIX}/", Delimiter="/")
            person_prefixes = []
            for page in pages:
                for cp in page.get("CommonPrefixes", []):
                    person_prefixes.append(cp["Prefix"])  # e.g. "people/person_001/"

            logger.info(f"[IdentityStore] Found {len(person_prefixes)} person folder(s) in S3.")
            for prefix in person_prefixes:
                person_id = prefix.rstrip("/").split("/")[-1]  # e.g. "person_001"
                emb_key = f"{prefix}embeddings.npy"
                try:
                    obj = s3.get_object(Bucket=bucket, Key=emb_key)
                    data = obj["Body"].read()
                    arr = np.load(io.BytesIO(data), allow_pickle=False)  # shape (N, 512)
                    if arr.ndim == 1:
                        arr = arr.reshape(1, -1)
                    emb_list = [arr[i] for i in range(arr.shape[0])]
                    mean_emb = arr.mean(axis=0).astype(np.float32)
                    # normalise
                    nrm = np.linalg.norm(mean_emb)
                    if nrm > 1e-8:
                        mean_emb /= nrm

                    self._persons[person_id] = {
                        "embeddings": emb_list,
                        "mean_emb":   mean_emb,
                        "face_count": 0,         # will count on next save
                        "best_quality": 0.0,
                    }
                    # parse numeric suffix to track counter
                    m = re.search(r"(\d+)$", person_id)
                    if m:
                        num = int(m.group(1))
                        if num >= self._next_id_counter:
                            self._next_id_counter = num + 1
                    logger.info(f"[IdentityStore] Loaded {len(emb_list)} embedding(s) for {person_id}.")
                except Exception as e:
                    logger.warning(f"[IdentityStore] Could not load embeddings for {person_id}: {e}")

            self._rebuild_faiss_index()
            logger.info(f"[IdentityStore] Ready — {len(self._persons)} known person(s) loaded.")
        except Exception as e:
            logger.error(f"[IdentityStore] S3 load failed: {e}")
        finally:
            self._loaded = True

    # ─────────────────────────────────────────────────────────────────────────
    #  Core API
    # ─────────────────────────────────────────────────────────────────────────
    def find_or_create(
        self,
        embedding: np.ndarray,
        face_img_bgr: Optional[np.ndarray] = None,
    ) -> Tuple[str, bool]:
        """
        Match `embedding` against the known identity store.

        Returns
        -------
        (person_id, is_new)
            is_new=True  → first time this person has been seen
            is_new=False → recognised from previous data
        """
        with self._lock:
            embedding = self._normalise(embedding)

            best_id, best_score = self._search(embedding)

            if best_id and best_score >= SIMILARITY_THRESHOLD:
                # ── Existing person matched ──────────────────────────────────
                person = self._persons[best_id]
                # Update mean embedding (online average — keep last MAX_EMBEDDINGS)
                person["embeddings"].append(embedding)
                if len(person["embeddings"]) > MAX_EMBEDDINGS_STORED:
                    person["embeddings"].pop(0)
                person["mean_emb"] = np.stack(person["embeddings"]).mean(axis=0)
                nrm = np.linalg.norm(person["mean_emb"])
                if nrm > 1e-8:
                    person["mean_emb"] /= nrm

                # Save a better face image if quality improved
                if face_img_bgr is not None:
                    quality = face_quality_score(face_img_bgr)
                    if quality >= QUALITY_THRESHOLD and quality > person["best_quality"]:
                        person["best_quality"] = quality
                        self._upload_face_async(best_id, face_img_bgr, person["face_count"] + 1)
                        person["face_count"] += 1
                        # Persist updated embeddings to S3 asynchronously
                        self._upload_embeddings_async(best_id, person["embeddings"])

                logger.info(f"[IdentityStore] Matched {best_id} (score={best_score:.3f})")
                return best_id, False

            else:
                # ── New person ───────────────────────────────────────────────
                new_id = f"person_{self._next_id_counter:03d}"
                self._next_id_counter += 1

                quality = face_quality_score(face_img_bgr) if face_img_bgr is not None else 0.0
                face_ok = quality >= QUALITY_THRESHOLD or face_img_bgr is None

                self._persons[new_id] = {
                    "embeddings":   [embedding],
                    "mean_emb":     embedding.copy(),
                    "face_count":   1 if face_ok else 0,
                    "best_quality": quality,
                }
                self._rebuild_faiss_index()

                # Persist to S3 asynchronously
                if self._uploader and self._uploader.available:
                    self._upload_embeddings_async(new_id, [embedding])
                    if face_ok and face_img_bgr is not None:
                        self._upload_face_async(new_id, face_img_bgr, 1)

                logger.info(f"[IdentityStore] New identity minted: {new_id} (quality={quality:.1f})")
                return new_id, True

    def get_person_face_url(self, person_id: str) -> Optional[str]:
        """Return the S3 URL for person's face_1.jpg (best canonical face)."""
        if not self._uploader or not self._uploader.available:
            return None
        bucket = self._uploader.bucket_name
        region = self._uploader.region
        key = f"{BUCKET_PEOPLE_PREFIX}/{person_id}/face_1.jpg"
        return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"

    def person_ids(self) -> list:
        """Return all known person IDs."""
        with self._lock:
            return list(self._persons.keys())

    # ─────────────────────────────────────────────────────────────────────────
    #  Internal helpers
    # ─────────────────────────────────────────────────────────────────────────
    @staticmethod
    def _normalise(emb: np.ndarray) -> np.ndarray:
        emb = np.array(emb, dtype=np.float32).flatten()
        nrm = np.linalg.norm(emb)
        return emb / nrm if nrm > 1e-8 else emb

    def _search(self, query_emb: np.ndarray) -> Tuple[Optional[str], float]:
        """Return (best_person_id, best_cosine_similarity) or (None, -1)."""
        if not self._persons:
            return None, -1.0

        if _FAISS_AVAILABLE and self._faiss_index is not None and len(self._faiss_ids) > 0:
            q = query_emb.reshape(1, -1).astype(np.float32)
            D, I = self._faiss_index.search(q, 1)
            idx = int(I[0][0])
            score = float(D[0][0])  # inner product of normalised vecs = cosine sim
            if 0 <= idx < len(self._faiss_ids):
                return self._faiss_ids[idx], score
            return None, -1.0

        # Brute-force fallback
        best_id, best_score = None, -1.0
        for pid, data in self._persons.items():
            s = _cosine_sim(query_emb, data["mean_emb"])
            if s > best_score:
                best_score, best_id = s, pid
        return best_id, best_score

    def _rebuild_faiss_index(self):
        """Rebuild FAISS flat inner-product index from current mean embeddings."""
        if not _FAISS_AVAILABLE or not self._persons:
            return
        dim = 512
        index = faiss.IndexFlatIP(dim)
        ids = []
        vecs = []
        for pid, data in self._persons.items():
            me = data["mean_emb"].astype(np.float32)
            nrm = np.linalg.norm(me)
            if nrm > 1e-8:
                me /= nrm
            vecs.append(me)
            ids.append(pid)
        if vecs:
            mat = np.stack(vecs, axis=0).astype(np.float32)
            index.add(mat)
        self._faiss_index = index
        self._faiss_ids = ids

    def _upload_embeddings_async(self, person_id: str, embeddings: list):
        """Upload embeddings.npy to S3 in a background thread."""
        def _upload():
            try:
                arr = np.stack(embeddings).astype(np.float32)
                buf = io.BytesIO()
                np.save(buf, arr)
                buf.seek(0)
                key = f"{BUCKET_PEOPLE_PREFIX}/{person_id}/embeddings.npy"
                self._uploader.s3.put_object(
                    Bucket=self._uploader.bucket_name,
                    Key=key,
                    Body=buf.getvalue(),
                    ContentType="application/octet-stream",
                )
                logger.debug(f"[IdentityStore] Embeddings saved to S3: {key}")
            except Exception as e:
                logger.warning(f"[IdentityStore] Embedding upload failed for {person_id}: {e}")
        t = threading.Thread(target=_upload, daemon=True)
        t.start()

    def _upload_face_async(self, person_id: str, face_img_bgr: np.ndarray, face_num: int):
        """Upload face_N.jpg to S3 in a background thread."""
        def _upload():
            try:
                resized = cv2.resize(face_img_bgr, (224, 224))
                _, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 92])
                key = f"{BUCKET_PEOPLE_PREFIX}/{person_id}/face_{face_num}.jpg"
                self._uploader.s3.put_object(
                    Bucket=self._uploader.bucket_name,
                    Key=key,
                    Body=buf.tobytes(),
                    ContentType="image/jpeg",
                )
                logger.info(f"[IdentityStore] Face saved to S3: {key}")
            except Exception as e:
                logger.warning(f"[IdentityStore] Face upload failed for {person_id}: {e}")
        t = threading.Thread(target=_upload, daemon=True)
        t.start()
