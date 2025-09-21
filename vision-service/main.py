from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import base64
import uvicorn
import io
import os
from dataclasses import dataclass

import numpy as np
from PIL import Image

# Optional heavy deps; they must be installed via requirements.txt
try:
    from ultralytics import YOLO
except Exception:
    YOLO = None  # type: ignore

try:
    from insightface.app import FaceAnalysis
except Exception:
    FaceAnalysis = None  # type: ignore

app = FastAPI(title="Vision Service", version="0.2.0")


class RefReq(BaseModel):
    image: str  # base64 (no data URL prefix)


class VerifyReq(BaseModel):
    image: str
    referenceEmbedding: List[float]


# Globals for models
yolo_model = None
face_embedder = None


@dataclass
class FaceBox:
    x1: int
    y1: int
    x2: int
    y2: int
    score: float


@app.on_event("startup")
async def load_models():
    global yolo_model, face_embedder
    # Load YOLO (face) detector
    # Prefer an env override; otherwise use a common YOLOv8-face community weight URL
    # Note: The model will be downloaded on first run if not cached.
    if YOLO is not None:
        weights = os.getenv(
            "YOLO_FACE_WEIGHTS",
            "https://github.com/akanametov/yolov8-face/releases/download/v0.0.0/yolov8n-face.pt",
        )
        try:
            yolo_model = YOLO(weights)
        except Exception as e:
            print("[vision] Failed to load YOLO model:", e)
            yolo_model = None
    else:
        print("[vision] ultralytics is not installed; YOLO disabled")

    # Load face embedding model (InsightFace / ArcFace)
    if FaceAnalysis is not None:
        try:
            face_embedder = FaceAnalysis(name=os.getenv("INSIGHTFACE_MODEL", "buffalo_l"))
            # ctx_id=-1 selects CPU; set 0 to use first GPU if available
            ctx = int(os.getenv("INSIGHTFACE_CTX_ID", "-1"))
            face_embedder.prepare(ctx_id=ctx, det_size=(640, 640))
        except Exception as e:
            print("[vision] Failed to load InsightFace:", e)
            face_embedder = None
    else:
        print("[vision] insightface is not installed; embeddings disabled")


def decode_base64_image(b64: str) -> bytes:
    return base64.b64decode(b64)


def img_bytes_to_ndarray(img_bytes: bytes) -> np.ndarray:
    """Convert raw image bytes to numpy RGB array."""
    with Image.open(io.BytesIO(img_bytes)) as im:
        im = im.convert("RGB")
        return np.array(im)


def get_face_embedding(img_bytes: bytes) -> List[float]:
    """Compute a face embedding using InsightFace. Falls back to zeros if unavailable.

    Strategy:
    - Detect faces using InsightFace's internal detector; if unavailable, try YOLO boxes and crop largest.
    - Return the normalized embedding vector of the largest face.
    """
    global yolo_model, face_embedder
    arr = img_bytes_to_ndarray(img_bytes)

    # Primary: InsightFace detector+embedder
    if face_embedder is not None:
        try:
            faces = face_embedder.get(arr)
            if faces:
                # Choose the face with largest area
                faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), reverse=True)
                emb = getattr(faces[0], "normed_embedding", None) or getattr(faces[0], "embedding", None)
                if emb is not None:
                    return [float(x) for x in emb.tolist()]
        except Exception as e:
            print("[vision] InsightFace embedding failed:", e)

    # Fallback: use YOLO detection to crop and then use InsightFace for embedding if available
    if yolo_model is not None and face_embedder is not None:
        try:
            res = yolo_model.predict(arr, verbose=False)
            boxes: List[FaceBox] = []
            for r in res:
                if getattr(r, "boxes", None) is None:
                    continue
                for b in r.boxes:  # type: ignore[attr-defined]
                    xyxy = b.xyxy[0].tolist()  # [x1,y1,x2,y2]
                    conf = float(b.conf[0]) if getattr(b, "conf", None) is not None else 0.0
                    boxes.append(FaceBox(int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3]), conf))
            if boxes:
                boxes.sort(key=lambda bb: (bb.x2 - bb.x1) * (bb.y2 - bb.y1), reverse=True)
                bb = boxes[0]
                crop = arr[max(bb.y1, 0):max(bb.y2, 0), max(bb.x1, 0):max(bb.x2, 0)]
                faces = face_embedder.get(crop)
                if faces:
                    emb = getattr(faces[0], "normed_embedding", None) or getattr(faces[0], "embedding", None)
                    if emb is not None:
                        return [float(x) for x in emb.tolist()]
        except Exception as e:
            print("[vision] YOLO-assisted embedding failed:", e)

    # Last resort: deterministic zero vector of typical 512/256/128 length; choose 512
    return [0.0] * 512


def compare_embeddings(a: List[float], b: List[float]) -> float:
    # Cosine similarity
    import math
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return max(0.0, min(1.0, dot / (na * nb)))


def yolo_face_metrics(img_bytes: bytes) -> Dict[str, Any]:
    """Run YOLO face detection and return counts and simple heuristics.

    For now, headPose and lookingAway are placeholders. If landmark models are added,
    compute pose properly.
    """
    global yolo_model
    arr = img_bytes_to_ndarray(img_bytes)
    faces_count = 0
    try:
        if yolo_model is not None:
            res = yolo_model.predict(arr, verbose=False)
            for r in res:
                if getattr(r, "boxes", None) is None:
                    continue
                faces_count += len(r.boxes)  # type: ignore[attr-defined]
    except Exception as e:
        print("[vision] YOLO metrics failed:", e)
    return {
        "facesCount": int(faces_count),
        "multipleFaces": bool(faces_count > 1),
        "lookingAway": False,
        "headPose": {"pitch": 0.0, "yaw": 0.0, "roll": 0.0},
    }


@app.post("/face/reference")
async def create_reference(req: RefReq):
    img_bytes = decode_base64_image(req.image)
    emb = get_face_embedding(img_bytes)
    return {"embedding": emb, "meta": {"method": "arcface", "model": "r100"}}


@app.post("/face/verify")
async def verify(req: VerifyReq):
    img_bytes = decode_base64_image(req.image)
    live_emb = get_face_embedding(img_bytes)
    score = compare_embeddings(live_emb, req.referenceEmbedding)
    metrics = yolo_face_metrics(img_bytes)
    return {"matchScore": score, **metrics}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=5001, reload=True)
