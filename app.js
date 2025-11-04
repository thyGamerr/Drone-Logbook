const FIXED_GOOGLE_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbypQst3AW88aybQfMSMXvax2RPR4E_-t_N6GmdJVfEMg5R8FdBeujsihxw8VSmEnRo3/exec";
const GOOGLE_CLIENT_ID =
  "314985765441-64a7gf2b9vvvesv6tc8ocngn24pej827.apps.googleusercontent.com";

// -----------------------------
// Helpers
// -----------------------------
const $ = (s) => document.querySelector(s);
let signedInEmail = localStorage.getItem("dlb_email") || "";

function nowLocalISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function toast(msg, type="ok") {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.className = ""; t.classList.add("show", type); t.textContent = msg;
  clearTimeout(toast._h); toast._h = setTimeout(()=>t.className="", 2200);
}
function log(m) {
  const el = $("#log-console");
  const ts = new Date().toLocaleTimeString();
  el.textContent += `\n[${ts}] ${m}`;
  el.scrollTop = el.scrollHeight;
}
function gv(id){ const el = $(`#${id}`); return el?el.value.trim():""; }
function sv(id,v){ const el = $(`#${id}`); if (el) el.value = v||""; }

function updateSignedInLabel(){
  const el = $("#signed-in-as");
  const signout = $("#btn-signout");
  const gbtn = $("#g_id_button");
  if (signedInEmail) {
    el.textContent = `Signed in as ${signedInEmail}`;
    el.dataset.email = signedInEmail;
    signout?.classList.remove("hidden");
    gbtn?.classList.add("hidden");
  } else {
    el.textContent = "";
    el.dataset.email = "";
    signout?.classList.add("hidden");
    gbtn?.classList.remove("hidden");
  }
}

// -----------------------------
// REAL Google Identity Services (OIDC)
// -----------------------------
function decodeJwt(token) {
  // Basic (non-validating) decoder, just to read email from payload
  const [, payload] = token.split(".");
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(decodeURIComponent(Array.prototype.map.call(json, c =>
    `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`
  ).join("")));
}

function initGoogleSignIn(){
  if (!window.google || !google.accounts || !google.accounts.id) {
    log("Google Identity script not ready yet. Will retry.");
    setTimeout(initGoogleSignIn, 500);
    return;
  }

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (resp) => {
      try {
        const payload = decodeJwt(resp.credential);
        const email = payload.email || "";
        if (email) {
          signedInEmail = email;
          localStorage.setItem("dlb_email", signedInEmail);
          toast("Signed in with Google.");
          log("Google sign-in OK (GIS).");
          updateSignedInLabel();
        } else {
          toast("Sign-in failed: no email in token","err");
          log("GIS token missing email claim.");
        }
      } catch (e) {
        toast("Sign-in parse error","err");
        log("GIS parse error: " + e.message);
      }
    },
    ux_mode: "popup",
    auto_select: true,
    itp_support: true
  });

  // Render the Google button in our placeholder div
  const host = $("#g_id_button");
  if (host) {
    google.accounts.id.renderButton(host, {
      theme: "filled_blue",
      size: "large",
      shape: "pill",
      type: "standard",
      text: "signin_with"
    });
  }

  // Optionally prompt One Tap (won't show if blocked/disabled)
  google.accounts.id.prompt();
}

function signOut(){
  try { google?.accounts?.id?.disableAutoSelect(); } catch {}
  localStorage.removeItem("dlb_email");
  signedInEmail = "";
  updateSignedInLabel();
  toast("Signed out.");
  log("User signed out.");
}

// -----------------------------
// Settings + queue
// -----------------------------
const LSQ = "drone_logbook_queue";
const LSS = "drone_logbook_settings";

const loadQ = () => { try{return JSON.parse(localStorage.getItem(LSQ)||"[]");}catch{return[];} };
const saveQ = (a) => { localStorage.setItem(LSQ, JSON.stringify(a||[])); updQ(); };
const updQ = () => { $("#queue-count").textContent = String(loadQ().length); };

function saveSettings(){
  localStorage.setItem(LSS, JSON.stringify({
    provider: "google",
    targetLink: gv("target-sheet-id") || ""
  }));
  toast("Settings saved."); log("Settings saved.");
}
function loadSettings(){
  try {
    const s = JSON.parse(localStorage.getItem(LSS)||"{}");
    if (s.targetLink) sv("target-sheet-id", s.targetLink);
  } catch {}
}

function qAdd(type){
  const item = {
    type,
    timestamp: new Date().toISOString(),
    date: new Date().toLocaleDateString(),
    userEmail: signedInEmail || "",
    flightName: gv("flight-name"),
    pilotName: gv("pilot-name"),
    observer: gv("observer"),
    project: gv("project"),
    takeoffLat: gv("takeoff-lat"),
    takeoffLon: gv("takeoff-lon"),
    startLocal: gv("start-local"),
    endLocal: gv("end-local"),
    startWind: gv("start-wind"),
    startWindDir: gv("start-wind-dir"),
    rtkMode: gv("rtk-mode"),
    droneModel: gv("drone-model"),
    aircraftId: gv("aircraft-id"),
    payload: gv("payload"),
    missionType: gv("mission-type"),
    airspaceMethod: gv("airspace-method"),
    baseM: "",
    notes: gv("notes"),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    targetLink: gv("target-sheet-id") || ""   // backend chooses this sheet if provided
  };
  const arr = loadQ(); arr.push(item); saveQ(arr);
  toast(`Queued ${type} → ${item.flightName}`); log(`Queued ${type} → ${item.flightName}`);
}

// -----------------------------
// GPS + Wind (Open-Meteo)
// -----------------------------
async function useGPS(){
  if(!navigator.geolocation){ toast("GPS not available","warn"); return; }
  navigator.geolocation.getCurrentPosition(
    pos=>{
      const lat=String(pos.coords.latitude.toFixed(6));
      const lon=String(pos.coords.longitude.toFixed(6));
      sv("takeoff-lat",lat); sv("takeoff-lon",lon);
      log("GPS captured.");
      if(navigator.onLine) autoWind(lat,lon);
    },
    err=>{ toast("GPS failed","err"); log(`GPS error: ${err.message}`); },
    {enableHighAccuracy:true, timeout:10000, maximumAge:0}
  );
}
async function autoWind(lat,lon){
  try{
    const u=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=wind_speed_10m,wind_direction_10m`;
    const r=await fetch(u); if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const j=await r.json();
    const sp=j?.current?.wind_speed_10m, dir=j?.current?.wind_direction_10m;
    if(sp!=null) sv("start-wind",String(sp));
    if(dir!=null) sv("start-wind-dir",String(dir));
    log(`Wind ${sp} m/s @ ${dir}°`);
  }catch(e){ log(`Wind lookup failed: ${e.message}`); }
}
function nowStart(){ sv("start-local", nowLocalISO()); const lat=gv("takeoff-lat"),lon=gv("takeoff-lon"); if(lat&&lon&&navigator.onLine) autoWind(lat,lon); }
function nowEnd(){ sv("end-local", nowLocalISO()); }

// -----------------------------
// Validate link
// -----------------------------
function validateLink(){
  const link=gv("target-sheet-id");
  const badge=$("#validate-status");
  if(!link){ badge.textContent="Not validated"; toast("No link provided","warn"); return; }
  const ok=/spreadsheets\/d\/[a-zA-Z0-9-_]+/.test(link) || /^[a-zA-Z0-9-_]{20,}$/.test(link);
  badge.textContent = ok? "Link OK ✓" : "Invalid link";
  toast(ok? "Link validated." : "Invalid Google Sheet link", ok? "ok":"err");
}

// -----------------------------
// Sync (no-cors, fire-and-forget)
// -----------------------------
async function postNoCors(items){
  await fetch(FIXED_GOOGLE_ENDPOINT, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(items)
  });
}
async function syncNow(){
  const list = loadQ();
  if(!list.length){ toast("Nothing to sync.","warn"); return; }
  try{
    const targetLink = gv("target-sheet-id") || "";
    const payload = list.map(x=>({ ...x, targetLink }));
    await postNoCors(payload);
    saveQ([]); // no-cors → assume success
    toast("Synced (sent)."); log("Synced (sent to Apps Script).");
  }catch(e){
    toast("Network error during sync.","err"); log(`Sync failed: ${e.message}`);
  }
}

// -----------------------------
// Wire UI + init
// -----------------------------
function bindUI(){
  $("#btn-save-settings")?.addEventListener("click", saveSettings);
  $("#btn-validate-link")?.addEventListener("click", validateLink);
  $("#btn-queue-start")?.addEventListener("click", ()=>qAdd("start"));
  $("#btn-queue-end")?.addEventListener("click", ()=>qAdd("end"));
  $("#btn-sync")?.addEventListener("click", syncNow);
  $("#btn-clear-queue")?.addEventListener("click", ()=>{ saveQ([]); toast("Local queue cleared."); log("Queue cleared."); });
  $("#btn-now-start")?.addEventListener("click", nowStart);
  $("#btn-now-end")?.addEventListener("click", nowEnd);
  $("#btn-gps")?.addEventListener("click", useGPS);

  $("#btn-microsoft")?.addEventListener("click", ()=>{ toast("Microsoft sign-in not enabled yet.","warn"); log("Microsoft sign-in placeholder."); });
  $("#btn-signout")?.addEventListener("click", signOut);
}

document.addEventListener("DOMContentLoaded", () => {
  bindUI();
  loadSettings();
  updateSignedInLabel();
  // Initialize real Google sign-in (renders the button and handles login)
  initGoogleSignIn();
  // Finish boot
  updQ();
  log("Drone LogBook v1.2.0 ready.");
});
