import os
import logging
import cv2
from flask import Flask, request, jsonify
from ultralytics import YOLO
from dotenv import load_dotenv
from s3_uploader import S3Uploader
import uuid
import numpy as np
from numpy.linalg import norm
import sqlite3
from datetime import datetime
# pyrefly: ignore [missing-import]
from deepface import DeepFace

load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ── DB path (shared with backend SQLite) ──────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'backend', 'database.sqlite')

# ── Load face-specific YOLO model ─────────────────────────────────────────────
face_model = YOLO("yolov8n-face.pt")

# ── Entry-exit tracking (in-memory per session) ───────────────────────────────
movement_store = {}
BOUNDARY_Y = 0.5   # 50% of frame height (normalised)

# ── Phase 1: Main YOLO model ──────────────────────────────────────────────────
MODEL_NAME = "yolov8m.pt"
CONF_THRESHOLD = 0.75
FACE_CONF_THRESHOLD = 0.90
FACE_SAMPLE_EVERY = 10

logging.info(f"Loading {MODEL_NAME}...")
try:
    model = YOLO(MODEL_NAME)
    logging.info(f"{MODEL_NAME} loaded.")
except Exception as e:
    logging.error(f"Failed to load YOLO model: {e}")
    model = None

# ── S3 Uploader ───────────────────────────────────────────────────────────────
uploader = S3Uploader()

# ── Identity Store (S3-backed persistent re-ID) ───────────────────────────────
try:
    from identity_store import IdentityStore
    identity_store = IdentityStore(uploader)
    identity_store.load_from_s3()   # blocking load on startup
    logging.info("[App] IdentityStore ready.")
except Exception as e:
    identity_store = None
    logging.warning(f"[App] IdentityStore unavailable: {e}")

# ── Daily Logger ──────────────────────────────────────────────────────────────
try:
    from daily_logger import DailyLogger
    daily_logger = DailyLogger(DB_PATH)
    logging.info("[App] DailyLogger ready.")
except Exception as e:
    daily_logger = None
    logging.warning(f"[App] DailyLogger unavailable: {e}")

# ── MTCNN face detector ───────────────────────────────────────────────────────
_MTCNN_AVAILABLE = False
mtcnn = None
try:
    from facenet_pytorch import MTCNN
    import torch
    _MTCNN_AVAILABLE = True
    mtcnn = MTCNN(keep_all=True, device='cpu', min_face_size=20, thresholds=[0.6, 0.7, 0.8])
    logging.info("[MTCNN] Face detector loaded.")
except ImportError:
    logging.warning("[MTCNN] facenet_pytorch not available.")

# ── Face embedder ─────────────────────────────────────────────────────────────
_EMBEDDER_AVAILABLE = False
embedder = None
try:
    from embedder import FaceEmbedder
    embedder = FaceEmbedder()
    _EMBEDDER_AVAILABLE = True
    logging.info("[Embedder] FaceEmbedder loaded.")
except ImportError:
    logging.warning("[Embedder] embedder.py not available.")

# ── Upload folders ────────────────────────────────────────────────────────────
UPLOAD_FOLDER = 'temp_uploads'
FACE_CROPS_DIR = 'face_crops'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(FACE_CROPS_DIR, exist_ok=True)

app = Flask(__name__)

# ─────────────────────────────────────────────────────────────────────────────
#  DB helpers
# ─────────────────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def log_movement_event(identity_id, event_type):
    """Persist ENTRY or EXIT event to SQLite."""
    try:
        conn = get_db()
        row = conn.execute("""
            SELECT entry_count, exit_count FROM movement_events
            WHERE identity_id=? ORDER BY id DESC LIMIT 1
        """, (identity_id,)).fetchone()
        entry_count = row["entry_count"] if row else 0
        exit_count  = row["exit_count"]  if row else 0
        if event_type == "ENTRY":
            entry_count += 1
        else:
            exit_count += 1
        name_row = conn.execute("SELECT name FROM persons WHERE identity_id=?", (identity_id,)).fetchone()
        person_name = name_row["name"] if name_row else "Unknown"
        conn.execute("""
            INSERT INTO movement_events (identity_id, person_name, event_type, entry_count, exit_count)
            VALUES (?,?,?,?,?)
        """, (identity_id, person_name, event_type, entry_count, exit_count))
        conn.commit()
        conn.close()
        return entry_count, exit_count
    except Exception as e:
        logging.error(f"[Movement DB] {e}")
        return 0, 0


def get_movement_counts(identity_id):
    try:
        conn = get_db()
        row = conn.execute("""
            SELECT entry_count, exit_count FROM movement_events
            WHERE identity_id=? ORDER BY id DESC LIMIT 1
        """, (identity_id,)).fetchone()
        conn.close()
        return (row["entry_count"], row["exit_count"]) if row else (0, 0)
    except:
        return (0, 0)


def track_movement(identity_id, center_y_norm, frame_height):
    if identity_id not in movement_store:
        movement_store[identity_id] = {
            "entry_count": 0, "exit_count": 0,
            "last_y": center_y_norm, "status": "UNKNOWN",
            "name": movement_store.get(identity_id, {}).get("name", "Unknown")
        }
        return movement_store[identity_id]

    entry = movement_store[identity_id]
    last_y = entry["last_y"]
    crossed_down = last_y < BOUNDARY_Y and center_y_norm >= BOUNDARY_Y
    crossed_up   = last_y >= BOUNDARY_Y and center_y_norm < BOUNDARY_Y

    if crossed_down:
        ec, xc = log_movement_event(identity_id, "ENTRY")
        entry["entry_count"] = ec
        entry["exit_count"]  = xc
        entry["status"] = "INSIDE"
    elif crossed_up:
        ec, xc = log_movement_event(identity_id, "EXIT")
        entry["entry_count"] = ec
        entry["exit_count"]  = xc
        entry["status"] = "OUTSIDE"

    entry["last_y"] = center_y_norm
    return entry


def get_person_name(identity_id: str) -> str:
    try:
        conn = get_db()
        row = conn.execute("SELECT name FROM persons WHERE identity_id=?", (identity_id,)).fetchone()
        conn.close()
        return row["name"] if row else "Unknown"
    except:
        return "Unknown"


# ─────────────────────────────────────────────────────────────────────────────
#  Route: Register name
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/register-name', methods=['POST'])
def register_name():
    data = request.json
    identity_id = data.get("identityId")
    name = data.get("name")
    if not identity_id or not name:
        return jsonify({"error": "identityId and name required"}), 400

    if identity_id not in movement_store:
        movement_store[identity_id] = {"entry_count": 0, "exit_count": 0, "last_y": 0.5, "status": "UNKNOWN", "name": name}
    else:
        movement_store[identity_id]["name"] = name

    try:
        conn = get_db()
        conn.execute("""
            INSERT INTO persons (name, identity_id) VALUES (?,?)
            ON CONFLICT(identity_id) DO UPDATE SET name=excluded.name
        """, (name, identity_id))
        conn.commit()
        conn.close()
    except Exception as e:
        logging.error(f"[Register] DB error: {e}")

    # Backfill the name in daily logs
    if daily_logger:
        daily_logger.update_name(identity_id, name)

    return jsonify({"success": True, "identityId": identity_id, "name": name}), 200


# ─────────────────────────────────────────────────────────────────────────────
#  Route: Detect frame (live webcam)
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/detect-frame', methods=['POST'])
def detect_frame():
    if 'frame' not in request.files:
        return jsonify({"error": "No frame provided"}), 400

    file = request.files['frame']
    temp_path = os.path.join(UPLOAD_FOLDER, f"frm_{uuid.uuid4().hex[:8]}.jpg")
    file.save(temp_path)

    try:
        frame_bgr = cv2.imread(temp_path)
        img_h, img_w = frame_bgr.shape[:2]

        results = face_model(temp_path, conf=0.50)
        detections = []

        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                pad = 10
                x1c = max(0, x1-pad); y1c = max(0, y1-pad)
                x2c = min(img_w, x2+pad); y2c = min(img_h, y2+pad)
                face_crop = frame_bgr[y1c:y2c, x1c:x2c]

                if face_crop.size == 0:
                    continue

                # Face quality gate
                from identity_store import face_quality_score
                quality = face_quality_score(face_crop)

                crop_tmp = os.path.join(UPLOAD_FOLDER, f"crop_{uuid.uuid4().hex[:8]}.jpg")
                cv2.imwrite(crop_tmp, cv2.resize(face_crop, (224, 224)))

                identity_id = None
                is_new = False
                s3_url = None

                try:
                    rep = DeepFace.represent(crop_tmp, model_name="ArcFace",
                                             detector_backend="skip", enforce_detection=False)
                    if rep:
                        raw_emb = np.array(rep[0]["embedding"], dtype=np.float32)

                        # ── Use persistent IdentityStore ─────────────────────
                        if identity_store:
                            identity_id, is_new = identity_store.find_or_create(raw_emb, face_crop)
                        else:
                            # Fallback: legacy in-memory (no persistence)
                            identity_id = f"id_{uuid.uuid4().hex[:8]}"
                            is_new = True

                        # Log appearance in daily log
                        if daily_logger and identity_id:
                            name = get_person_name(identity_id)
                            daily_logger.log_appearance(identity_id, name if name != "Unknown" else None)

                        # Upload face to S3 (new identities, good quality)
                        if is_new and quality >= 80.0 and uploader.available:
                            crop_key = f"people/{identity_id}/{int(__import__('time').time() * 1000)}_canonical.jpg"
                            s3_url = uploader.upload_file(crop_tmp, crop_key)

                except Exception as e:
                    logging.warning(f"[detect-frame] Embedding error: {e}")
                finally:
                    if os.path.exists(crop_tmp):
                        os.remove(crop_tmp)

                # Entry-exit tracking
                movement = {}
                if identity_id:
                    center_y = (y1 + y2) / 2
                    center_y_norm = center_y / img_h
                    movement = track_movement(identity_id, center_y_norm, img_h)

                # Normalised bbox for frontend overlay
                bbox_norm = {
                    "x": x1 / img_w,
                    "y": y1 / img_h,
                    "w": (x2 - x1) / img_w,
                    "h": (y2 - y1) / img_h,
                }

                detections.append({
                    "bbox":       {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
                    "bboxNorm":   bbox_norm,
                    "confidence": round(float(box.conf[0]), 4),
                    "quality":    round(quality, 1),
                    "identityId": identity_id,
                    "isNew":      is_new,
                    "s3Url":      s3_url,
                    "name":       movement.get("name", get_person_name(identity_id) if identity_id else "Unknown"),
                    "entryCount": movement.get("entry_count", 0),
                    "exitCount":  movement.get("exit_count", 0),
                    "status":     movement.get("status", "UNKNOWN"),
                })

        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({"detections": detections, "frameDetections": len(detections)}), 200

    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
#  Route: Daily logs
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/daily-logs', methods=['GET'])
def get_daily_logs():
    date_str = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))
    if not daily_logger:
        return jsonify({"error": "DailyLogger unavailable"}), 503

    rows = daily_logger.get_day_log(date_str)
    # Enrich with face URLs from identity_store
    enriched = []
    for r in rows:
        pid = r["person_id"]
        face_url = None
        if identity_store:
            face_url = identity_store.get_person_face_url(pid)
        enriched.append({**r, "faceUrl": face_url})

    return jsonify({"date": date_str, "people": enriched}), 200


@app.route('/daily-summary', methods=['GET'])
def get_daily_summary():
    date_str = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))
    if not daily_logger:
        return jsonify({"error": "DailyLogger unavailable"}), 503
    summary = daily_logger.get_day_summary(date_str)
    return jsonify(summary), 200


@app.route('/hourly-stats', methods=['GET'])
def get_hourly_stats():
    date_str = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))
    if not daily_logger:
        return jsonify({"error": "DailyLogger unavailable"}), 503
    stats = daily_logger.get_hourly_stats(date_str)
    return jsonify({"date": date_str, "hours": stats}), 200


@app.route('/daily-trend', methods=['GET'])
def get_daily_trend():
    days = int(request.args.get("days", 7))
    if not daily_logger:
        return jsonify({"error": "DailyLogger unavailable"}), 503
    trend = daily_logger.get_daily_trend(days)
    return jsonify({"trend": trend}), 200


@app.route('/top-people', methods=['GET'])
def get_top_people():
    if not daily_logger:
        return jsonify({"error": "DailyLogger unavailable"}), 503
    people = daily_logger.get_top_people()
    enriched = []
    for p in people:
        pid = p["person_id"]
        face_url = identity_store.get_person_face_url(pid) if identity_store else None
        enriched.append({**p, "faceUrl": face_url})
    return jsonify({"topPeople": enriched}), 200


@app.route('/available-dates', methods=['GET'])
def get_available_dates():
    if not daily_logger:
        return jsonify({"error": "DailyLogger unavailable"}), 503
    dates = daily_logger.get_available_dates()
    return jsonify({"dates": dates}), 200


# ─────────────────────────────────────────────────────────────────────────────
#  Route: Movements
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/movements', methods=['GET'])
def get_movements():
    try:
        conn = get_db()
        rows = conn.execute("""
            SELECT
                me.identity_id,
                COALESCE(p.name, 'Unknown') as name,
                me.entry_count,
                me.exit_count,
                me.event_type as last_event,
                me.timestamp as last_seen
            FROM movement_events me
            LEFT JOIN persons p ON p.identity_id = me.identity_id
            WHERE me.id IN (
                SELECT MAX(id) FROM movement_events GROUP BY identity_id
            )
            ORDER BY me.timestamp DESC
        """).fetchall()
        conn.close()
        result = [
            {
                "identityId": r["identity_id"],
                "name":        r["name"],
                "entryCount":  r["entry_count"],
                "exitCount":   r["exit_count"],
                "status":      "INSIDE" if r["entry_count"] > r["exit_count"] else "OUTSIDE",
                "lastEvent":   r["last_event"],
                "lastSeen":    r["last_seen"],
            }
            for r in rows
        ]
        return jsonify({"movements": result, "total": len(result)}), 200
    except Exception as e:
        logging.error(f"[Movements] DB error: {e}")
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
#  Route: Detect image (unchanged core logic, wired to identity_store)
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/detect-image', methods=['POST'])
def detect_person_in_image():
    if model is None:
        return jsonify({"error": "YOLO model not initialized"}), 500
    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "Empty filename"}), 400

    try:
        temp_path = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(temp_path)

        results = model(temp_path, conf=CONF_THRESHOLD)
        person_count = 0
        person_detected = False
        confidence_scores = []
        faces_output = []

        frame_bgr = cv2.imread(temp_path) if mtcnn is not None else None
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB) if frame_bgr is not None else None
        img_h, img_w = (frame_bgr.shape[:2] if frame_bgr is not None else (0, 0))

        person_idx = 0
        for result in results:
            for box in result.boxes:
                if int(box.cls[0]) != 0:
                    continue
                person_detected = True
                person_count += 1
                confidence_scores.append(round(float(box.conf[0]), 4))

                x1_val, y1_val, x2_val, y2_val = map(int, box.xyxy[0].tolist())
                face_entry = {
                    "personIndex": person_idx,
                    "faceCount": 0,
                    "faces": [],
                    "bbox": {"x": x1_val, "y": y1_val, "width": x2_val - x1_val, "height": y2_val - y1_val},
                }

                if frame_rgb is not None:
                    pad = 10
                    x1c = max(0, x1_val - pad); y1c = max(0, y1_val - pad)
                    x2c = min(img_w, x2_val + pad); y2c = min(img_h, y2_val + pad)
                    person_crop = frame_rgb[y1c:y2c, x1c:x2c]

                    if person_crop.size > 0:
                        try:
                            f_boxes, f_probs = mtcnn.detect(person_crop)
                            if f_boxes is not None and f_probs is not None:
                                for fb, fp in zip(f_boxes, f_probs):
                                    if float(fp) >= FACE_CONF_THRESHOLD:
                                        fx1 = int(fb[0]) + x1c; fy1 = int(fb[1]) + y1c
                                        fx2 = int(fb[2]) + x1c; fy2 = int(fb[3]) + y1c
                                        face_img = frame_bgr[max(0, fy1):fy2, max(0, fx1):fx2]
                                        crop_path = None
                                        if face_img.size > 0:
                                            face_img_resized = cv2.resize(face_img, (224, 224))
                                            crop_filename = f"face_img_{person_idx}_{len(face_entry['faces'])}.jpg"
                                            crop_path = os.path.join(FACE_CROPS_DIR, crop_filename)
                                            cv2.imwrite(crop_path, face_img_resized)
                                        face_entry["faces"].append({
                                            "bbox": [fx1, fy1, fx2, fy2],
                                            "confidence": round(float(fp), 4),
                                            "cropPath": crop_path,
                                        })
                                face_entry["faceCount"] = len(face_entry["faces"])
                        except Exception as fe:
                            logging.warning(f"[detect-image] MTCNN error: {fe}")

                faces_output.append(face_entry)
                person_idx += 1

        _ts = int(__import__('time').time() * 1000)
        _img_key = f"uploads/images/{_ts}_{file.filename}"
        image_s3_url = uploader.upload_file(temp_path, _img_key) if uploader.available else None
        os.remove(temp_path)

        avg_confidence = round(sum(confidence_scores) / len(confidence_scores), 4) if confidence_scores else 0.0
        total_faces = sum(f["faceCount"] for f in faces_output)

        # Deduplicate using embedder
        unique_identities = total_faces
        if embedder is not None and embedder.available:
            emb_pairs = []
            face_keys = []
            for p_entry in faces_output:
                for f_idx, face in enumerate(p_entry["faces"]):
                    key = f"{p_entry['personIndex']}_{f_idx}"
                    emb = embedder.get_embedding_from_path(face.get("cropPath"))
                    emb_pairs.append((key, emb))
                    face_keys.append((p_entry["personIndex"], f_idx))

            identity_map = embedder.deduplicate(emb_pairs) if emb_pairs else {}

            for (p_idx, f_idx), (key, _) in zip(face_keys, emb_pairs):
                iid = identity_map.get(key, None)
                faces_output[p_idx]["faces"][f_idx]["identityId"] = iid
                # Also register in persistent store
                if iid and identity_store:
                    crop_path = faces_output[p_idx]["faces"][f_idx].get("cropPath")
                    if crop_path and os.path.exists(crop_path):
                        face_bgr = cv2.imread(crop_path)
                        if daily_logger:
                            daily_logger.log_appearance(iid)

            unique_identities = len(set(identity_map.values()))

        face_s3_urls = []
        if uploader.available:
            for p_entry in faces_output:
                for face in p_entry["faces"]:
                    crop_path = face.get("cropPath")
                    iid = face.get("identityId", "unknown")
                    if crop_path and os.path.exists(crop_path):
                        crop_key = f"uploads/faces/{iid}/{_ts}_{os.path.basename(crop_path)}"
                        url = uploader.upload_file(crop_path, crop_key)
                        if url:
                            face["s3CropUrl"] = url
                            face_s3_urls.append({"identityId": iid, "url": url})

        return jsonify({
            "personDetected":  person_detected,
            "personCount":     person_count,
            "averageConfidence": avg_confidence,
            "confidenceScores":  confidence_scores,
            "facesDetected":   total_faces,
            "uniqueIdentities": unique_identities,
            "imageS3Url":      image_s3_url,
            "faceS3Urls":      face_s3_urls,
            "faces":           faces_output,
        }), 200

    except Exception as e:
        logging.error(f"[detect-image] Error: {e}")
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
#  Route: Detect video (unchanged — kept intact)
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/detect-video', methods=['POST'])
def detect_person_in_video():
    if model is None:
        return jsonify({"error": "YOLO model not initialized"}), 500
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided"}), 400

    file = request.files['video']
    if file.filename == '':
        return jsonify({"error": "Empty filename"}), 400

    try:
        temp_path = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(temp_path)
        timestamp_vid = int(__import__('time').time() * 1000)
        video_s3_url = None

        results = model.track(
            temp_path, tracker="bytetrack.yaml", persist=True,
            conf=CONF_THRESHOLD, iou=0.5, classes=[0], stream=True,
        )

        person_tracker = {}
        frame_index = 0

        for result in results:
            frame_index += 1
            if result.boxes is None or result.boxes.id is None:
                continue

            ids_in_frame = result.boxes.id.int().tolist()
            confs_in_frame = result.boxes.conf.tolist()
            id_conf_pairs = list(zip(ids_in_frame, confs_in_frame))

            for track_id, conf in id_conf_pairs:
                if track_id not in person_tracker:
                    person_tracker[track_id] = {
                        "frameCount": 1, "confSum": float(conf),
                        "reentries": 0, "lastSeenFrame": frame_index,
                        "bestFaceConf": 0.0, "faceCount": 0,
                    }
                else:
                    entry = person_tracker[track_id]
                    if frame_index - entry["lastSeenFrame"] > 5:
                        entry["reentries"] += 1
                    entry["frameCount"] += 1
                    entry["confSum"] += float(conf)
                    entry["lastSeenFrame"] = frame_index

            if mtcnn is not None and frame_index % FACE_SAMPLE_EVERY == 0:
                try:
                    frame_rgb = cv2.cvtColor(result.orig_img, cv2.COLOR_BGR2RGB)
                    img_h, img_w = frame_rgb.shape[:2]
                    for idx, (track_id, conf) in enumerate(id_conf_pairs):
                        if track_id not in person_tracker:
                            continue
                        x1, y1, x2, y2 = map(int, result.boxes.xyxy[idx].tolist())
                        pad = 10
                        x1c = max(0, x1-pad); y1c = max(0, y1-pad)
                        x2c = min(img_w, x2+pad); y2c = min(img_h, y2+pad)
                        person_crop = frame_rgb[y1c:y2c, x1c:x2c]
                        if person_crop.size == 0:
                            continue
                        f_boxes, f_probs = mtcnn.detect(person_crop)
                        if f_boxes is not None and f_probs is not None:
                            valid = [fp for fp in f_probs if float(fp) >= FACE_CONF_THRESHOLD]
                            if valid:
                                best_conf = max(float(p) for p in valid)
                                entry = person_tracker[track_id]
                                if best_conf > entry["bestFaceConf"]:
                                    entry["bestFaceConf"] = round(best_conf, 4)
                                    entry["faceCount"] = len(valid)
                                    face_crop_bgr = cv2.cvtColor(person_crop, cv2.COLOR_RGB2BGR)
                                    face_crop_resized = cv2.resize(face_crop_bgr, (224, 224))
                                    crop_filename = f"face_video_id{track_id}_f{frame_index}.jpg"
                                    crop_path = os.path.join(FACE_CROPS_DIR, crop_filename)
                                    cv2.imwrite(crop_path, face_crop_resized)
                                    entry["bestCropPath"] = crop_path
                except Exception as fe:
                    logging.warning(f"[detect-video] MTCNN error frame {frame_index}: {fe}")

        if uploader.available:
            video_key = f"uploads/videos/{timestamp_vid}_{file.filename}"
            video_s3_url = uploader.upload_file(temp_path, video_key)

        os.remove(temp_path)

        min_frames_required = max(3, int(frame_index * 0.03))
        real_people = {tid: d for tid, d in person_tracker.items() if d["frameCount"] >= min_frames_required}
        person_count = len(real_people)

        for data in real_people.values():
            data["avgConfidence"] = round(data["confSum"] / data["frameCount"], 4)

        global_avg_conf = round(
            sum(d["avgConfidence"] for d in real_people.values()) / person_count, 4
        ) if person_count > 0 else 0.0

        people_summary = [
            {
                "id": tid, "framesAppeared": data["frameCount"],
                "avgConfidence": data["avgConfidence"],
                "faceCount": data.get("faceCount", 0),
                "bestFaceConf": data.get("bestFaceConf", 0.0),
                "bestCropPath": data.get("bestCropPath", None),
                "reentries": data["reentries"],
                "lastSeenFrame": data["lastSeenFrame"],
            }
            for tid, data in sorted(real_people.items())
        ]

        total_faces_video = sum(d.get("faceCount", 0) for d in real_people.values())

        if embedder is not None and embedder.available:
            emb_pairs_video = [
                (tid, embedder.get_embedding_from_path(data.get("bestCropPath")))
                for tid, data in sorted(real_people.items())
            ]
            identity_map_video = embedder.deduplicate(emb_pairs_video)
            for entry in people_summary:
                entry["identityId"] = identity_map_video.get(entry["id"])
                # Log in daily tracker
                iid = entry["identityId"]
                if iid and daily_logger:
                    daily_logger.log_appearance(iid)
            unique_identities_video = len(set(identity_map_video.values()))
        else:
            unique_identities_video = person_count
            for entry in people_summary:
                entry["identityId"] = f"id_{entry['id']:03d}"

        face_s3_urls_video = []
        if uploader.available:
            for entry in people_summary:
                crop_path = entry.get("bestCropPath")
                iid = entry.get("identityId", f"id_{entry['id']:03d}")
                if crop_path and os.path.exists(crop_path):
                    crop_key = f"uploads/faces/{iid}/{timestamp_vid}_best.jpg"
                    url = uploader.upload_file(crop_path, crop_key)
                    if url:
                        entry["s3CropUrl"] = url
                        face_s3_urls_video.append({"identityId": iid, "url": url})

        return jsonify({
            "personDetected":    person_count > 0,
            "personCount":       person_count,
            "uniquePeople":      person_count,
            "averageConfidence": global_avg_conf,
            "facesDetected":     total_faces_video,
            "uniqueIdentities":  unique_identities_video,
            "videoS3Url":        video_s3_url,
            "faceS3Urls":        face_s3_urls_video,
            "totalFrames":       frame_index,
            "people":            people_summary,
        }), 200

    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        logging.error(f"[detect-video] Error: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    logging.info("Starting VisionVault AI service on port 5002...")
    app.run(host='0.0.0.0', port=5002, debug=False)
