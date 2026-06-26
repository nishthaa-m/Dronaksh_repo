// ================================================================
// Dronaksh v3 — Swarm Drone Surveillance Control Room
// Complete application logic with live stream and crowd particles
// ================================================================

// ─── GLOBAL STATE ───────────────────────────────────────────────
const state = {
  audioMuted: false,
  lockdown: false,
  formation: 'perimeter',
  altitude: 30,
  simulationTime: 0,
  zoomedFeed: null,
  sirenCtx: null,

  // AI thresholds
  yoloThreshold: 65,
  resnetThreshold: 75,
  sirenEnabled: true,
  autoDispatch: false,

  // Backend integration state
  backendConnected: false,
  activeIncidentForVerify: null,

  // Drones — realistic callsigns and zones
  drones: [
    { id: 1, name: 'Alpha',   zone: 'Gate 1',     status: 'active', battery: 92, speed: 18, altitude: 30, latency: 12, gps: '12.9716°N, 77.5946°E', task: 'Patrol', x: 100, y: 80, targetX: 100, targetY: 80 },
    { id: 2, name: 'Bravo',   zone: 'Stage A',    status: 'active', battery: 87, speed: 20, altitude: 30, latency: 15, gps: '12.9725°N, 77.5958°E', task: 'Patrol', x: 480, y: 70, targetX: 480, targetY: 70 },
    { id: 3, name: 'Charlie', zone: 'Food Court',  status: 'active', battery: 74, speed: 22, altitude: 30, latency: 14, gps: '12.9708°N, 77.5932°E', task: 'Patrol', x: 420, y: 250, targetX: 420, targetY: 250 },
    { id: 4, name: 'Delta',   zone: 'Parking E',   status: 'active', battery: 96, speed: 19, altitude: 30, latency: 18, gps: '12.9731°N, 77.5925°E', task: 'Patrol', x: 80,  y: 240, targetX: 80,  targetY: 240 }
  ],

  // Live incidents (active queue)
  incidents: [],
  incidentIdCounter: 1000,

  // Historical audit log
  history: [
    { time: '09:12:34', drone: 'Charlie', type: 'Crowd Density Surge', confidence: 82, location: 'Food Court West', status: 'RESOLVED', action: 'Area Cordoned', level: 'warning' },
    { time: '09:45:17', drone: 'Alpha',   type: 'Unattended Baggage', confidence: 71, location: 'Gate 1 Queue',    status: 'DISMISSED', action: 'Operator Cleared: Staff Equipment', level: 'warning' },
    { time: '10:22:08', drone: 'Bravo',   type: 'Physical Altercation', confidence: 89, location: 'Stage A Pit',   status: 'RESOLVED', action: 'Security Deployed', level: 'critical' },
    { time: '11:03:55', drone: 'Delta',   type: 'Vehicle Breach',      confidence: 94, location: 'Parking E Gate', status: 'RESOLVED', action: 'Barrier Raised', level: 'critical' },
    { time: '11:38:22', drone: 'Alpha',   type: 'Smoke Detection',     confidence: 78, location: 'Gate 1 Food Stall', status: 'DISMISSED', action: 'False Positive: Cooking Smoke', level: 'warning' }
  ],

  // Stats
  totalIncidentsToday: 7,
  resolvedToday: 5,

  // Crowd nodes for heatmap & particle anchors
  crowdNodes: [
    { x: 140, y: 100, density: 50, label: 'Gate 1' },
    { x: 350, y: 80,  density: 60, label: 'Stage A' },
    { x: 380, y: 210, density: 45, label: 'Food Court' },
    { x: 130, y: 230, density: 30, label: 'Parking' },
    { x: 260, y: 155, density: 70, label: 'Main Plaza' }
  ],

  // Simulated Individual Crowd Particles (v3 Feature)
  crowdParticles: [],

  // Active threat marker on map
  threatMarker: null
};

// Threat type definitions for simulation
const THREAT_CATALOG = [
  { type: 'Weapon Detected',        level: 'critical', zone: 'Main Plaza',      weight: 1 },
  { type: 'Smoke / Fire Alert',     level: 'critical', zone: 'Food Court West', weight: 2 },
  { type: 'Physical Violence',      level: 'critical', zone: 'Stage A Pit',     weight: 2 },
  { type: 'Crowd Density Surge',    level: 'warning',  zone: 'Gate 1 Queue',    weight: 5 },
  { type: 'Stampede Risk Movement', level: 'critical', zone: 'Main Plaza',      weight: 2 },
  { type: 'Unattended Object',      level: 'warning',  zone: 'Parking E Gate',  weight: 4 },
  { type: 'Perimeter Breach',       level: 'warning',  zone: 'North Fence',     weight: 3 },
  { type: 'Suspicious Gathering',   level: 'info',     zone: 'VIP Lounge Area', weight: 4 }
];

// Live backend video stream image reference (v3 Feature)
const backendStreamImg = new Image();
backendStreamImg.crossOrigin = 'anonymous';

// ─── INITIALIZATION ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  startClock();
  initLog();
  initCrowdParticles();
  renderFleetCards();
  renderIncidents();
  updateSidebarFleet();
  updateTopbarStats();
  initCanvases();
  setupModelUploadDragDrop();

  // Simulation timers
  setInterval(simulateTelemetryTick, 3000);
  setInterval(simulateRandomIncident, 18000);
  initBackendPolling();

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
});

// ─── CLOCK ──────────────────────────────────────────────────────
function startClock() {
  const el = document.getElementById('live-clock');
  setInterval(() => {
    el.textContent = new Date().toTimeString().split(' ')[0];
    tickUptime();
  }, 1000);
}

let uptimeSec = 11662;
function tickUptime() {
  uptimeSec++;
  const h = String(Math.floor(uptimeSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((uptimeSec % 3600) / 60)).padStart(2, '0');
  const s = String(uptimeSec % 60).padStart(2, '0');
  const el = document.getElementById('sys-uptime');
  if (el) el.textContent = `${h}h ${m}m ${s}s`;
}

// ─── NAVIGATION & MODALS ────────────────────────────────────────
function switchView(view) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById('nav-liveops').classList.add('active');
  log('SYSTEM', 'Returned to Live Operations view.');
}

function openModal(which) {
  const overlay = document.getElementById(`modal-${which}`);
  if (!overlay) return;
  overlay.classList.add('active');

  if (which === 'reports') {
    renderReportsModal();
    log('SYSTEM', 'Opened Incident Reports & Audit Trail.');
  } else if (which === 'settings') {
    log('SYSTEM', 'Opened System Configuration.');
    if (state.backendConnected) {
      queryModelInfo();
    } else {
      resetModelInfoUI();
    }
  }
}

function closeModal(which) {
  const overlay = document.getElementById(`modal-${which}`);
  if (overlay) overlay.classList.remove('active');
}

// ─── SIDEBAR FLEET UPDATE ───────────────────────────────────────
function updateSidebarFleet() {
  state.drones.forEach(d => {
    const led = document.getElementById(`fleet-led-${d.id}`);
    const task = document.getElementById(`fleet-task-${d.id}`);
    const bat = document.getElementById(`fleet-bat-${d.id}`);

    if (led) {
      led.className = 'fleet-led';
      if (d.status === 'active') led.classList.add('online');
      else if (d.status === 'intercepting' || d.status === 'critical') led.classList.add('critical');
      else if (d.status === 'rtb') led.classList.add('warning');
      else led.classList.add('offline');
    }

    if (task) task.textContent = `${d.task} — ${d.zone}`;

    if (bat) {
      bat.textContent = `${d.battery}%`;
      bat.className = 'fleet-mini-battery';
      if (d.battery > 50) bat.classList.add('healthy');
      else if (d.battery > 20) bat.classList.add('low');
      else bat.classList.add('critical');
    }
  });
}

// ─── TOPBAR ─────────────────────────────────────────────────────
function updateTopbarStats() {
  const el1 = document.getElementById('stat-active-drones');
  const activeCt = state.drones.filter(d => d.status !== 'landed' && d.status !== 'offline').length;
  if (el1) el1.textContent = activeCt;

  const el2 = document.getElementById('stat-incidents-today');
  if (el2) el2.textContent = state.totalIncidentsToday;

  const el3 = document.getElementById('stat-resolved');
  if (el3) el3.textContent = state.resolvedToday;

  // DEFCON level
  updateDefcon();
}

function updateDefcon() {
  const badge = document.getElementById('defcon-badge');
  if (!badge) return;

  const criticalActive = state.incidents.filter(i => i.level === 'critical' && i.lifecycle !== 'resolved').length;
  const warningActive = state.incidents.filter(i => i.lifecycle !== 'resolved').length;

  if (state.lockdown) {
    badge.className = 'defcon-badge red';
    badge.textContent = 'LOCKDOWN';
  } else if (criticalActive > 0) {
    badge.className = 'defcon-badge red';
    badge.textContent = 'CRITICAL';
  } else if (warningActive > 0) {
    badge.className = 'defcon-badge yellow';
    badge.textContent = 'ELEVATED';
  } else {
    badge.className = 'defcon-badge green';
    badge.textContent = 'NORMAL';
  }
}

// ─── AUDIO ──────────────────────────────────────────────────────
function toggleMute() {
  state.audioMuted = !state.audioMuted;
  const btn = document.getElementById('audio-btn');
  if (state.audioMuted) {
    btn.classList.add('muted');
    btn.innerHTML = '<i data-lucide="volume-x"></i>';
    log('OPERATOR', 'Audio alerts muted.');
  } else {
    btn.classList.remove('muted');
    btn.innerHTML = '<i data-lucide="volume-2"></i>';
    log('OPERATOR', 'Audio alerts enabled.');
  }
  lucide.createIcons();
}

function playSiren() {
  if (state.audioMuted || !state.sirenEnabled) return;
  try {
    if (!state.sirenCtx) state.sirenCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = state.sirenCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.setValueAtTime(850, now + 0.15);
    osc.frequency.setValueAtTime(600, now + 0.3);
    osc.frequency.setValueAtTime(850, now + 0.45);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    osc.start(now);
    osc.stop(now + 0.6);
  } catch (e) { /* Audio not supported */ }
}

// ─── EMERGENCY LOCKDOWN ─────────────────────────────────────────
function triggerLockdown() {
  state.lockdown = true;
  document.body.classList.add('lockdown-active');
  document.getElementById('lockdown-banner').classList.add('active');

  state.drones.forEach(d => {
    d.status = 'landed';
    d.task = 'GROUNDED';
    d.speed = 0;
  });

  log('ALERT', '⚠ EMERGENCY LOCKDOWN ACTIVATED — All drones grounded immediately.', true);
  renderFleetCards();
  updateSidebarFleet();
  updateTopbarStats();
}

function disengageLockdown() {
  state.lockdown = false;
  document.body.classList.remove('lockdown-active');
  document.getElementById('lockdown-banner').classList.remove('active');

  state.drones.forEach(d => {
    d.status = 'active';
    d.task = 'Patrol';
    d.speed = 15 + Math.floor(Math.random() * 7);
    d.altitude = state.altitude;
  });

  log('SYSTEM', 'Lockdown disengaged. Drones returning to patrol status.');
  renderFleetCards();
  updateSidebarFleet();
  updateTopbarStats();
}

// ─── INCIDENT LIFECYCLE ENGINE ──────────────────────────────────
function createIncident(threatInfo, sourceDrone) {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];

  state.incidentIdCounter++;
  const id = `INC-${state.incidentIdCounter}`;

  const confidence = 65 + Math.floor(Math.random() * 30);

  const incident = {
    id,
    time: timeStr,
    type: threatInfo.type,
    level: threatInfo.level,
    lifecycle: 'detected', // detected → reviewing → confirmed → dispatched → resolved
    drone: sourceDrone.name,
    droneId: sourceDrone.id,
    zone: threatInfo.zone || sourceDrone.zone,
    confidence,
    location: `${sourceDrone.gps}`,
    createdAt: Date.now()
  };

  // Cap queue at 10
  if (state.incidents.length >= 10) {
    const oldest = state.incidents.pop();
    archiveIncident(oldest, 'Auto-Archived (Queue Full)');
  }

  state.incidents.unshift(incident);
  state.totalIncidentsToday++;

  // Update drone status
  sourceDrone.status = threatInfo.level === 'critical' ? 'intercepting' : 'active';
  sourceDrone.task = 'Tracking';

  // Map threat marker
  state.threatMarker = {
    x: sourceDrone.x + (Math.random() * 30 - 15),
    y: sourceDrone.y + (Math.random() * 30 - 15),
    type: threatInfo.type,
    level: threatInfo.level
  };

  // Highlight feed
  const cell = document.getElementById(`feed-cell-${sourceDrone.id}`);
  if (cell) cell.classList.add('threat-active');

  // Audio
  playSiren();

  // Toast
  showToast(incident);

  // Console
  log('AI', `THREAT DETECTED: ${threatInfo.type} — Drone ${sourceDrone.name} [CONF: ${confidence}%]`, threatInfo.level === 'critical');

  // Auto-dispatch if enabled
  if (state.autoDispatch && threatInfo.level === 'critical') {
    setTimeout(() => advanceLifecycle(id, 'dispatched'), 2000);
  }

  // Render
  renderIncidents();
  renderFleetCards();
  updateSidebarFleet();
  updateTopbarStats();
}

function advanceLifecycle(incidentId, toState) {
  const inc = state.incidents.find(i => i.id === incidentId);
  if (!inc) return;

  inc.lifecycle = toState;

  const drone = state.drones.find(d => d.name === inc.drone);

  switch (toState) {
    case 'reviewing':
      log('OPERATOR', `Reviewing ${inc.id}: ${inc.type} from ${inc.drone}.`);
      break;
    case 'confirmed':
      log('OPERATOR', `CONFIRMED threat ${inc.id}: ${inc.type}. Swarm response authorized.`, true);
      if (drone) drone.task = 'Target Lock';
      break;
    case 'dispatched':
      log('CMD', `Response dispatched for ${inc.id}. Swarm team dispatched.`);
      if (drone) { drone.status = 'intercepting'; drone.task = 'Intercepting'; }
      break;
    case 'resolved':
      resolveIncident(incidentId, 'Response Complete');
      return;
  }

  renderIncidents();
  renderFleetCards();
  updateSidebarFleet();
  updateDefcon();
}

function dismissIncident(incidentId, reason) {
  const idx = state.incidents.findIndex(i => i.id === incidentId);
  if (idx === -1) return;

  const inc = state.incidents[idx];
  const finalReason = reason ? `Operator Dismissed — FP: ${reason}` : 'Operator Dismissed — False Positive';
  archiveIncident(inc, finalReason);

  // Reset drone
  const drone = state.drones.find(d => d.name === inc.drone);
  if (drone) { drone.status = 'active'; drone.task = 'Patrol'; }

  // Clear feed highlight
  const cell = document.getElementById(`feed-cell-${inc.droneId}`);
  if (cell) cell.classList.remove('threat-active');

  state.incidents.splice(idx, 1);
  if (state.incidents.length === 0) state.threatMarker = null;

  log('OPERATOR', `Dismissed ${inc.id}: ${inc.type} — Marked as False Positive (${reason || 'No Reason'}).`);
  renderIncidents();
  renderFleetCards();
  updateSidebarFleet();
  updateTopbarStats();
}

function resolveIncident(incidentId, action) {
  const idx = state.incidents.findIndex(i => i.id === incidentId);
  if (idx === -1) return;

  const inc = state.incidents[idx];
  archiveIncident(inc, action || 'Resolved by Operator');
  state.resolvedToday++;

  const drone = state.drones.find(d => d.name === inc.drone);
  if (drone) { drone.status = 'active'; drone.task = 'Patrol'; }

  const cell = document.getElementById(`feed-cell-${inc.droneId}`);
  if (cell) cell.classList.remove('threat-active');

  state.incidents.splice(idx, 1);
  if (state.incidents.length === 0) state.threatMarker = null;

  log('OPERATOR', `RESOLVED ${inc.id}: ${inc.type} — ${action || 'Response Complete'}.`);
  showToast({ type: 'Incident Resolved', drone: inc.drone, level: 'success' });

  renderIncidents();
  renderFleetCards();
  updateSidebarFleet();
  updateTopbarStats();
}

function archiveIncident(inc, actionTaken) {
  state.history.unshift({
    time: inc.time,
    drone: inc.drone,
    type: inc.type,
    confidence: inc.confidence,
    location: inc.zone,
    status: actionTaken.includes('Dismiss') ? 'DISMISSED' : 'RESOLVED',
    action: actionTaken,
    level: inc.level
  });
}

// ─── RENDER: INCIDENT QUEUE ─────────────────────────────────────
function renderIncidents() {
  const container = document.getElementById('incidents-list');
  const countBadge = document.getElementById('alert-count');

  if (state.incidents.length === 0) {
    countBadge.textContent = '0';
    countBadge.className = 'alert-count-badge clear';
    container.innerHTML = `
      <div class="incident-empty">
        <i data-lucide="shield-check"></i>
        <span>No active incidents.<br>All sectors clear.</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  countBadge.textContent = state.incidents.length;
  countBadge.className = 'alert-count-badge has-alerts';

  container.innerHTML = '';
  state.incidents.forEach(inc => {
    const card = document.createElement('div');
    card.className = `incident-card level-${inc.level}`;
    card.onclick = () => openVerificationModal(inc.id);

    const badgeClass = `badge-${inc.lifecycle}`;
    const confClass = inc.confidence >= 85 ? 'high' : inc.confidence >= 60 ? 'medium' : 'low';

    let actionsHTML = '';
    switch (inc.lifecycle) {
      case 'detected':
        actionsHTML = `
          <button class="incident-btn btn-verify" onclick="event.stopPropagation();openVerificationModal('${inc.id}')"><i data-lucide="eye"></i>Review Feed</button>
          <button class="incident-btn btn-dispatch" onclick="event.stopPropagation();advanceLifecycle('${inc.id}','dispatched')"><i data-lucide="siren"></i>Dispatch</button>
          <button class="incident-btn btn-dismiss" onclick="event.stopPropagation();openVerificationModal('${inc.id}')">Dismiss</button>
        `;
        break;
      case 'reviewing':
        actionsHTML = `
          <button class="incident-btn btn-dispatch" onclick="event.stopPropagation();openVerificationModal('${inc.id}')"><i data-lucide="check-circle"></i>Confirm</button>
          <button class="incident-btn btn-dismiss" onclick="event.stopPropagation();openVerificationModal('${inc.id}')">FP Check</button>
        `;
        break;
      case 'confirmed':
        actionsHTML = `
          <button class="incident-btn btn-dispatch" onclick="event.stopPropagation();advanceLifecycle('${inc.id}','dispatched')"><i data-lucide="siren"></i>Dispatch Now</button>
          <button class="incident-btn btn-escalate" onclick="event.stopPropagation();log('CMD','Escalated ${inc.id} to central command.')"><i data-lucide="arrow-up-right"></i>Escalate</button>
        `;
        break;
      case 'dispatched':
        actionsHTML = `
          <button class="incident-btn btn-verify" style="background:var(--green-glow);color:var(--green);border-color:rgba(34,197,94,0.3);" onclick="event.stopPropagation();resolveIncident('${inc.id}','Response Complete')"><i data-lucide="check"></i>Mark Resolved</button>
        `;
        break;
    }

    card.innerHTML = `
      <div class="incident-top">
        <span class="incident-badge ${badgeClass}">${inc.lifecycle.toUpperCase()}</span>
        <span class="incident-time">${inc.time} • ${inc.id}</span>
      </div>
      <div class="incident-type">${inc.type}</div>
      <div class="incident-meta">
        <span class="incident-meta-item"><i data-lucide="plane" style="transform:rotate(45deg);"></i>${inc.drone}</span>
        <span class="incident-meta-item"><i data-lucide="map-pin"></i>${inc.zone}</span>
      </div>
      <div class="confidence-bar-wrap">
        <span class="confidence-bar-label">Conf.</span>
        <div class="confidence-bar-track">
          <div class="confidence-bar-fill ${confClass}" style="width:${inc.confidence}%;"></div>
        </div>
        <span class="confidence-bar-val">${inc.confidence}%</span>
      </div>
      <div class="incident-actions">${actionsHTML}</div>
    `;

    container.appendChild(card);
  });

  lucide.createIcons();
}

// ─── RENDER: FLEET CARDS ────────────────────────────────────────
function renderFleetCards() {
  const container = document.getElementById('fleet-body');
  if (!container) return;
  container.innerHTML = '';

  const activeCount = state.drones.filter(d => d.status !== 'landed' && d.status !== 'offline').length;
  const countEl = document.getElementById('fleet-count');
  if (countEl) countEl.textContent = `${activeCount}/4 ACTIVE`;

  state.drones.forEach(d => {
    const card = document.createElement('div');
    card.className = `drone-card ${d.status === 'intercepting' || d.status === 'critical' ? 'status-critical' : ''}`;

    const batClass = d.battery > 50 ? 'good' : d.battery > 20 ? 'mid' : 'low';
    const batColor = d.battery > 50 ? 'var(--green)' : d.battery > 20 ? 'var(--amber)' : 'var(--red)';

    let statusClass = 'active';
    if (d.status === 'intercepting' || d.status === 'critical') statusClass = 'intercepting';
    else if (d.status === 'rtb') statusClass = 'rtb';
    else if (d.status === 'landed' || d.status === 'offline') statusClass = 'landed';

    card.innerHTML = `
      <div class="drone-card-top">
        <span class="drone-name"><i data-lucide="plane" style="transform:rotate(45deg);"></i>${d.name}</span>
        <span class="drone-status-badge ${statusClass}">${d.status.toUpperCase()}</span>
      </div>
      <div class="drone-battery-row">
        <span class="battery-pct" style="color:${batColor};">${d.battery}%</span>
        <div class="battery-track">
          <div class="battery-fill ${batClass}" style="width:${d.battery}%;"></div>
        </div>
      </div>
      <div class="drone-stats-grid">
        <div class="drone-stat-item">
          <span class="drone-stat-label">Speed</span>
          <span class="drone-stat-value">${d.speed} m/s</span>
        </div>
        <div class="drone-stat-item">
          <span class="drone-stat-label">Alt</span>
          <span class="drone-stat-value">${d.altitude}m</span>
        </div>
        <div class="drone-stat-item">
          <span class="drone-stat-label">Ping</span>
          <span class="drone-stat-value">${d.latency}ms</span>
        </div>
        <div class="drone-stat-item">
          <span class="drone-stat-label">Task</span>
          <span class="drone-stat-value" style="color:${d.status === 'intercepting' ? 'var(--red)' : 'var(--green)'};">${d.task}</span>
        </div>
      </div>
      <div class="drone-quick-actions">
        <button class="drone-action-btn" onclick="droneCommand(${d.id},'rtb')"><i data-lucide="home"></i>RTB</button>
        <button class="drone-action-btn" onclick="droneCommand(${d.id},'hover')"><i data-lucide="pause"></i>Hover</button>
        <button class="drone-action-btn" onclick="droneCommand(${d.id},'intercept')"><i data-lucide="crosshair"></i>Intercept</button>
      </div>
    `;

    container.appendChild(card);
  });

  lucide.createIcons();
}

function droneCommand(droneId, command) {
  const drone = state.drones.find(d => d.id === droneId);
  if (!drone) return;

  switch (command) {
    case 'rtb':
      drone.status = 'rtb';
      drone.task = 'RTB';
      drone.speed = 25;
      log('DRONE', `${drone.name}: Return-to-Base command issued.`);
      break;
    case 'hover':
      drone.task = 'Hovering';
      drone.speed = 0;
      log('DRONE', `${drone.name}: Holding position, hover mode.`);
      break;
    case 'intercept':
      drone.status = 'intercepting';
      drone.task = 'Intercepting';
      drone.speed = 28;
      log('DRONE', `${drone.name}: Intercepting — moving to threat zone.`);
      break;
  }

  renderFleetCards();
  updateSidebarFleet();
}

// ─── FORMATION & ALTITUDE ───────────────────────────────────────
function setFormation(f) {
  state.formation = f;
  document.querySelectorAll('.formation-pill').forEach(p => p.classList.remove('active'));
  document.getElementById(`form-${f}`).classList.add('active');

  state.drones.forEach(d => {
    if (f === 'target') d.task = 'Focus Scan';
    else d.task = 'Patrol';
  });

  log('CMD', `Formation changed to: ${f.toUpperCase()}`);
  renderFleetCards();
  updateSidebarFleet();
}

function setAltitude(val) {
  state.altitude = parseInt(val);
  document.getElementById('altitude-val').textContent = `${val}m`;
  state.drones.forEach(d => { d.altitude = parseInt(val); });
  log('CMD', `Global altitude set to ${val}m.`);
}

// ─── CROWD PARTICLES SIMULATION (v3 Feature) ────────────────────
function initCrowdParticles() {
  state.crowdParticles = [];
  
  // Define street / walkway paths representing Sector 4B layout
  const path1 = [{x: 80, y: 75}, {x: 200, y: 75}, {x: 260, y: 155}, {x: 350, y: 80}, {x: 520, y: 75}]; // Upper path
  const path2 = [{x: 70, y: 240}, {x: 180, y: 230}, {x: 260, y: 155}, {x: 380, y: 250}, {x: 480, y: 240}]; // Lower path
  const pathVerticalLeft = [{x: 120, y: 50}, {x: 120, y: 150}, {x: 100, y: 260}]; // Left grid connector
  const pathVerticalRight = [{x: 480, y: 50}, {x: 480, y: 150}, {x: 420, y: 270}]; // Right grid connector
  const pathPlazaFocus = [{x: 200, y: 155}, {x: 260, y: 120}, {x: 320, y: 155}, {x: 260, y: 180}]; // Plaza circle path

  const paths = [path1, path2, pathVerticalLeft, pathVerticalRight, pathPlazaFocus];

  for (let i = 0; i < 160; i++) {
    const path = paths[Math.floor(Math.random() * paths.length)];
    const wIdx = Math.floor(Math.random() * path.length);
    const pt = path[wIdx];

    state.crowdParticles.push({
      x: pt.x + (Math.random() * 26 - 13),
      y: pt.y + (Math.random() * 26 - 13),
      path: path,
      waypointIdx: wIdx,
      direction: Math.random() > 0.5 ? 1 : -1,
      speed: 0.25 + Math.random() * 0.35,
      panicked: false,
      panicAngle: 0,
      size: 1.8 + Math.random() * 1.5
    });
  }
}

// ─── SIMULATION TICKS ───────────────────────────────────────────
function simulateTelemetryTick() {
  if (state.lockdown) return;

  state.drones.forEach(d => {
    // Battery drain
    if (d.battery > 5 && d.status !== 'landed') {
      d.battery -= Math.random() > 0.6 ? 1 : 0;
    }

    // Low battery auto-RTB
    if (d.battery <= 15 && d.status === 'active') {
      d.status = 'rtb';
      d.task = 'RTB (Low Battery)';
      log('DRONE', `⚠ ${d.name}: Battery critical (${d.battery}%). Auto-RTB initiated.`, true);
    }

    // Battery swap simulation
    if (d.battery <= 3) {
      d.battery = 95 + Math.floor(Math.random() * 5);
      d.status = 'active';
      d.task = 'Patrol';
      log('DRONE', `${d.name}: Battery swapped. Returning to patrol.`);
    }

    // Jitter speed and latency
    if (d.status === 'active') {
      d.speed = 15 + Math.floor(Math.random() * 8);
      d.latency = 10 + Math.floor(Math.random() * 12);
    } else if (d.status === 'intercepting') {
      d.speed = 24 + Math.floor(Math.random() * 6);
      d.latency = 16 + Math.floor(Math.random() * 10);
    }
  });

  renderFleetCards();
  updateSidebarFleet();
  updateTopbarStats();
}

function simulateRandomIncident() {
  if (state.lockdown) return;
  if (state.incidents.length >= 4) return; // Don't overwhelm

  // Weighted random selection
  const totalWeight = THREAT_CATALOG.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * totalWeight;
  let threat = THREAT_CATALOG[0];
  for (const t of THREAT_CATALOG) {
    r -= t.weight;
    if (r <= 0) { threat = t; break; }
  }

  // Check for duplicate active
  if (state.incidents.find(i => i.type === threat.type)) return;

  const droneIdx = Math.floor(Math.random() * state.drones.length);
  createIncident(threat, state.drones[droneIdx]);
}

// ─── ACTIVITY LOG ───────────────────────────────────────────────
function initLog() {
  log('SYSTEM', 'Dronaksh v3.0 Control Room initialized.');
  log('SYSTEM', 'Connecting to YOLOv8 stream pipelines...');
  log('DRONE', 'Alpha: Patrol sector Gate 1 — all nominal.');
  log('DRONE', 'Bravo: Patrol sector Stage A — all nominal.');
  log('DRONE', 'Charlie: Connected to main YOLOv8 camera model.');
  log('DRONE', 'Delta: Patrol sector Parking E — all nominal.');
}

function log(tag, message, isError = false) {
  const container = document.getElementById('activity-log');
  if (!container) return;

  const time = new Date().toTimeString().split(' ')[0];
  const tagLower = tag.toLowerCase();
  let tagClass = 'system';
  if (tagLower === 'ai') tagClass = 'ai';
  else if (tagLower === 'operator') tagClass = 'operator';
  else if (tagLower === 'drone') tagClass = 'drone';
  else if (tagLower === 'alert') tagClass = 'alert';
  else if (tagLower === 'cmd') tagClass = 'cmd';

  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="log-tag ${tagClass}">[${tag}]</span>
    <span class="log-msg ${isError ? 'error' : ''}">${message}</span>
  `;

  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

function clearLog() {
  const container = document.getElementById('activity-log');
  if (container) container.innerHTML = '';
  log('SYSTEM', 'Log cleared.');
}

// ─── TOAST NOTIFICATIONS ────────────────────────────────────────
function showToast(incident) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');

  const isSuccess = incident.level === 'success';
  toast.className = `toast ${isSuccess ? 'success' : ''}`;

  const iconColor = isSuccess ? 'var(--green)' : 'var(--red)';
  const iconName = isSuccess ? 'check-circle' : 'alert-triangle';
  const title = isSuccess ? 'Incident Resolved' : `${incident.level === 'critical' ? 'Critical' : 'Warning'} Alert`;

  toast.innerHTML = `
    <div class="toast-icon"><i data-lucide="${iconName}" style="color:${iconColor};"></i></div>
    <div class="toast-content">
      <div class="toast-title" style="color:${iconColor};">${title}</div>
      <div class="toast-desc">${incident.type} — ${incident.drone}</div>
    </div>
    <button class="toast-close-btn" onclick="this.parentElement.remove()">×</button>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s var(--ease) forwards';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// ─── KEYBOARD SHORTCUTS ─────────────────────────────────────────
function handleKeyboard(e) {
  // Esc — close modals/zoom
  if (e.key === 'Escape') {
    closeModal('reports');
    closeModal('settings');
    closeVerificationModal();
    closeFeedZoom();
  }

  // M — toggle mute
  if (e.key === 'm' || e.key === 'M') {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      toggleMute();
    }
  }

  // Space — acknowledge top incident
  if (e.key === ' ' && state.incidents.length > 0) {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      const top = state.incidents[0];
      if (top.lifecycle === 'detected') openVerificationModal(top.id);
    }
  }
}

// ─── FEED ZOOM ──────────────────────────────────────────────────
function zoomFeed(droneId) {
  state.zoomedFeed = droneId;
  document.getElementById('feed-zoom').classList.add('active');
  const zoomCanvas = document.getElementById('zoom-canvas');
  resizeCanvas(zoomCanvas, 900, 550);
}

function closeFeedZoom() {
  state.zoomedFeed = null;
  document.getElementById('feed-zoom').classList.remove('active');
}

// ─── CANVAS RENDERING ──────────────────────────────────────────
function initCanvases() {
  const canvasIds = ['feed-canvas-1', 'feed-canvas-2', 'feed-canvas-3', 'feed-canvas-4', 'tactical-canvas'];
  canvasIds.forEach(id => {
    const c = document.getElementById(id);
    if (c) resizeCanvasToParent(c);
  });

  window.addEventListener('resize', () => {
    canvasIds.forEach(id => {
      const c = document.getElementById(id);
      if (c) resizeCanvasToParent(c);
    });
  });

  function tick() {
    state.simulationTime += 0.015;

    drawTacticalMap();
    drawFeed(1);
    drawFeed(2);
    drawFeed(3);
    drawFeed(4);

    if (state.zoomedFeed) {
      drawZoomedFeed(state.zoomedFeed);
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Map click interaction
  const mapCanvas = document.getElementById('tactical-canvas');
  if (mapCanvas) {
    mapCanvas.addEventListener('mousedown', (e) => {
      const rect = mapCanvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * mapCanvas.width;
      const y = ((e.clientY - rect.top) / rect.height) * mapCanvas.height;
      handleMapClick(x, y);
    });
  }
}

function resizeCanvasToParent(canvas) {
  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
}

function resizeCanvas(canvas, w, h) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}

// ─── TACTICAL MAP DRAWING (v3 Update: Real Venue Map) ───────────
function drawTacticalMap() {
  const canvas = document.getElementById('tactical-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Background
  ctx.fillStyle = '#050810';
  ctx.fillRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = 'rgba(30, 45, 65, 0.25)';
  ctx.lineWidth = 1;
  const gs = 45;
  for (let x = 0; x < w; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // Draw River Bank & Bridges (Schematic Kumbh Mela layout)
  ctx.fillStyle = 'rgba(6, 182, 212, 0.05)';
  ctx.fillRect(0, h - 45, w, 45); // Ganga River
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, h - 45);
  ctx.lineTo(w, h - 45);
  ctx.stroke();
  
  // River Label
  ctx.fillStyle = 'rgba(6, 182, 212, 0.35)';
  ctx.font = `italic 10px monospace`;
  ctx.fillText('GANGA RIVERFRONT — SECTOR 4B', 20, h - 18);
  
  // Pontoon Bridges
  ctx.fillStyle = 'rgba(40, 50, 70, 0.8)';
  ctx.fillRect(150, h - 50, 25, 50); // Bridge 1
  ctx.fillRect(w * 0.7, h - 50, 25, 50); // Bridge 2
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(150, h - 50, 25, 50);
  ctx.strokeRect(w * 0.7, h - 50, 25, 50);

  // Zone boundaries
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 30, w - 80, h - 90);

  // Zone structures / tents
  const zones = [
    { x: 60, y: 55, w: 100, h: 40, label: 'GATE 1', type: 'checkpoint' },
    { x: w * 0.52, y: 50, w: 110, h: 45, label: 'STAGE A', type: 'stage' },
    { x: w * 0.54, y: h * 0.5, w: 100, h: 45, label: 'FOOD COURT', type: 'court' },
    { x: 50, y: h * 0.52, w: 90, h: 40, label: 'PARKING E', type: 'parking' },
    { x: w * 0.28, y: h * 0.34, w: 110, h: 50, label: 'MAIN PLAZA', type: 'plaza' }
  ];

  zones.forEach(z => {
    ctx.fillStyle = 'rgba(20, 28, 40, 0.7)';
    ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.18)';
    ctx.strokeRect(z.x, z.y, z.w, z.h);
    ctx.fillStyle = 'rgba(136, 153, 170, 0.45)';
    ctx.font = `bold ${Math.max(8, w * 0.013)}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.fillText(z.label, z.x + 8, z.y + 20);
    
    // Draw boundary icons/markers
    ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
    ctx.fillRect(z.x + 2, z.y + z.h - 10, z.w - 4, 8);
  });

  // ─── CROWD PARTICLES (v3 Feature) ───
  // Update crowd panicked states if there's a threat
  if (state.threatMarker) {
    const tm = state.threatMarker;
    state.crowdParticles.forEach(p => {
      const dist = Math.hypot(p.x - tm.x, p.y - tm.y);
      if (dist < 75) {
        p.panicked = true;
        // Direction angle away from incident
        p.panicAngle = Math.atan2(p.y - tm.y, p.x - tm.x) + (Math.random() * 0.5 - 0.25);
        p.speed = 1.3 + Math.random() * 1.0; // Run speed
      } else {
        p.panicked = false;
      }
    });
  } else {
    state.crowdParticles.forEach(p => {
      if (p.panicked) {
        p.panicked = false;
        p.speed = 0.25 + Math.random() * 0.35;
      }
    });
  }

  // Draw and animate particles
  state.crowdParticles.forEach(p => {
    if (p.panicked) {
      p.x += Math.cos(p.panicAngle) * p.speed;
      p.y += Math.sin(p.panicAngle) * p.speed;

      // Confine inside workspace
      p.x = Math.max(30, Math.min(w - 30, p.x));
      p.y = Math.max(30, Math.min(h - 55, p.y));
    } else {
      // Walk waypoints
      const dest = p.path[p.waypointIdx];
      const dist = Math.hypot(dest.x - p.x, dest.y - p.y);
      
      if (dist < 12) {
        p.waypointIdx += p.direction;
        if (p.waypointIdx >= p.path.length || p.waypointIdx < 0) {
          p.direction *= -1;
          p.waypointIdx += p.direction * 2;
          p.waypointIdx = Math.max(0, Math.min(p.path.length - 1, p.waypointIdx));
        }
      }
      
      const angle = Math.atan2(dest.y - p.y, dest.x - p.x);
      p.x += Math.cos(angle) * p.speed;
      p.y += Math.sin(angle) * p.speed;
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.panicked ? `rgba(239, 68, 68, ${0.4 + Math.sin(state.simulationTime * 10) * 0.2})` : 'rgba(34, 197, 94, 0.45)';
    ctx.fill();
  });

  // Threat marker pulsing overlay
  if (state.threatMarker) {
    const tm = state.threatMarker;
    const flash = Math.floor(state.simulationTime * 5) % 2 === 0;

    // Radius circle
    ctx.beginPath();
    ctx.arc(tm.x, tm.y, 45, 0, Math.PI * 2);
    ctx.fillStyle = tm.level === 'critical' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.06)';
    ctx.fill();

    // Dashed ring
    ctx.beginPath();
    ctx.arc(tm.x, tm.y, 45, 0, Math.PI * 2);
    ctx.strokeStyle = tm.level === 'critical' ? 'rgba(239,68,68,0.45)' : 'rgba(245,158,11,0.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (flash) {
      ctx.beginPath();
      ctx.arc(tm.x, tm.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = tm.level === 'critical' ? '#ef4444' : '#f59e0b';
      ctx.fill();
    }

    // Threat details box
    ctx.fillStyle = 'rgba(10, 14, 20, 0.85)';
    ctx.strokeStyle = tm.level === 'critical' ? '#ef4444' : '#f59e0b';
    ctx.lineWidth = 1;
    ctx.fillRect(tm.x + 10, tm.y - 30, 150, 42);
    ctx.strokeRect(tm.x + 10, tm.y - 30, 150, 42);
    
    ctx.fillStyle = '#fff';
    ctx.font = `bold 10px monospace`;
    ctx.fillText(tm.type.toUpperCase(), tm.x + 18, tm.y - 18);
    ctx.fillStyle = '#8899aa';
    ctx.font = `9px monospace`;
    ctx.fillText('THREAT INCIDENT LEVEL', tm.x + 18, tm.y - 6);
  }

  // Drones
  state.drones.forEach(d => {
    const target = getDroneTarget(d.id);
    d.x += (target.x - d.x) * 0.04;
    d.y += (target.y - d.y) * 0.04;

    // Flight path
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Searchlight Scanning cone (Target search overlay)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    const searchConeW = 22;
    const searchConeH = 45;
    ctx.lineTo(d.x - searchConeW, d.y + searchConeH);
    ctx.lineTo(d.x + searchConeW, d.y + searchConeH);
    ctx.closePath();
    const searchLightGrad = ctx.createLinearGradient(d.x, d.y, d.x, d.y + searchConeH);
    searchLightGrad.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
    searchLightGrad.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
    ctx.fillStyle = searchLightGrad;
    ctx.fill();
    ctx.restore();

    // Coverage circle outline
    ctx.beginPath();
    ctx.arc(d.x, d.y, 28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.02)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.12)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Drone triangle icon
    const angle = Math.atan2(target.y - d.y, target.x - d.x) + Math.PI / 2;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(5, 5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fillStyle = d.status === 'intercepting' ? '#ef4444' : d.status === 'rtb' ? '#f59e0b' : '#3b82f6';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Callsign Label
    ctx.fillStyle = d.status === 'intercepting' ? '#ef4444' : '#e8ecf1';
    ctx.font = `bold ${Math.max(8, w * 0.013)}px monospace`;
    ctx.fillText(d.name.substring(0, 1), d.x + 11, d.y - 8);
    ctx.fillStyle = '#556677';
    ctx.font = `${Math.max(7, w * 0.011)}px monospace`;
    ctx.fillText(`${d.altitude}m`, d.x + 11, d.y + 1);
  });
}

function getDroneTarget(id) {
  const t = state.simulationTime;
  const cx = 280, cy = 150;

  if (state.formation === 'perimeter') {
    if (id === 1) return { x: 110 + Math.sin(t * 0.15) * 45, y: 75 };
    if (id === 2) return { x: 480, y: 100 + Math.cos(t * 0.2) * 55 };
    if (id === 3) return { x: 380 + Math.sin(t * 0.25) * 70, y: 220 };
    return { x: 85, y: 190 + Math.cos(t * 0.12) * 45 };
  } else if (state.formation === 'grid') {
    const xo = (id - 1) * 130 + 90;
    return { x: xo + Math.sin(t * 0.35) * 35, y: 140 + Math.cos(t * 0.7) * 50 };
  } else if (state.formation === 'orbit') {
    const r = 100, phase = (id - 1) * (Math.PI / 2);
    return { x: cx + r * Math.cos(t * 0.4 + phase), y: cy + r * Math.sin(t * 0.4 + phase) };
  } else if (state.formation === 'target') {
    const tx = state.threatMarker ? state.threatMarker.x : cx;
    const ty = state.threatMarker ? state.threatMarker.y : cy;
    const r = 30, phase = (id - 1) * (Math.PI / 2);
    return { x: tx + r * Math.cos(t * 1.2 + phase), y: ty + r * Math.sin(t * 1.2 + phase) };
  }

  return { x: cx, y: cy };
}

function handleMapClick(x, y) {
  if (state.lockdown) return;

  state.threatMarker = { x, y, type: 'Manual Marker', level: 'warning' };

  // Find nearest drone
  let nearest = state.drones[0];
  let minDist = Infinity;
  state.drones.forEach(d => {
    const dist = Math.hypot(d.x - x, d.y - y);
    if (dist < minDist) { minDist = dist; nearest = d; }
  });

  nearest.status = 'intercepting';
  nearest.task = 'Investigating';

  setFormation('target');
  log('OPERATOR', `Map marker placed at [${Math.round(x)}, ${Math.round(y)}]. Rerouting ${nearest.name}.`);

  createIncident({ type: 'Operator-Flagged Area', level: 'warning', zone: nearest.zone }, nearest);
}

// ─── LIVE FEED DRAWING (v3 Update: Connect to YOLO Flask Stream) ──
function drawFeed(droneId) {
  const canvas = document.getElementById(`feed-canvas-${droneId}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const drone = state.drones[droneId - 1];
  const t = state.simulationTime;

  // Background
  ctx.fillStyle = '#080c14';
  ctx.fillRect(0, 0, w, h);

  if (drone.status === 'landed') {
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ef4444';
    ctx.font = `bold ${Math.max(10, w * 0.028)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('FEED OFFLINE', w / 2, h / 2 - 5);
    ctx.fillStyle = '#556677';
    ctx.font = `${Math.max(8, w * 0.02)}px monospace`;
    ctx.fillText('DRONE GROUNDED', w / 2, h / 2 + 12);
    ctx.textAlign = 'left';
    return;
  }

  // Draw Live YOLO stream if drone Charlie (id 3) and connected
  if (droneId === 3 && state.backendConnected && backendStreamImg.complete && backendStreamImg.naturalWidth > 0) {
    ctx.drawImage(backendStreamImg, 0, 0, w, h);
  } else {
    // Simulated scrolling grid (aerial view simulation)
    ctx.save();
    ctx.strokeStyle = '#141e2e';
    ctx.lineWidth = 1.5;
    const sY = (t * 12 * (droneId % 2 === 0 ? 1 : -1)) % 100;
    const sX = (t * 8 * (droneId <= 2 ? 1 : -1)) % 100;

    for (let x = -50; x < w + 50; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x + sX, -50);
      ctx.lineTo(x + sX + h * 0.4, h + 50);
      ctx.stroke();
    }
    for (let y = -50; y < h + 50; y += 65) {
      ctx.beginPath();
      ctx.moveTo(-50, y + sY);
      ctx.lineTo(w + 50, y + sY);
      ctx.stroke();
    }
    ctx.restore();

    // Simulated crowd blobs
    const cx = w / 2 + Math.sin(t * 0.35 + droneId * 1.2) * w * 0.2;
    const cy = h / 2 + Math.cos(t * 0.28 + droneId * 0.8) * h * 0.15;

    // Draw multiple "people" dots
    ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
    for (let i = 0; i < 6; i++) {
      const px = cx + Math.sin(t * 0.5 + i * 1.1) * 25 + (i - 3) * 8;
      const py = cy + Math.cos(t * 0.4 + i * 0.9) * 18 + (i - 3) * 5;
      ctx.beginPath();
      ctx.arc(px, py, 6 + Math.sin(t + i) * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // AI bounding box
    const activeIncident = state.incidents.find(inc => inc.droneId === drone.id && inc.lifecycle !== 'resolved');

    if (activeIncident) {
      const flash = Math.floor(t * 6) % 2 === 0;

      // Alert banner at top
      ctx.fillStyle = flash ? 'rgba(239, 68, 68, 0.92)' : 'rgba(239, 68, 68, 0.5)';
      ctx.fillRect(0, 0, w, 22);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(8, w * 0.02)}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(`⚠ ${activeIncident.type.toUpperCase()}`, w / 2, 15);
      ctx.textAlign = 'left';

      // Red bounding box
      const bx = cx - 35, by = cy - 28, bw = 75, bh = 55;
      ctx.strokeStyle = flash ? '#ef4444' : 'rgba(239,68,68,0.6)';
      ctx.lineWidth = flash ? 2.5 : 1.5;
      ctx.strokeRect(bx, by, bw, bh);

      // Label
      ctx.fillStyle = '#ef4444';
      ctx.font = `bold ${Math.max(7, w * 0.016)}px monospace`;
      ctx.fillText(`${activeIncident.type} [${activeIncident.confidence}%]`, bx, by - 6);
    } else {
      // Normal green detection boxes
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 22, cy - 18, 48, 40);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.7)';
      ctx.font = `${Math.max(7, w * 0.015)}px monospace`;
      ctx.fillText('CROWD [OK]', cx - 22, cy - 22);
    }
  }

  // HUD overlay
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 0.8;

  // Center crosshair
  const chx = w / 2, chy = h / 2;
  ctx.beginPath();
  ctx.moveTo(chx - 12, chy); ctx.lineTo(chx + 12, chy);
  ctx.moveTo(chx, chy - 12); ctx.lineTo(chx, chy + 12);
  ctx.stroke();

  // HUD corners
  const co = 8, cl = 12;
  ctx.beginPath();
  ctx.moveTo(co, co + cl); ctx.lineTo(co, co); ctx.lineTo(co + cl, co);
  ctx.moveTo(w - co, co + cl); ctx.lineTo(w - co, co); ctx.lineTo(w - co - cl, co);
  ctx.moveTo(co, h - co - cl); ctx.lineTo(co, h - co); ctx.lineTo(co + cl, h - co);
  ctx.moveTo(w - co, h - co - cl); ctx.lineTo(w - co, h - co); ctx.lineTo(w - co - cl, h - co);
  ctx.stroke();

  // Telemetry text
  ctx.fillStyle = 'rgba(232, 236, 241, 0.75)';
  const fs = Math.max(8, w * 0.018);
  ctx.font = `${fs}px monospace`;
  ctx.fillText(`${drone.name.toUpperCase()}`, 16, 22);
  ctx.fillText(`ALT: ${drone.altitude}M`, 16, 22 + fs + 2);
  ctx.fillText(`BAT: ${drone.battery}%`, 16, 22 + (fs + 2) * 2);

  ctx.textAlign = 'right';
  ctx.fillText(`${drone.latency}MS`, w - 14, h - 14);
  ctx.textAlign = 'left';

  // Scanlines overlay
  ctx.fillStyle = 'rgba(255,255,255,0.012)';
  for (let i = 0; i < h; i += 3) ctx.fillRect(0, i, w, 1);
}

function drawZoomedFeed(droneId) {
  const canvas = document.getElementById('zoom-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const drone = state.drones[droneId - 1];
  const t = state.simulationTime;

  ctx.fillStyle = '#060a10';
  ctx.fillRect(0, 0, w, h);

  // If drone Charlie and connected, draw the Flask video stream in zoom window
  if (droneId === 3 && state.backendConnected && backendStreamImg.complete && backendStreamImg.naturalWidth > 0) {
    ctx.drawImage(backendStreamImg, 0, 0, w, h);
  } else {
    // Larger scrolling grid
    ctx.strokeStyle = '#141e2e';
    ctx.lineWidth = 1.5;
    const sY = (t * 10 * (droneId % 2 === 0 ? 1 : -1)) % 120;
    const sX = (t * 7) % 120;
    for (let x = -60; x < w + 60; x += 100) {
      ctx.beginPath(); ctx.moveTo(x + sX, -60); ctx.lineTo(x + sX + h * 0.3, h + 60); ctx.stroke();
    }
    for (let y = -60; y < h + 60; y += 80) {
      ctx.beginPath(); ctx.moveTo(-60, y + sY); ctx.lineTo(w + 60, y + sY); ctx.stroke();
    }

    // Crowd blobs
    const cx = w / 2 + Math.sin(t * 0.3 + droneId) * 120;
    const cy = h / 2 + Math.cos(t * 0.25 + droneId) * 80;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    for (let i = 0; i < 12; i++) {
      const px = cx + Math.sin(t * 0.4 + i) * 50 + (i - 6) * 12;
      const py = cy + Math.cos(t * 0.35 + i * 0.7) * 35 + (i - 6) * 8;
      ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fill();
    }

    // Active incident box
    const inc = state.incidents.find(i => i.droneId === droneId);
    if (inc) {
      const flash = Math.floor(t * 5) % 2 === 0;
      ctx.strokeStyle = flash ? '#ef4444' : 'rgba(239,68,68,0.5)';
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 55, cy - 45, 110, 90);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`${inc.type} [CONF: ${inc.confidence}%]`, cx - 55, cy - 50);
    } else {
      ctx.strokeStyle = 'rgba(34,197,94,0.3)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 35, cy - 30, 70, 60);
      ctx.fillStyle = 'rgba(34,197,94,0.7)';
      ctx.font = '11px monospace';
      ctx.fillText('CROWD_OK [94%]', cx - 35, cy - 35);
    }
  }

  // HUD
  ctx.fillStyle = 'rgba(232,236,241,0.8)';
  ctx.font = '13px monospace';
  ctx.fillText(`DRONE ${drone.name.toUpperCase()} — ENLARGED AI VIEW`, 20, 28);
  ctx.fillText(`ALT: ${drone.altitude}M | BAT: ${drone.battery}% | PING: ${drone.latency}MS`, 20, 48);

  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('● REC', w - 20, 28);
  ctx.textAlign = 'left';

  // Press ESC hint
  ctx.fillStyle = 'rgba(136,153,170,0.5)';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Click anywhere or press ESC to close', w / 2, h - 15);
  ctx.textAlign = 'left';

  // Scanlines
  ctx.fillStyle = 'rgba(255,255,255,0.012)';
  for (let i = 0; i < h; i += 3) ctx.fillRect(0, i, w, 1);
}

// ─── CROSS-VERIFICATION MODAL (v3 Feature) ─────────────────────
function openVerificationModal(incidentId) {
  const inc = state.incidents.find(i => i.id === incidentId);
  if (!inc) return;

  state.activeIncidentForVerify = inc;

  // Mark reviewing state
  advanceLifecycle(inc.id, 'reviewing');

  // Set text details
  document.getElementById('verify-incident-type').textContent = inc.type;
  document.getElementById('verify-incident-details').textContent = `${inc.id} • Detected by Drone ${inc.drone} in ${inc.zone}`;

  // Uncheck verification checklist
  document.getElementById('check-shadow').checked = false;
  document.getElementById('check-object').checked = false;
  document.getElementById('check-context').checked = false;
  document.getElementById('check-behavior').checked = false;

  // Set live feed source
  const liveImg = document.getElementById('verify-live-feed');
  if (state.backendConnected) {
    liveImg.src = 'http://localhost:5000/api/video_feed?t=' + Date.now();
  } else {
    // Fallback message/blank if offline
    liveImg.src = '';
    liveImg.alt = "Streaming backend is offline. Local simulation active.";
  }

  // Draw baseline empty reference view
  drawBaselineCanvas(inc.drone);

  // Open modal overlay
  document.getElementById('modal-verify').classList.add('active');
  log('OPERATOR', `Opened Cross-Verification Console for incident ${inc.id}.`);
}

function closeVerificationModal() {
  document.getElementById('modal-verify').classList.remove('active');
  
  // Stop loading MJPEG stream to save CPU/Bandwidth
  document.getElementById('verify-live-feed').src = '';
  state.activeIncidentForVerify = null;
}

function drawBaselineCanvas(droneName) {
  const canvas = document.getElementById('verify-baseline-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = 400;
  const h = canvas.height = 250;

  ctx.fillStyle = '#050810';
  ctx.fillRect(0, 0, w, h);

  // Grid background
  ctx.strokeStyle = 'rgba(30, 45, 65, 0.4)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // Draw boundary of sector
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, w - 60, h - 60);

  // Draw schematic empty structures
  ctx.fillStyle = 'rgba(30, 45, 60, 0.5)';
  ctx.fillRect(100, 80, 200, 90);
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.12)';
  ctx.strokeRect(100, 80, 200, 90);

  // Baseline stamps
  ctx.fillStyle = 'rgba(232, 236, 241, 0.2)';
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`SECTOR OVERLAY: ${droneName.toUpperCase()}`, 45, 55);
  ctx.font = '9px monospace';
  ctx.fillText('NO OBJECT OVERLAYS RECORDED', 45, 105);
  ctx.fillText('CALIBRATED: 2026-06-26 08:00:00 (CLEAR)', 45, 120);
  ctx.fillText('FALSE POSITIVE THRESHOLD AUTO CALIBRATED', 45, 135);
  
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.strokeRect(150, 100, 100, 50);
}

function dismissVerificationFP() {
  if (!state.activeIncidentForVerify) return;
  const id = state.activeIncidentForVerify.id;
  const reason = document.getElementById('fp-reason-select').value;
  
  dismissIncident(id, reason);
  closeVerificationModal();
  showToast({ type: 'Incident Dismissed', drone: 'Verify Panel', level: 'success' });
}

function confirmVerificationReal() {
  if (!state.activeIncidentForVerify) return;
  const id = state.activeIncidentForVerify.id;
  
  advanceLifecycle(id, 'confirmed');
  
  // Reroute nearest drone to target lock immediately
  const inc = state.incidents.find(i => i.id === id);
  if (inc) {
    const drone = state.drones.find(d => d.name === inc.drone);
    if (drone) {
      drone.status = 'intercepting';
      drone.task = 'Target Lock';
      drone.speed = 28;
    }
  }
  
  closeVerificationModal();
  showToast({ type: 'Threat Confirmed', drone: 'Verify Panel', level: 'warning' });
}

// ─── MODEL MANAGEMENT & UPLOADS (v3 Feature) ────────────────────
function setupModelUploadDragDrop() {
  const zone = document.getElementById('model-upload-zone');
  if (!zone) return;

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadModelFile(files[0]);
    }
  });
}

function uploadModelFile(file) {
  if (!file) return;

  // Verify extension
  if (!file.name.endsWith('.pt') && !file.name.endsWith('.weights')) {
    log('SYSTEM', `Model weights upload blocked: Invalid file extension. Only .pt weights supported.`, true);
    showToast({ type: 'Invalid File', drone: 'AI Model', level: 'error' });
    return;
  }

  const progressWrap = document.getElementById('upload-progress-wrap');
  const progressFill = document.getElementById('upload-progress-fill');
  const progressVal = document.getElementById('upload-progress-val');

  progressWrap.style.display = 'block';
  progressFill.style.width = '0%';
  progressVal.textContent = '0%';

  // Fake upload progress bar
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += Math.random() * 15;
    if (progress >= 85) {
      clearInterval(progressInterval);
      progress = 85;
    }
    progressFill.style.width = `${Math.floor(progress)}%`;
    progressVal.textContent = `${Math.floor(progress)}%`;
  }, 100);

  const formData = new FormData();
  formData.append('file', file);

  fetch('http://localhost:5000/api/upload_model', {
    method: 'POST',
    body: formData
  })
  .then(r => r.json())
  .then(data => {
    clearInterval(progressInterval);
    progressFill.style.width = '100%';
    progressVal.textContent = '100%';

    if (data.status === 'success') {
      log('SYSTEM', `Model weights successfully uploaded & loaded: ${data.model_name}`);
      showToast({ type: 'Model Loaded', drone: 'AI Pipeline', level: 'success' });
      queryModelInfo();
    } else {
      log('SYSTEM', `Model upload failed: ${data.message}`, true);
      showToast({ type: 'Model Loading Failed', drone: 'AI Pipeline', level: 'error' });
    }

    setTimeout(() => {
      progressWrap.style.display = 'none';
    }, 2000);
  })
  .catch(err => {
    clearInterval(progressInterval);
    progressFill.style.width = '100%';
    progressVal.textContent = '100%';
    
    // Simulate successful weights swap in offline local mode for presentation
    log('SYSTEM', `[Offline Mode] Simulated weights load: ${file.name}`);
    document.getElementById('active-model-name').textContent = file.name;
    document.getElementById('model-framework').textContent = "Simulated Weights loaded locally";
    showToast({ type: 'Weights Swapped', drone: 'Sim AI Pipeline', level: 'success' });
    
    setTimeout(() => {
      progressWrap.style.display = 'none';
    }, 2000);
  });
}

function queryModelInfo() {
  fetch('http://localhost:5000/api/model_info')
    .then(r => r.json())
    .then(data => {
      document.getElementById('active-model-name').textContent = data.active_model;
      document.getElementById('model-device').textContent = data.device;
      document.getElementById('model-latency').textContent = `${data.inference_latency_ms}ms`;
      document.getElementById('model-framework').textContent = data.framework;
    })
    .catch(() => {
      resetModelInfoUI();
    });
}

function resetModelInfoUI() {
  document.getElementById('active-model-name').textContent = 'yolov8n.pt (fallback)';
  document.getElementById('model-device').textContent = 'CPU (Simulated)';
  document.getElementById('model-latency').textContent = '4ms';
  document.getElementById('model-framework').textContent = 'Simulated CV Inference';
}

// ─── REPORTS MODAL ──────────────────────────────────────────────
function renderReportsModal() {
  // Stats
  const statsEl = document.getElementById('report-stats');
  const weaponCount = state.history.filter(h => h.type.includes('Weapon') || h.type.includes('Violence')).length;
  const smokeCount = state.history.filter(h => h.type.includes('Smoke') || h.type.includes('Fire')).length;
  const crowdCount = state.history.filter(h => h.type.includes('Crowd') || h.type.includes('Stampede') || h.type.includes('Gathering')).length;
  const otherCount = state.history.length - weaponCount - smokeCount - crowdCount;

  statsEl.innerHTML = `
    <div class="report-stat-card">
      <div class="report-stat-info">
        <span class="report-stat-label">Weapons / Violence</span>
        <span class="report-stat-val" style="color:var(--red);">${weaponCount}</span>
      </div>
      <div class="report-stat-icon" style="background:var(--red-glow);color:var(--red);"><i data-lucide="shield-alert"></i></div>
    </div>
    <div class="report-stat-card">
      <div class="report-stat-info">
        <span class="report-stat-label">Smoke / Fire</span>
        <span class="report-stat-val" style="color:var(--amber);">${smokeCount}</span>
      </div>
      <div class="report-stat-icon" style="background:var(--amber-glow);color:var(--amber);"><i data-lucide="flame"></i></div>
    </div>
    <div class="report-stat-card">
      <div class="report-stat-info">
        <span class="report-stat-label">Crowd Density</span>
        <span class="report-stat-val" style="color:var(--accent);">${crowdCount}</span>
      </div>
      <div class="report-stat-icon" style="background:var(--accent-glow);color:var(--accent);"><i data-lucide="users"></i></div>
    </div>
    <div class="report-stat-card">
      <div class="report-stat-info">
        <span class="report-stat-label">Other Alerts</span>
        <span class="report-stat-val">${otherCount}</span>
      </div>
      <div class="report-stat-icon" style="background:var(--bg-card);color:var(--text-muted);"><i data-lucide="alert-circle"></i></div>
    </div>
  `;

  // Table
  const tbody = document.getElementById('reports-tbody');
  tbody.innerHTML = '';

  state.history.forEach(h => {
    const row = document.createElement('tr');
    const statusColor = h.status === 'RESOLVED' ? 'var(--green)' : 'var(--text-secondary)';
    const statusBg = h.status === 'RESOLVED' ? 'var(--green-glow)' : 'var(--bg-card)';

    row.innerHTML = `
      <td style="font-family:var(--font-mono);font-size:0.8rem;">${h.time}</td>
      <td style="font-weight:600;">${h.drone}</td>
      <td><span style="font-weight:600;color:${h.level === 'critical' ? 'var(--red)' : 'var(--text-primary)'}">${h.type}</span></td>
      <td style="font-family:var(--font-mono);">${h.confidence}%</td>
      <td style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-secondary);">${h.location}</td>
      <td><span class="status-badge" style="background:${statusBg};color:${statusColor};border:1px solid ${statusColor}30;">${h.status}</span></td>
      <td style="font-size:0.82rem;color:var(--green);">${h.action}</td>
    `;
    tbody.appendChild(row);
  });

  lucide.createIcons();
}

function exportCSV() {
  log('OPERATOR', 'Exporting audit trail as CSV...');
  let csv = 'data:text/csv;charset=utf-8,Time,Drone,Type,Confidence,Location,Status,Action\n';
  state.history.forEach(h => {
    csv += `"${h.time}","${h.drone}","${h.type}","${h.confidence}%","${h.location}","${h.status}","${h.action}"\n`;
  });
  const link = document.createElement('a');
  link.setAttribute('href', encodeURI(csv));
  link.setAttribute('download', `dronaksh_report_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ─── SETTINGS ───────────────────────────────────────────────────
function saveSettings() {
  state.yoloThreshold = parseInt(document.getElementById('yolo-slider').value);
  state.resnetThreshold = parseInt(document.getElementById('resnet-slider').value);
  state.sirenEnabled = document.getElementById('setting-siren').checked;
  state.autoDispatch = document.getElementById('setting-auto-dispatch').checked;

  log('SYSTEM', `Config saved. YOLO: ${state.yoloThreshold}% | ResNet: ${state.resnetThreshold}% | Sirens: ${state.sirenEnabled ? 'ON' : 'OFF'}`);

  showToast({ type: 'Configuration Saved', drone: 'System', level: 'success' });
}

// ─── BACKEND POLLING ────────────────────────────────────────────
let backendPollInterval = null;

function initBackendPolling() {
  backendPollInterval = setInterval(() => {
    const urlEl = document.getElementById('api-endpoint');
    const url = urlEl ? urlEl.value : 'http://localhost:5000/api/threats';

    fetch(url)
      .then(r => r.json())
      .then(data => {
        const netEl = document.getElementById('sys-network');
        if (netEl) netEl.innerHTML = '<span class="fleet-led online" style="width:6px;height:6px;"></span> LIVE CONNECTED';

        if (!state.backendConnected) {
          state.backendConnected = true;
          log('SYSTEM', 'Connected to YOLOv8 inference backend. Stream enabled.');
          queryModelInfo();
          
          // Connect stream to image source
          backendStreamImg.src = 'http://localhost:5000/api/video_feed?t=' + Date.now();
        }

        if (data.active_alerts) {
          data.active_alerts.forEach(alert => {
            if (!state.incidents.find(i => i.id === alert.id)) {
              // Charlie (Drone-03 / Drone 3) is connected to YOLO backend
              const drone = state.drones[2]; // Delta/Charlie
              createIncident({ type: alert.type, level: alert.level || 'critical', zone: alert.zone || drone.zone }, drone);
            }
          });
        }
      })
      .catch(() => {
        const netEl = document.getElementById('sys-network');
        if (netEl) netEl.innerHTML = '<span class="fleet-led online" style="width:6px;height:6px;"></span> SIMULATED';
        
        if (state.backendConnected) {
          state.backendConnected = false;
          log('SYSTEM', 'YOLOv8 backend disconnected. Falling back to local crowd simulator.');
          resetModelInfoUI();
          backendStreamImg.src = '';
        }
      });
  }, 2500);
}
