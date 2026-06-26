# Dronaksh: AI-Powered Swarm Drone Surveillance System (v3.0)

Dronaksh is a premium, real-time control room dashboard for swarm drone surveillance in massive crowd events. It integrates deep learning model detection pipelines (YOLOv8) with a high-fidelity frontend control panel, designed for event security operators and swarm technical directors.

---

## 🚀 Key Features in v3.0

### 1. Live YOLOv8 Video Streaming Feed
- **Flask MJPEG Streaming**: Direct integration with a Flask multipart video streaming backend (`/api/video_feed`).
- **Real-Time Bounding Boxes**: Displays live footage annotated with YOLOv8 bounding boxes for objects (like persons, luggage, backpacks, and weapons) directly from the active drone feed.
- **Robust Simulation Fallback**: If no physical camera/webcam is active, the Python backend generates a simulated crowd layout and overlays mock YOLO detections on a live video stream.

### 2. High-Fidelity Event Map & Crowd Particles
- **Venue Map Layout**: The Tactical Overlay canvas renders a schematic layout of the event grounds (Kumbh Mela Sector 4B), including entry gates, main plazas, food courts, and riverbank Bridges.
- **160+ Active Crowd Particles**: Simulates individual crowd members navigating walkways using paths in real time.
- **Panic & Stampede Dynamics**: When a threat is detected (e.g. Weapon Detected or Stampede Risk), crowd particles in that sector immediately turn red and scatter away from the threat center.
- **Drone Cones**: Drones patrol the sectors and projects real-time searchlight cones onto the map.

### 3. Incident Cross-Check & False Positive Control
- **Verification Desk**: Clicking any alert card opens a side-by-side **Incident Verification Modal**:
  - **Live AI Feed**: Direct annotated live stream from the drone's active camera.
  - **Sector Baseline Reference Canvas**: Displays an empty, calibrated baseline grid of the sector to compare structures.
  - **Verification Checklist**: A pre-action list (shadow check, shape matching, cooking smoke check) to ensure thorough validation.
  - **False Positive Classification**: Allows operators to dismiss alerts with specific reasons ("Cooking Smoke", "Replica/Toy Weapon", "Playful Dancing", "Camera Flare") to help retrain/refine model datasets.

### 4. Dynamic Model Swapping & Upload Centre
- **Live Weights Dropzone**: Drag-and-drop or upload custom YOLO `.pt` files directly from the dashboard configuration modal.
- **Thread-Safe Swapping**: The backend `/api/upload_model` endpoint saves the file, reloads YOLO thread-safely in the background, and updates active model parameters (active weights name, inference device, latency in ms, and classes detected).

---

## 🛠️ Installation & Setup

Ensure you have Python 3.8+ installed on your system.

### Step 1: Install Dependencies
```bash
pip install opencv-python Flask flask-cors ultralytics numpy
```

### Step 2: Start the Python AI Backend
```bash
python detect_backend.py
```
This runs the local Flask API and video streaming server on **[http://localhost:5000](http://localhost:5000)**. It will automatically download YOLOv8 nano weights (`yolov8n.pt`) on first run if they are not already cached.

### Step 3: Start the Web Dashboard Server
In a separate terminal shell:
```bash
# In the project directory
python -m http.server 8000
```
Open **[http://localhost:8000](http://localhost:8000)** in your web browser. 

The dashboard will detect the backend server on startup, connect automatically, and stream threats live from the camera pipeline!
