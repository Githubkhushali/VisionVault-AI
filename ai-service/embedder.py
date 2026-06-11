"""
embedder.py — Phase 5: Face Embedding + Identity Deduplication
================================================================
Uses facenet-pytorch's InceptionResnetV1 (VGGFace2 pretrained) to:
  1. Convert a 224×224 BGR face crop → a 512-dim L2-normalized embedding.
  2. Compare two embeddings with cosine similarity.
  3. Deduplicate a list of (identity_id, embedding) pairs so that the same
     real person with two different track IDs gets merged into one identity.

Model: InceptionResnetV1 (VGGFace2) — 512-dim output, ~89% LFW accuracy.
"""

# macOS Python 3.14 does not bundle CA certificates by default, which causes
# SSL errors when facenet-pytorch attempts to verify the weights download URL.
# We bypass SSL verification here since the weights are already cached locally.
import ssl
ssl._create_default_https_context = ssl._create_unverified_context  # noqa: S501


import os
import logging
import numpy as np
import cv2
import torch
import torch.nn.functional as F

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────
# Two face embeddings whose cosine similarity exceeds this threshold are
# considered the same person.  0.75 is a well-calibrated value for VGGFace2:
# same-person pairs typically score > 0.80, different-person pairs < 0.65.
SIMILARITY_THRESHOLD = 0.75

# InceptionResnetV1 expects 160×160 input, regardless of the crop size we save.
FACENET_INPUT_SIZE = 160


class FaceEmbedder:
    """
    Thin wrapper around facenet-pytorch's InceptionResnetV1.

    Usage
    -----
    embedder = FaceEmbedder()              # load once at startup
    emb = embedder.get_embedding(crop)     # numpy HxWx3 BGR uint8 → tensor (512,)
    sim = embedder.cosine_sim(emb1, emb2)  # float in [-1, 1]
    ids = embedder.deduplicate(pairs)      # list[(label, emb)] → merged label map
    """

    def __init__(self):
        try:
            from facenet_pytorch import InceptionResnetV1
            self.model = InceptionResnetV1(pretrained='vggface2').eval()
            logger.info("[Phase 5] InceptionResnetV1 (VGGFace2) loaded successfully.")
        except Exception as e:
            logger.error(f"[Phase 5] Failed to load InceptionResnetV1: {e}")
            self.model = None

        self.clusters: list[tuple[str, torch.Tensor]] = []  # Global memory for identities

    @property
    def available(self) -> bool:
        return self.model is not None

    def get_embedding(self, face_crop_bgr: np.ndarray) -> torch.Tensor | None:
        """
        Convert a BGR face crop (any size) to a 512-dim L2-normalised embedding.

        Parameters
        ----------
        face_crop_bgr : np.ndarray  shape (H, W, 3), dtype uint8, BGR colour order

        Returns
        -------
        torch.Tensor  shape (512,), or None if the model is unavailable / crop empty
        """
        if self.model is None or face_crop_bgr is None or face_crop_bgr.size == 0:
            return None

        # BGR → RGB, resize to 160×160 (InceptionResnetV1 expected input)
        img = cv2.cvtColor(face_crop_bgr, cv2.COLOR_BGR2RGB)
        img = cv2.resize(img, (FACENET_INPUT_SIZE, FACENET_INPUT_SIZE))

        # Scale to [0, 1], normalise to [-1, 1] (fixed-point whitening)
        img = img.astype(np.float32) / 255.0
        img = (img - 0.5) / 0.5

        # HWC → CHW, add batch dim
        tensor = torch.from_numpy(img).permute(2, 0, 1).unsqueeze(0)  # (1, 3, 160, 160)

        with torch.no_grad():
            embedding = self.model(tensor)  # (1, 512)

        return embedding[0]  # (512,)

    def get_embedding_from_path(self, crop_path: str) -> torch.Tensor | None:
        """Load a saved face crop JPEG and return its embedding."""
        if not crop_path or not os.path.exists(crop_path):
            return None
        img = cv2.imread(crop_path)
        if img is None:
            return None
        return self.get_embedding(img)

    @staticmethod
    def cosine_sim(emb1: torch.Tensor, emb2: torch.Tensor) -> float:
        """
        Cosine similarity in [-1, 1].  Values > SIMILARITY_THRESHOLD → same person.
        """
        return F.cosine_similarity(emb1.unsqueeze(0), emb2.unsqueeze(0)).item()

    def deduplicate(
        self,
        pairs: list[tuple[int | str, torch.Tensor]],
        threshold: float = SIMILARITY_THRESHOLD,
    ) -> dict[int | str, str]:
        """
        Cluster (label, embedding) pairs by cosine similarity.

        Two labels are merged if their embeddings are similar enough.
        The *first* label seen in each cluster becomes the canonical identityId.

        Parameters
        ----------
        pairs     : list of (original_id, embedding_tensor)
        threshold : cosine similarity cutoff

        Returns
        -------
        dict mapping original_id → canonical identityId string  e.g. "id_001"
        """
        label_to_identity: dict[int | str, str] = {}

        for original_id, emb in pairs:
            if emb is None:
                label_to_identity[original_id] = f"id_unk_{original_id}"
                continue

            matched_cluster = None
            best_sim = -1.0

            for canonical_id, centroid in self.clusters:
                sim = self.cosine_sim(emb, centroid)
                if sim > threshold and sim > best_sim:
                    best_sim = sim
                    matched_cluster = canonical_id

            if matched_cluster is not None:
                # Merge into existing cluster — same person
                label_to_identity[original_id] = matched_cluster
                logger.info(
                    f"[Phase 5] Track {original_id} merged into identity "
                    f"{matched_cluster} (similarity={best_sim:.3f})"
                )
            else:
                # New identity — first time we see this face
                new_id = f"id_{len(self.clusters) + 1:03d}"
                self.clusters.append((new_id, emb))
                label_to_identity[original_id] = new_id
                logger.info(f"[Phase 5] Track {original_id} → new identity {new_id}")

        return label_to_identity
