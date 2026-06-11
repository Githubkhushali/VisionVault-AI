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
# pyrefly: ignore [missing-import]
from deepface import DeepFace
from ultralytics import YOLO

# Load face-specific YOLO model
face_model = YOLO("yolov8n-face.pt")

# In-memory identity registry tracking varying looks
live_identity_store = {}  # Structure: { identity_id: { "embeddings": [...], "count": int } }
# Entry-exit tracking per identity
movement_store = {}  
# Structure: { identity_id: { "entry_count": int, "exit_count": int, "last_y": float, "status": str, "name": str } }

BOUNDARY_Y = 0.5  # 50% of frame height (normalized) — adjust as needed
THRESHOLD = 0.68  # ArcFace cosine similarity threshold

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'backend', 'database.sqlite')

def cosine_similarity(a, b):
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (norm(a) * norm(b) + 1e-8))

def find_or_create_identity(embedding):
    best_id, best_score = None, -1.0
    for iid, data in live_identity_store.items():
        for stored in data["embeddings"]:
            s = cosine_similarity(embedding, stored)
            if s > best_score:
                best_score, best_id = s, iid

    if best_score >= THRESHOLD and best_id:
        entry = live_identity_store[best_id]
        entry["count"] += 1
        # If this is a slightly new look (e.g. wearing glasses), add it to their memory cluster
        if len(entry["embeddings"]) < 15:
            if all(cosine_similarity(embedding, e) < 0.92 for e in entry["embeddings"]):
                entry["embeddings"].append(embedding)
        return best_id, False, entry["count"]
    else:
        new_id = f"id_{uuid.uuid4().hex[:8]}"
        live_identity_store[new_id] = {"embeddings": [embedding], "count": 1}
        return new_id, True, 1

load_dotenv()

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def log_movement_event(identity_id, event_type):
    """Persist an ENTRY or EXIT event to database.sqlite"""
    try:
        conn = get_db()
        # Get current counts
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

        # Get name if registered
        name_row = conn.execute(
            "SELECT name FROM persons WHERE identity_id=?", (identity_id,)
        ).fetchone()
        person_name = name_row["name"] if name_row else "Unknown"

        conn.execute("""
            INSERT INTO movement_events (identity_id, person_name, event_type, entry_count, exit_count)
            VALUES (?,?,?,?,?)
        """, (identity_id, person_name, event_type, entry_count, exit_count))
        conn.commit()
        conn.close()
        logging.info(f"[Movement] {person_name} ({identity_id}) {event_type} — IN:{entry_count} OUT:{exit_count}")
        return entry_count, exit_count
    except Exception as e:
        logging.error(f"[Movement DB] Error logging event: {e}")
        return 0, 0

def get_movement_counts(identity_id):
    """Get latest entry/exit counts for an identity from DB"""
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
    """
    center_y_norm: center Y of bounding box divided by frame height (0.0 to 1.0)
    Crossing BOUNDARY_Y downward = ENTRY, upward = EXIT
    """
    if identity_id not in movement_store:
        movement_store[identity_id] = {
            "entry_count": 0,
            "exit_count": 0,
            "last_y": center_y_norm,
            "status": "UNKNOWN",
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

# Phase 3: MTCNN for face detection inside person bounding boxes
try:
    from facenet_pytorch import MTCNN
    import torch
    _MTCNN_AVAILABLE = True
except ImportError:
    _MTCNN_AVAILABLE = False
    logging.warning("[Phase 3] facenet_pytorch not available — face detection disabled.")

# Phase 5: Face embedding + identity deduplication
try:
    from embedder import FaceEmbedder
    _EMBEDDER_AVAILABLE = True
except ImportError:
    _EMBEDDER_AVAILABLE = False
    logging.warning("[Phase 5] embedder.py not found — identity deduplication disabled.")

# Initialize Flask App and configure logging
app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ── Phase 1: Upgraded to YOLOv8m for higher accuracy ────────────────────────
# yolov8m has ~25.9M params vs 3.2M in yolov8n — significantly better at
# detecting partially-occluded or distant people.
MODEL_NAME = "yolov8m.pt"
CONF_THRESHOLD = 0.75   # Phase 1: hard minimum confidence — ignore noisy detections

logging.info(f"Loading {MODEL_NAME} model...")
try:
    model = YOLO(MODEL_NAME)
    logging.info(f"{MODEL_NAME} model loaded successfully.")
except Exception as e:
    logging.error(f"Failed to load YOLO model: {e}")
    model = None

# ── Phase 3: Load MTCNN face detector at startup ─────────────────────────────
# MTCNN is a multi-scale face detector. We use keep_all=True to get every face
# in a crop, and min_face_size=20 to catch even small faces.
if _MTCNN_AVAILABLE:
    try:
        mtcnn = MTCNN(
            keep_all=True,
            device='cpu',
            min_face_size=20,   # smallest face we accept (pixels)
            thresholds=[0.6, 0.7, 0.8],  # P/R/O net thresholds
        )
        logging.info("[Phase 3] MTCNN face detector loaded successfully.")
    except Exception as e:
        logging.error(f"[Phase 3] Failed to load MTCNN: {e}")
        mtcnn = None
else:
    mtcnn = None

FACE_CONF_THRESHOLD = 0.90   # Minimum MTCNN probability to count as a real face
FACE_SAMPLE_EVERY = 10       # For video: run face detection every Nth frame

# ── Phase 5: Load face embedder at startup ────────────────────────────────────
if _EMBEDDER_AVAILABLE:
    embedder = FaceEmbedder()  # loads InceptionResnetV1(vggface2) once
else:
    embedder = None

# Ensure a temporary directory exists for incoming uploads
UPLOAD_FOLDER = 'temp_uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
FACE_CROPS_DIR = 'face_crops'
os.makedirs(FACE_CROPS_DIR, exist_ok=True)

uploader = S3Uploader()  # Phase 6: credentials loaded from .env via load_dotenv()


@app.route('/register-name', methods=['POST'])
def register_name():
    data = request.json
    identity_id = data.get("identityId")
    name = data.get("name")
    if not identity_id or not name:
        return jsonify({"error": "identityId and name required"}), 400

    # Save to in-memory store
    if identity_id not in movement_store:
        movement_store[identity_id] = {
            "entry_count": 0, "exit_count": 0,
            "last_y": 0.5, "status": "UNKNOWN", "name": name
        }
    else:
        movement_store[identity_id]["name"] = name

    # Persist to database.sqlite
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

    return jsonify({"success": True, "identityId": identity_id, "name": name}), 200



@app.route('/detect-image', methods=['POST'])
def detect_person_in_image():
    if model is None:
        return jsonify({"error": "YOLO model is not initialized."}), 500

    if 'image' not in request.files:
        logging.warning("No image part in the request.")
        return jsonify({"error": "No image file provided in the request. Use key 'image'."}), 400

    file = request.files['image']

    if file.filename == '':
        logging.warning("No file selected.")
        return jsonify({"error": "Empty filename provided."}), 400

    try:
        # Save the uploaded file temporarily for YOLO to read
        temp_path = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(temp_path)
        logging.info(f"Processing image: {file.filename}")

        # Run YOLO detection — conf=CONF_THRESHOLD filters out low-quality hits
        results = model(temp_path, conf=CONF_THRESHOLD)
        
        person_count = 0
        person_detected = False
        confidence_scores = []  # Phase 2: accumulate per-person confidence
        faces_output = []       # Phase 3: per-person face detections

        # Phase 3: load the image once for MTCNN cropping
        frame_bgr = cv2.imread(temp_path) if mtcnn is not None else None
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB) if frame_bgr is not None else None
        img_h, img_w = (frame_bgr.shape[:2] if frame_bgr is not None else (0, 0))

        # Parse YOLO results to count people (class_id == 0)
        person_idx = 0
        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                if class_id == 0:
                    person_detected = True
                    person_count += 1
                    confidence_scores.append(round(float(box.conf[0]), 4))

                    # Phase 3: crop person region and run MTCNN face detection
                    x1_val, y1_val, x2_val, y2_val = map(int, box.xyxy[0].tolist())
                    face_entry = {
                        "personIndex": person_idx, 
                        "faceCount": 0, 
                        "faces": [],
                        "bbox": {
                            "x": x1_val,
                            "y": y1_val,
                            "width": x2_val - x1_val,
                            "height": y2_val - y1_val
                        }
                    }
                    if frame_rgb is not None:
                        x1, y1, x2, y2 = x1_val, y1_val, x2_val, y2_val
                        # Add small padding without going out of bounds
                        pad = 10
                        x1c = max(0, x1 - pad); y1c = max(0, y1 - pad)
                        x2c = min(img_w, x2 + pad); y2c = min(img_h, y2 + pad)
                        person_crop = frame_rgb[y1c:y2c, x1c:x2c]

                        if person_crop.size > 0:
                            try:
                                f_boxes, f_probs = mtcnn.detect(person_crop)
                                if f_boxes is not None and f_probs is not None:
                                    for fb, fp in zip(f_boxes, f_probs):
                                        if float(fp) >= FACE_CONF_THRESHOLD:
                                            # Convert face coords back to original image space
                                            fx1 = int(fb[0]) + x1c; fy1 = int(fb[1]) + y1c
                                            fx2 = int(fb[2]) + x1c; fy2 = int(fb[3]) + y1c

                                            # Phase 4: save this face crop as a 224×224 JPEG
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
                                                "cropPath": crop_path,   # Phase 4
                                            })
                                    face_entry["faceCount"] = len(face_entry["faces"])
                            except Exception as fe:
                                logging.warning(f"[Phase 3] MTCNN error on person {person_idx}: {fe}")

                    faces_output.append(face_entry)
                    person_idx += 1

        # Phase 6: upload original image BEFORE deleting the temp file
        _ts = int(__import__('time').time() * 1000)
        _img_key = f"uploads/images/{_ts}_{file.filename}"
        image_s3_url = uploader.upload_file(temp_path, _img_key) if uploader.available else None

        # Clean up the temporary file
        os.remove(temp_path)

        avg_confidence = round(sum(confidence_scores) / len(confidence_scores), 4) if confidence_scores else 0.0
        total_faces = sum(f["faceCount"] for f in faces_output)

        # Phase 5: assign identityIds to each detected face via embedding deduplication
        if embedder is not None and embedder.available:
            # Collect (face_key, embedding) pairs across all people and faces
            face_keys = []  # (person_idx, face_idx)
            emb_pairs = []  # (face_key_str, embedding)
            for p_entry in faces_output:
                for f_idx, face in enumerate(p_entry["faces"]):
                    key = f"{p_entry['personIndex']}_{f_idx}"
                    emb = embedder.get_embedding_from_path(face.get("cropPath"))
                    emb_pairs.append((key, emb))
                    face_keys.append((p_entry["personIndex"], f_idx))

            identity_map = embedder.deduplicate(emb_pairs) if emb_pairs else {}

            # Write identityId back into each face dict
            for (p_idx, f_idx), (key, _) in zip(face_keys, emb_pairs):
                faces_output[p_idx]["faces"][f_idx]["identityId"] = identity_map.get(key, None)

            unique_identities = len(set(identity_map.values()))
        else:
            unique_identities = total_faces  # fallback: assume each face is unique

        # Phase 6: upload face crops to S3 (original image already uploaded as image_s3_url above)
        face_s3_urls = []

        if uploader.available:
            # Upload each face crop (original image already uploaded above as image_s3_url)
            for p_entry in faces_output:
                for face in p_entry["faces"]:
                    crop_path = face.get("cropPath")
                    identity_id = face.get("identityId", "unknown")
                    if crop_path and os.path.exists(crop_path):
                        crop_key = f"uploads/faces/{identity_id}/{_ts}_{os.path.basename(crop_path)}"
                        url = uploader.upload_file(crop_path, crop_key)
                        if url:
                            face["s3CropUrl"] = url          # Phase 6: attach URL to face
                            face_s3_urls.append({"identityId": identity_id, "url": url})

        # Build the final JSON response
        response = {
            "personDetected": person_detected,
            "personCount": person_count,
            "averageConfidence": avg_confidence,          # Phase 2
            "confidenceScores": confidence_scores,        # Phase 2: per-person scores
            "facesDetected": total_faces,                 # Phase 3
            "uniqueIdentities": unique_identities,        # Phase 5
            "imageS3Url": image_s3_url,                   # Phase 6
            "faceS3Urls": face_s3_urls,                   # Phase 6
            "faces": faces_output,                        # Phase 3/5/6: per-person face detail
        }
        
        logging.info(
            f"Detection successful: {person_count} people, {total_faces} faces, "
            f"{unique_identities} unique identities, avg conf {avg_confidence}"
        )
        return jsonify(response), 200

    except Exception as e:
        # Error Handling: Catch unexpected errors during processing
        logging.error(f"Error during detection: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/detect-video', methods=['POST'])
def detect_person_in_video():
    if model is None:
        return jsonify({"error": "YOLO model is not initialized."}), 500

    if 'video' not in request.files:
        logging.warning("No video part in the request.")
        return jsonify({"error": "No video file provided in the request. Use key 'video'."}), 400

    file = request.files['video']

    if file.filename == '':
        logging.warning("No file selected.")
        return jsonify({"error": "Empty filename provided."}), 400

    try:
        temp_path = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(temp_path)
        logging.info(f"Processing video: {file.filename}")
        timestamp_vid = int(__import__('time').time() * 1000)
        video_s3_url = None

        # Use YOLO's 'track' mode with a custom ByteTrack config.
        # - tracker="bytetrack.yaml": tuned config to prevent ghost/zombie track IDs.
        # - conf=CONF_THRESHOLD (0.75): matches the image endpoint threshold.
        # - iou=0.5: standard NMS IoU threshold.
        # - classes=[0]: only detect people (class 0).
        # - stream=True: memory-efficient streaming for long videos.
        results = model.track(
            temp_path,
            tracker="bytetrack.yaml",
            persist=True,
            conf=CONF_THRESHOLD,
            iou=0.5,
            classes=[0],
            stream=True,
        )

        # person_tracker dict structure (Phase 2 extended):
        # {
        #   track_id: {
        #     "frameCount":    int,    # total frames this person appeared in
        #     "confSum":       float,  # Phase 2: running sum of confidence scores
        #     "reentries":     int,    # how many times they left & came back
        #     "lastSeenFrame": int     # last frame index they were detected
        #   }
        # }
        person_tracker = {}
        frame_index = 0

        # Iterate through every frame processed by the tracker
        for result in results:
            frame_index += 1
            if result.boxes is None or result.boxes.id is None:
                continue

            ids_in_this_frame = result.boxes.id.int().tolist()
            # Phase 2: pair each track ID with its detection confidence
            confs_in_this_frame = result.boxes.conf.tolist()
            id_conf_pairs = list(zip(ids_in_this_frame, confs_in_this_frame))

            for track_id, conf in id_conf_pairs:
                if track_id not in person_tracker:
                    # Brand new person detected for the first time
                    person_tracker[track_id] = {
                        "frameCount": 1,
                        "confSum": float(conf),   # Phase 2
                        "reentries": 0,
                        "lastSeenFrame": frame_index,
                        "bestFaceConf": 0.0,      # Phase 3: highest face detection conf seen
                        "faceCount": 0,           # Phase 3: faces visible at best frame
                    }
                    logging.info(f"[Tracker] New person ID {track_id} appeared at frame {frame_index} (conf={conf:.3f}).")
                else:
                    entry = person_tracker[track_id]
                    prev_frame = entry["lastSeenFrame"]

                    # If there was a gap of >5 frames since we last saw them,
                    # it means they left the frame and came back — count as re-entry.
                    if frame_index - prev_frame > 5:
                        entry["reentries"] += 1
                        logging.info(
                            f"[Tracker] Person ID {track_id} re-entered at frame {frame_index} "
                            f"(was last seen at frame {prev_frame}). Re-entry #{entry['reentries']}."
                        )

                    # Always increment frame counter and update last seen frame.
                    entry["frameCount"] += 1
                    entry["confSum"] += float(conf)   # Phase 2: accumulate confidence
                    entry["lastSeenFrame"] = frame_index
            # Phase 3: face detection on sampled frames (every FACE_SAMPLE_EVERY frames)
            if mtcnn is not None and frame_index % FACE_SAMPLE_EVERY == 0:
                try:
                    frame_rgb = cv2.cvtColor(result.orig_img, cv2.COLOR_BGR2RGB)
                    img_h, img_w = frame_rgb.shape[:2]

                    for idx, (track_id, conf) in enumerate(id_conf_pairs):
                        if track_id not in person_tracker:
                            continue
                        # Crop person bounding box from the frame
                        x1, y1, x2, y2 = map(int, result.boxes.xyxy[idx].tolist())
                        pad = 10
                        x1c = max(0, x1 - pad); y1c = max(0, y1 - pad)
                        x2c = min(img_w, x2 + pad); y2c = min(img_h, y2 + pad)
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
                                    # Phase 4: save the best person crop as a 224×224 JPEG
                                    face_crop_bgr = cv2.cvtColor(person_crop, cv2.COLOR_RGB2BGR)
                                    face_crop_resized = cv2.resize(face_crop_bgr, (224, 224))
                                    crop_filename = f"face_video_id{track_id}_f{frame_index}.jpg"
                                    crop_path = os.path.join(FACE_CROPS_DIR, crop_filename)
                                    cv2.imwrite(crop_path, face_crop_resized)
                                    entry["bestCropPath"] = crop_path   # Phase 4
                except Exception as fe:
                    logging.warning(f"[Phase 3] MTCNN video frame {frame_index} error: {fe}")

        # Phase 6: upload original video to S3 before deleting the temp file
        if uploader.available:
            video_key = f"uploads/videos/{timestamp_vid}_{file.filename}"
            logging.info(f"[Phase 6] Uploading video to S3: {video_key}...")
            video_s3_url = uploader.upload_file(temp_path, video_key)
            if video_s3_url:
                logging.info(f"[Phase 6] Video uploaded successfully: {video_s3_url}")
            else:
                logging.warning("[Phase 6] Video upload returned None.")
        else:
            logging.warning("[Phase 6] S3 uploader not available for video upload.")

        os.remove(temp_path)

        # ── Ghost-track filter ────────────────────────────────────────────────
        # Any track ID that only appeared in a tiny fraction of total frames is
        # almost certainly a ghost: a shadow, reflection, or partial detection
        # that briefly fooled the detector before disappearing.
        # Real people stay on screen for many frames; spurious detections flicker
        # for just 1-3 frames.
        #
        # Threshold: a track must appear in at least 3% of total frames OR
        # at least 3 absolute frames, whichever is larger.
        min_frames_required = max(3, int(frame_index * 0.03))
        real_people = {
            tid: data
            for tid, data in person_tracker.items()
            if data["frameCount"] >= min_frames_required
        }
        ghost_ids = set(person_tracker) - set(real_people)
        if ghost_ids:
            logging.info(
                f"[Filter] Removed {len(ghost_ids)} ghost track(s) {sorted(ghost_ids)} "
                f"(appeared in < {min_frames_required} frames). "
                f"Keeping {len(real_people)} real track(s)."
            )

        person_count = len(real_people)

        # Phase 2: compute per-person average confidence, then global average
        for data in real_people.values():
            data["avgConfidence"] = round(data["confSum"] / data["frameCount"], 4)

        global_avg_conf = round(
            sum(d["avgConfidence"] for d in real_people.values()) / person_count, 4
        ) if person_count > 0 else 0.0

        # Build a clean per-person summary list using only real (non-ghost) tracks
        people_summary = [
            {
                "id": tid,
                "framesAppeared": data["frameCount"],
                "avgConfidence": data["avgConfidence"],      # Phase 2
                "faceCount": data.get("faceCount", 0),      # Phase 3
                "bestFaceConf": data.get("bestFaceConf", 0.0),  # Phase 3
                "bestCropPath": data.get("bestCropPath", None), # Phase 4
                "bbox": data.get("bbox", None),
                "reentries": data["reentries"],
                "lastSeenFrame": data["lastSeenFrame"],
                
            }
            for tid, data in sorted(real_people.items())
        ]

        total_faces_video = sum(d.get("faceCount", 0) for d in real_people.values())

        # Phase 5: deduplicate across track IDs using face embeddings
        # Two different track IDs may belong to the same real person if tracking
        # lost them mid-video and reassigned a new ID.
        if embedder is not None and embedder.available:
            emb_pairs_video = [
                (tid, embedder.get_embedding_from_path(data.get("bestCropPath")))
                for tid, data in sorted(real_people.items())
            ]
            identity_map_video = embedder.deduplicate(emb_pairs_video)

            # Write identityId back into each person's summary entry
            for entry in people_summary:
                entry["identityId"] = identity_map_video.get(entry["id"])  # Phase 5

            unique_identities_video = len(set(identity_map_video.values()))
            logging.info(
                f"[Phase 5] {person_count} tracks → {unique_identities_video} unique identities."
            )
        else:
            unique_identities_video = person_count  # fallback
            for entry in people_summary:
                entry["identityId"] = f"id_{entry['id']:03d}"

        # Phase 6: upload all best face crops to S3 (original video uploaded above before deletion)
        face_s3_urls_video = []

        if uploader.available:
            # 1. Upload the original video (file was already deleted via os.remove(temp_path))
            # To upload the video, we need to save it before deletion. For now upload the crops.
            # (In a future pass we can refactor to upload before deletion.)

            # 2. Upload each person's best face crop
            for entry in people_summary:
                crop_path = entry.get("bestCropPath")
                identity_id = entry.get("identityId", f"id_{entry['id']:03d}")
                if crop_path and os.path.exists(crop_path):
                    crop_key = f"uploads/faces/{identity_id}/{timestamp_vid}_best.jpg"
                    url = uploader.upload_file(crop_path, crop_key)
                    if url:
                        entry["s3CropUrl"] = url          # Phase 6: attach to person summary
                        face_s3_urls_video.append({"identityId": identity_id, "url": url})

        response = {
            "personDetected": person_count > 0,
            "personCount": person_count,
            "uniquePeople": person_count,                  # Phase 2
            "averageConfidence": global_avg_conf,          # Phase 2
            "facesDetected": total_faces_video,            # Phase 3
            "uniqueIdentities": unique_identities_video,   # Phase 5
            "videoS3Url": video_s3_url,                    # Phase 6 (populated when video upload added)
            "faceS3Urls": face_s3_urls_video,              # Phase 6
            "totalFrames": frame_index,
            "people": people_summary,
        }

        logging.info(
            f"Video tracking complete. {person_count} tracks, "
            f"{unique_identities_video} unique identities, "
            f"avg confidence {global_avg_conf}, across {frame_index} frames."
        )
        return jsonify(response), 200

    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        logging.error(f"Error during video tracking: {e}")
        return jsonify({"error": str(e)}), 500


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
        
        # YOLO localizes the face bounding boxes
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
                
                crop_tmp = os.path.join(UPLOAD_FOLDER, f"crop_{uuid.uuid4().hex[:8]}.jpg")
                cv2.imwrite(crop_tmp, cv2.resize(face_crop, (224, 224)))
                
                identity_id, is_new, count = None, False, 0
                try:
                    # ArcFace handles structural vector fingerprinting
                    rep = DeepFace.represent(crop_tmp, model_name="ArcFace", detector_backend="skip", enforce_detection=False)
                    if rep:
                        identity_id, is_new, count = find_or_create_identity(rep[0]["embedding"])
                except Exception as e:
                    print(f"Embedding error: {e}")
                finally:
                    if os.path.exists(crop_tmp): os.remove(crop_tmp)
                
               # Entry-exit tracking
                movement = {}
                if identity_id:
                    center_y = (y1 + y2) / 2
                    center_y_norm = center_y / img_h
                    movement = track_movement(identity_id, center_y_norm, img_h)

                detections.append({
                    "bbox": {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
                    "confidence": round(float(box.conf[0]), 4),
                    "identityId": identity_id,
                    "isNew": is_new,
                    "count": count,
                    "name": movement.get("name", "Unknown"),
                    "entryCount": movement.get("entry_count", 0),
                    "exitCount": movement.get("exit_count", 0),
                    "status": movement.get("status", "UNKNOWN")
                })
                
        if os.path.exists(temp_path): os.remove(temp_path)
        return jsonify({"detections": detections, "frameDetections": len(detections)}), 200
    except Exception as e:
        if os.path.exists(temp_path): os.remove(temp_path)
        return jsonify({"error": str(e)}), 500





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
                "name": r["name"],
                "entryCount": r["entry_count"],
                "exitCount": r["exit_count"],
                "status": "INSIDE" if r["entry_count"] > r["exit_count"] else "OUTSIDE",
                "lastEvent": r["last_event"],
                "lastSeen": r["last_seen"]
            }
            for r in rows
        ]
        return jsonify({"movements": result, "total": len(result)}), 200
    except Exception as e:
        logging.error(f"[Movements] DB error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Start the Flask service on port 5002
    logging.info("Starting YOLO detection API on port 5002...")
    app.run(host='0.0.0.0', port=5002, debug=False)
