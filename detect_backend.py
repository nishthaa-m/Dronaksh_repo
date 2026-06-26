#!/usr/bin/env python3
"""
Dronaksh AI Swarm Surveillance System - Python Backend Pipeline
--------------------------------------------------------------
This script demonstrates how to integrate physical/simulated drone camera streams
with a YOLOv8 threat detection model and push alerts directly to the web dashboard.

Dependencies:
    pip install opencv-python Flask flask-cors ultralytics numpy

Usage:
    python detect_backend.py
"""

import cv2
import json
import time
import os
import numpy as np
from threading import Thread, Lock
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from werkzeug.utils import secure_filename

# Optional: Import YOLOv8 from Ultralytics if installed
try:
    from ultralytics import YOLO
    HAS_YOLO = True
except ImportError:
    HAS_YOLO = False
    print("[INFO] Ultralytics YOLO package not found. Running in SIMULATED INFERENCE mode.")

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing for dashboard frontend connection

UPLOAD_FOLDER = './models'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Global state to cache the latest detections and loaded model details
latest_detections = {
    "system_active": True,
    "uptime_seconds": 0,
    "active_alerts": []
}

# Thread locks
model_lock = Lock()
frame_lock = Lock()

# Global variables for model and streaming frames
model = None
latest_frame_bytes = None
active_model_name = "yolov8n.pt (default)"

# --- AI INFERENCE ENGINE WORKER ---
def inference_worker():
    global latest_detections, model, latest_frame_bytes, active_model_name
    
    print("[INIT] Loading YOLOv8 threat model...")
    if HAS_YOLO:
        try:
            # Load weapon/violence custom weights or nano weights as fallback
            with model_lock:
                model = YOLO("yolov8n.pt") 
            print("[SUCCESS] YOLOv8 Model loaded successfully.")
        except Exception as e:
            print(f"[ERROR] Failed to load model weights: {e}. Fallback to simulated mode.")
            model = None

    # OpenCV video capture (0 = Default Webcam, or replace with RTSP drone stream link)
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[WARNING] OpenCV could not open camera/video capture source. Simulating crowd frames.")
        
    start_time = time.time()
    
    # Simulation state variables for fallback crowd frames
    sim_people = [
        {"x": 100, "y": 200, "dx": 0.8, "dy": 0.4},
        {"x": 200, "y": 300, "dx": -0.6, "dy": 0.5},
        {"x": 350, "y": 150, "dx": 0.5, "dy": -0.8},
        {"x": 420, "y": 280, "dx": -0.4, "dy": -0.3},
        {"x": 180, "y": 120, "dx": 0.7, "dy": -0.5},
        {"x": 500, "y": 350, "dx": -0.5, "dy": 0.6}
    ]
    
    while True:
        current_time = time.time()
        latest_detections["uptime_seconds"] = int(current_time - start_time)
        alerts_queue = []
        
        # Read from camera if available
        frame = None
        ret = False
        if cap.isOpened():
            ret, frame = cap.read()
            if ret:
                frame = cv2.resize(frame, (640, 480))
            else:
                # Loop video file if reader reaches end
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        
        # If camera read failed or not opened, generate a beautiful simulated crowd view
        if frame is None:
            # Create dark high-tech control room style feed (dark blue background)
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            frame[:, :] = [20, 14, 8]  # BGR Dark Slate Blue
            
            # Draw grid lines
            for x in range(0, 640, 40):
                cv2.line(frame, (x, 0), (x, 480), (32, 24, 15), 1)
            for y in range(0, 480, 40):
                cv2.line(frame, (0, y), (640, y), (32, 24, 15), 1)
                
            # Draw venue outlines on mock feed (Stage, Gate 1, fences)
            cv2.rectangle(frame, (400, 300), (620, 460), (38, 30, 20), -1)  # Building block
            cv2.rectangle(frame, (400, 300), (620, 460), (50, 40, 30), 2)
            cv2.putText(frame, "STAGE ZONE", (420, 330), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (100, 90, 80), 1)
            
            # Update and draw simulated people blobs
            t_mod = int(current_time - start_time) % 35
            is_active_sim_threat = (t_mod < 6)
            
            for idx, person in enumerate(sim_people):
                # Update positions with boundaries
                person["x"] += person["dx"]
                person["y"] += person["dy"]
                if person["x"] < 50 or person["x"] > 590: person["dx"] *= -1
                if person["y"] < 50 or person["y"] > 430: person["dy"] *= -1
                
                px, py = int(person["x"]), int(person["y"])
                
                # Draw person head and body contour
                cv2.circle(frame, (px, py), 6, (180, 140, 60), -1) # Head
                cv2.circle(frame, (px, py + 14), 10, (140, 100, 40), -1) # Body
                
                # Draw standard detection bounding boxes
                # Person 3 gets weapon detection when alert is active
                if idx == 2 and is_active_sim_threat:
                    # Draw a flashing critical red box
                    box_color = (0, 0, 255) if int(current_time * 5) % 2 == 0 else (0, 0, 180)
                    cv2.rectangle(frame, (px - 25, py - 12), (px + 25, py + 30), box_color, 2)
                    cv2.putText(frame, "Weapon Detected (91%)", (px - 45, py - 20), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, box_color, 2)
                else:
                    # Normal green bounding box
                    cv2.rectangle(frame, (px - 20, py - 10), (px + 20, py + 25), (0, 180, 0), 1)
                    cv2.putText(frame, f"Person {idx+1}", (px - 20, py - 18), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 180, 0), 1)
        
        # If real camera is open, run YOLO inference
        if ret and frame is not None:
            with model_lock:
                active_model = model
            
            if active_model is not None:
                results = active_model(frame, conf=0.55, verbose=False)
                for r in results:
                    boxes = r.boxes
                    for box in boxes:
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        conf = float(box.conf[0])
                        cls_id = int(box.cls[0])
                        label = active_model.names[cls_id]
                        
                        # Bounding box coordinates
                        bx1, by1, bx2, by2 = int(x1), int(y1), int(x2), int(y2)
                        
                        is_threat = False
                        threat_type = ""
                        threat_level = "warning"
                        box_color = (0, 165, 255)  # Orange for warning
                        
                        if label in ["knife", "scissors", "baseball bat"]:
                            is_threat = True
                            threat_type = "Weapon Detected"
                            threat_level = "critical"
                            box_color = (0, 0, 255)  # Red
                        elif label in ["handbag", "suitcase", "backpack"]:
                            is_threat = True
                            threat_type = "Suspicious Object"
                            threat_level = "warning"
                            box_color = (0, 165, 255) # Orange
                            
                        # Draw box on frame
                        cv2.rectangle(frame, (bx1, by1), (bx2, by2), box_color, 2)
                        cv2.putText(frame, f"{label} {int(conf * 100)}%", (bx1, max(20, by1 - 10)), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2)
                        
                        if is_threat:
                            alerts_queue.append({
                                "id": f"TR-{int(current_time) % 10000}",
                                "type": threat_type,
                                "level": threat_level,
                                "drone": "Charlie", # Feed from Charlie (Drone 3)
                                "confidence": f"{int(conf * 100)}%",
                                "coordinates": "12.9708, 77.5932",
                                "zone": "Food Court West",
                                "rawCoords": {
                                    "x": int((bx1 + bx2) / 2),
                                    "y": int((by1 + by2) / 2)
                                },
                                "message": f"AI flagged object '{label}' in feed frame."
                            })
            else:
                # Mock detection on live camera if YOLO is absent
                t_mod = int(current_time - start_time) % 35
                if t_mod < 6:
                    # Draw mock red bounding box in center of camera frame
                    cv2.rectangle(frame, (220, 140), (420, 340), (0, 0, 255), 2)
                    cv2.putText(frame, "Weapon Detected (Mock 88%)", (220, 125), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
        
        # Add mock threat to alerts list if simulating
        if not cap.isOpened() and len(alerts_queue) == 0:
            t_mod = int(current_time - start_time) % 35
            if t_mod < 6:
                alerts_queue.append({
                    "id": "TR-9801",
                    "type": "Weapon Detected",
                    "level": "critical",
                    "drone": "Charlie",
                    "confidence": "91%",
                    "coordinates": "12.9708, 77.5932",
                    "zone": "Food Court West",
                    "rawCoords": {"x": 350, "y": 180},
                    "message": "Potential firearm detected via YOLOv8 model classification."
                })
        
        # Overlay HUD on streaming frames
        cv2.putText(frame, "LIVE SURVEILLANCE FEED", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"MODEL: {active_model_name.upper()}", (15, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 180, 255), 1)
        
        # Add blinking REC indicator
        rec_color = (0, 0, 255) if int(current_time) % 2 == 0 else (128, 128, 128)
        cv2.circle(frame, (620, 25), 5, rec_color, -1)
        cv2.putText(frame, "REC", (585, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
        
        latest_detections["active_alerts"] = alerts_queue
        
        # Compress the frame to JPEG bytes for MJPEG streaming
        ret_j, jpeg = cv2.imencode('.jpg', frame)
        if ret_j:
            with frame_lock:
                latest_frame_bytes = jpeg.tobytes()
                
        time.sleep(0.06)  # Approx 15 FPS

# --- FLASK HTTP API ENDPOINTS ---
@app.route("/api/threats", methods=["GET"])
def get_threats():
    """Returns the list of active threat alerts detected by the AI pipeline."""
    return jsonify(latest_detections)

@app.route("/api/inject_threat", methods=["POST"])
def inject_threat():
    """Allows external scripts to push mock alerts directly to the dashboard."""
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "No JSON payload provided"}), 400
        
    latest_detections["active_alerts"].append({
        "id": f"TR-{int(time.time()) % 10000}",
        "type": data.get("type", "Suspicious Object"),
        "level": data.get("level", "warning"),
        "drone": data.get("drone", "Charlie"),
        "confidence": data.get("confidence", "88%"),
        "coordinates": data.get("coordinates", "12.9708, 77.5932"),
        "zone": data.get("zone", "Food Court West"),
        "rawCoords": {"x": 350, "y": 200},
        "message": data.get("message", "Manual API Injection Alert.")
    })
    return jsonify({"status": "success", "message": "Threat alert injected."})

@app.route("/api/video_feed")
def video_feed():
    """Multipart video feed stream handler (MJPEG format)."""
    def generate():
        while True:
            with frame_lock:
                frame_data = latest_frame_bytes
            
            if frame_data is not None:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_data + b'\r\n')
            time.sleep(0.06)
            
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route("/api/model_info", methods=["GET"])
def model_info():
    """Returns active model settings and metadata."""
    global model, active_model_name
    with model_lock:
        yolo_active = (model is not None)
        
    return jsonify({
        "active_model": active_model_name,
        "yolo_active": yolo_active,
        "framework": "Ultralytics YOLOv8" if HAS_YOLO else "Simulated CV Inference",
        "classes": list(model.names.values()) if (HAS_YOLO and model) else ["person", "weapon", "smoke", "backpack", "handbag"],
        "device": "GPU (CUDA)" if (HAS_YOLO and model and hasattr(model, "device") and "cuda" in str(model.device)) else "CPU (Simulated)",
        "inference_latency_ms": 14 if HAS_YOLO else 4,
        "loaded_at": time.strftime("%Y-%m-%d %H:%M:%S")
    })

@app.route("/api/upload_model", methods=["POST"])
def upload_model():
    """Endpoint for uploading custom YOLO .pt weights."""
    global model, active_model_name
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "No file part in the request"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"status": "error", "message": "No file selected for uploading"}), 400
        
    if file and (file.filename.endswith('.pt') or file.filename.endswith('.weights')):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            with model_lock:
                if HAS_YOLO:
                    # Attempt to reload model weights
                    model = YOLO(filepath)
                    active_model_name = filename
                    print(f"[SUCCESS] Model reloaded with weights: {filepath}")
                else:
                    # Simulated reload if YOLO is missing (for local UI testing)
                    active_model_name = f"{filename} (Simulated)"
                    print(f"[SIMULATED] Saved weights file: {filename}")
            
            return jsonify({
                "status": "success",
                "message": f"Successfully uploaded and loaded model weights: {filename}",
                "model_name": active_model_name,
                "framework": "Ultralytics YOLOv8" if HAS_YOLO else "Simulated CV Inference"
            })
        except Exception as e:
            return jsonify({"status": "error", "message": f"Failed to parse or load weights file: {str(e)}"}), 500
            
    return jsonify({"status": "error", "message": "Unsupported file format. Only .pt weights allowed."}), 400

if __name__ == "__main__":
    # Start inference loop in background thread
    t = Thread(target=inference_worker)
    t.daemon = True
    t.start()
    
    # Run Flask server on port 5000
    print("\n" + "="*60)
    print("Dronaksh AI Live Stream Backend active and hosting endpoints:")
    print(" -> GET  http://localhost:5000/api/threats")
    print(" -> GET  http://localhost:5000/api/video_feed (MJPEG Stream)")
    print(" -> GET  http://localhost:5000/api/model_info")
    print(" -> POST http://localhost:5000/api/upload_model (File upload)")
    print("="*60 + "\n")
    
    app.run(host="0.0.0.0", port=5000, debug=False)
