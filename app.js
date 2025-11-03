/* app.js — Drone LogBook (no-preflight / CORS-safe)
   Paste this over your existing app.js
   >>> SET YOUR GOOGLE WEB APP URL BELOW <<< */

const FIXED_GOOGLE_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbwfot9kG0jXpc5YLOkNISPPZsXsoLA276_TEgShvbJdQHAD54oCMmbrJHEUo6jRM-e8/exec"; 

// -----------------------------
// Basic helpers
// -----------------------------
const $ = (sel) => document.querySelector(sel);

function nowLocalISO() {
  // yyyy-MM-ddTHH:mm (without seconds) for datetime-local inputs
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function toast(msg, type = "ok") {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.className = "";
  t.classList.add("show", type);
  t.textContent = msg;
  clearTimeout(toast._h);
  toast._h = setTimeout(() => (t.className = ""), 2200);
}

function log(line) {
  const el = $("#log-console");
  const ts = new Date().toLocaleTimeString();
  el.textContent += `\n[${ts}] ${line}`;
  el.scrollTop = el.scrollHeight;
}

function getVal(id) {
  const el = $(`#${id}`);
  return el ? el.value.trim() : "";
}
function setVal(id, v) {
  const el = $(`#${id}`);
  if (el) el.value = v || "";
}

// -----------------------------
// localStorage queue
// -----------------------------
const LS_PREFIX = "drone_logbook_";
const LS_QUEUE = LS_PREFIX + "queue";
const LS_SETTINGS = LS_PREFIX + "settings";

function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(LS_QUEUE) || "[]");
  } catch {
    return [];
  }
}
function saveQueue(list) {
  localStorage.setItem(LS_QUEUE, JSON.stringify(list || []));
  updateQueueCount();
}
function updateQueueCount() {
  const list = loadQueue();
  $("#queue-count").textContent = String(list.length);
}

function queueAdd(type) {
  const item = {
    type, // "start" or "end"
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString(),
    userEmail: signedInEmail || "",
    flightName: getVal("flight-name"),
    pilotName: getVal("pilot-name"),
    observer: getVal("observer"),
    project: getVal("project"),
    takeoffLat: getVal("takeoff-lat"),
    takeoffLon: getVal("takeoff-lon"),
    startLocal: getVal("start-local"),
    endLocal: getVal("end-local"),
    startWind: getVal("start-wind"),
    startWindDir: getVal("start-wind-dir"),
    rtkMode: getVal("rtk-mode"),
    droneModel: getVal("drone-model"),
    aircraftId: getVal("aircraft-id"),
    payload: getVal("payload"),
    missionType: getVal("mission-type"),
    airspaceMethod: getVal("airspace-method"),
    baseM: "", // reserved if you add later
    notes: getVal("notes"),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    driveType: getVal("drive-type"), // "personal" or "shared"
    targetLink: getVal("target-sheet-id") || "" // used when driveType=shared
  };

  const list = loadQueue();
  list.push(item);
  saveQueue(list);
  toast(`Queued ${type} → ${item.flightName}`);
  log(`Queued ${type} → ${item.flightName}`);
}

// -----------------------------
// Settings
// -----------------------------
function saveSettings() {
  const s = {
    provider: getVal("provider") || "google",
    targetLink: getVal("target-sheet-id") || ""
  };
  localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
  toast("Settings saved.");
  log("Settings saved.");
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}");
    if (s.provider) setVal("provider", s.provider);
    if (s.targetLink) setVal("target-sheet-id", s.targetLink);
  } catch {}
}

// -----------------------------
// Auth (Google only shown as signed-in text for now)
// -----------------------------
let signedInEmail = "";
function initGoogleButton() {
  const btn = $("#btn-google");
  if (!btn) return;
  btn.addEventListener("click", () => {
    // We already rely on Apps Script running as the user.
    // For now we emulate "signed-in" just for display.
    // Replace with GIS if you want a true Google token later.
    signedInEmail = signedInEmail || "google-user";
    $("#signed-in-as").textContent = `Signed in as ${signedInEmail}@example`;
    toast("Google sign-in OK.");
    log("Google sign-in OK.");
  });
}
function initMicrosoftButton() {
  const btn = $("#btn-microsoft");
  if (!btn) return;
  btn.addEventListener("click", () => {
    toast("Microsoft sign-in not enabled yet.", "warn");
    log("Microsoft sign-in placeholder.");
  });
}

// -----------------------------
// GPS + Wind (Open-Meteo)
// -----------------------------
async function useGPS() {
  if (!navigator.geolocation) {
    toast("GPS not available", "warn");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = String(pos.coords.latitude.toFixed(6));
      const lon = String(pos.coords.longitude.toFixed(6));
      setVal("takeoff-lat", lat);
      setVal("takeoff-lon", lon);
      log("GPS captured.");

      // if online + coords → fetch wind
      if (navigator.onLine) autoFillWind(lat, lon);
    },
    (err) => {
      toast("GPS failed", "err");
      log(`GPS error: ${err.message}`);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

async function autoFillWind(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
      lat
    )}&longitude=${encodeURIComponent(
      lon
    )}&current=wind_speed_10m,wind_direction_10m`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const sp = j?.current?.wind_speed_10m;
    const dir = j?.current?.wind_direction_10m;
    if (sp != null) setVal("start-wind", String(sp));
    if (dir != null) setVal("start-wind-dir", String(dir));
    log(`Wind ${sp} m/s @ ${dir}°`);
  } catch (e) {
    log(`Wind lookup failed: ${e.message}`);
  }
}

// -----------------------------
// “Now → Start / End” buttons
// -----------------------------
function nowStart() {
  setVal("start-local", nowLocalISO());
  // wind auto-fill requires lat/lon + online
  const lat = getVal("takeoff-lat");
  const lon = getVal("takeoff-lon");
  if (lat && lon && navigator.onLine) autoFillWind(lat, lon);
}

function nowEnd() {
  setVal("end-local", nowLocalISO());
}

// -----------------------------
// Validate link (basic)
// -----------------------------
function validateLink() {
  const link = getVal("target-sheet-id");
  const badge = $("#validate-status");
  if (!link) {
    badge.textContent = "Not validated";
    badge.className = "pill";
    toast("No link provided", "warn");
    return;
  }
  const ok =
    /\/folders\//.test(link) || /\/spreadsheets\//.test(link) || /drive.google.com/.test(link);
  if (ok) {
    badge.textContent = "Link OK ✓";
    badge.className = "pill";
    log("Target link validated.");
    toast("Link validated.");
  } else {
    badge.textContent = "Invalid link";
    badge.className = "pill";
    toast("Invalid Google Drive/Sheet link", "err");
  }
}

// -----------------------------
// Sync (NO PREFLIGHT) — text/plain
// -----------------------------
async function postBatch(items) {
  // IMPORTANT: use text/plain to avoid preflight (CORS)
  const r = await fetch(FIXED_GOOGLE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // <— key change (no preflight)
    body: JSON.stringify(items)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json().catch(() => ({}));
}

async function syncNow() {
  const list = loadQueue();
  if (!list.length) {
    toast("Nothing to sync.", "warn");
    return;
  }

  // Attach targetLink/driveType to each item from current settings
  const targetLink = getVal("target-sheet-id") || "";
  const driveType = getVal("drive-type") || "personal";
  const payload = list.map((x) => ({ ...x, targetLink, driveType }));

  try {
    await postBatch(payload);
    // If we got here, consider all OK
    saveQueue([]);
    toast("Synced successfully.");
    log("Synced successfully.");
  } catch (e) {
    toast("Network error during sync.", "err");
    log(`Sync failed: ${e.message}`);
  }
}

// -----------------------------
// Clear queue
// -----------------------------
function clearQueue() {
  saveQueue([]);
  toast("Local queue cleared.");
  log("Queue cleared.");
}

// -----------------------------
// Wire up UI
// -----------------------------
function bindUI() {
  $("#btn-save-settings")?.addEventListener("click", saveSettings);
  $("#btn-validate-link")?.addEventListener("click", validateLink);

  $("#btn-queue-start")?.addEventListener("click", () => queueAdd("start"));
  $("#btn-queue-end")?.addEventListener("click", () => queueAdd("end"));
  $("#btn-sync")?.addEventListener("click", syncNow);
  $("#btn-clear-queue")?.addEventListener("click", clearQueue);

  $("#btn-now-start")?.addEventListener("click", nowStart);
  $("#btn-now-end")?.addEventListener("click", nowEnd);
  $("#btn-gps")?.addEventListener("click", useGPS);

  initGoogleButton();
  initMicrosoftButton();
}

// -----------------------------
// Init
// -----------------------------
(function init() {
  bindUI();
  loadSettings();
  updateQueueCount();

  log("Drone LogBook v1.1.2 ready.");
  // If you want to show a real email, wire GIS/MSAL and set signedInEmail there.
})();
