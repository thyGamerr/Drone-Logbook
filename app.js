/* app.js — Drone LogBook (no-preflight, no-CORS readback)
   Paste this over your existing app.js
   >>> SET YOUR GOOGLE WEB APP URL BELOW <<< */

const FIXED_GOOGLE_ENDPOINT = "https://script.google.com/macros/s/AKfycbwvtiXYzZZbQDCL4MvL1IOL1bHecQWaDUGCo_zN5GHofwb_Z1PoJnOMxWPDxjWyXt4n/exec";
const $ = (s) => document.querySelector(s);

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
function log(m) { const el = $("#log-console"); const ts = new Date().toLocaleTimeString(); el.textContent += `\n[${ts}] ${m}`; el.scrollTop = el.scrollHeight; }
function gv(id){ const el = $(`#${id}`); return el?el.value.trim():""; }
function sv(id,v){ const el = $(`#${id}`); if(el) el.value=v||""; }

const LSQ = "drone_logbook_queue"; const LSS = "drone_logbook_settings";
const loadQ = () => { try{return JSON.parse(localStorage.getItem(LSQ)||"[]");}catch{return[];} };
const saveQ = (a) => { localStorage.setItem(LSQ, JSON.stringify(a||[])); updQ(); };
const updQ = () => { $("#queue-count").textContent = String(loadQ().length); };

function qAdd(type){
  const item = {
    type, timestamp:new Date().toISOString(), date:new Date().toLocaleDateString(),
    userEmail: $("#signed-in-as").dataset.email || "",
    flightName:gv("flight-name"), pilotName:gv("pilot-name"), observer:gv("observer"), project:gv("project"),
    takeoffLat:gv("takeoff-lat"), takeoffLon:gv("takeoff-lon"),
    startLocal:gv("start-local"), endLocal:gv("end-local"),
    startWind:gv("start-wind"), startWindDir:gv("start-wind-dir"),
    rtkMode:gv("rtk-mode"), droneModel:gv("drone-model"), aircraftId:gv("aircraft-id"),
    payload:gv("payload"), missionType:gv("mission-type"), airspaceMethod:gv("airspace-method"),
    baseM:"", notes:gv("notes"),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    driveType: gv("drive-type") || "personal",
    targetLink: gv("target-sheet-id") || ""
  };
  const arr = loadQ(); arr.push(item); saveQ(arr);
  toast(`Queued ${type} → ${item.flightName}`); log(`Queued ${type} → ${item.flightName}`);
}

function saveSettings(){
  localStorage.setItem(LSS, JSON.stringify({ provider: gv("provider")||"google", targetLink: gv("target-sheet-id")||"" }));
  toast("Settings saved."); log("Settings saved.");
}
function loadSettings(){
  try{ const s = JSON.parse(localStorage.getItem(LSS)||"{}"); if(s.provider) sv("provider",s.provider); if(s.targetLink) sv("target-sheet-id",s.targetLink); }catch{}
}

async function useGPS(){
  if(!navigator.geolocation){ toast("GPS not available","warn"); return; }
  navigator.geolocation.getCurrentPosition(
    pos=>{
      const lat=String(pos.coords.latitude.toFixed(6)), lon=String(pos.coords.longitude.toFixed(6));
      sv("takeoff-lat",lat); sv("takeoff-lon",lon); log("GPS captured.");
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
    const j=await r.json(); const sp=j?.current?.wind_speed_10m, dir=j?.current?.wind_direction_10m;
    if(sp!=null) sv("start-wind",String(sp)); if(dir!=null) sv("start-wind-dir",String(dir));
    log(`Wind ${sp} m/s @ ${dir}°`);
  }catch(e){ log(`Wind lookup failed: ${e.message}`); }
}

function nowStart(){ sv("start-local", nowLocalISO()); const lat=gv("takeoff-lat"), lon=gv("takeoff-lon"); if(lat&&lon&&navigator.onLine) autoWind(lat,lon); }
function nowEnd(){ sv("end-local", nowLocalISO()); }

function validateLink(){
  const link=gv("target-sheet-id"), badge=$("#validate-status");
  if(!link){ badge.textContent="Not validated"; badge.className="pill"; toast("No link provided","warn"); return; }
  const ok=/\/folders\//.test(link)||/\/spreadsheets\//.test(link)||/drive.google.com/.test(link);
  badge.textContent= ok? "Link OK ✓":"Invalid link"; badge.className="pill";
  log(ok?"Target link validated.":"Invalid link.");
  toast(ok?"Link validated.":"Invalid Google Drive/Sheet link", ok?"ok":"err");
}

/* ---- SYNC: use mode:'no-cors' + text/plain so the browser never blocks ---- */
async function postNoCors(items){
  // We cannot read the response in no-cors mode; this is fire-and-forget.
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

  const payload = list.map(x=>({ ...x, targetLink: gv("target-sheet-id")||"", driveType: gv("drive-type")||"personal" }));
  try{
    await postNoCors(payload);
    saveQ([]); // assume success (cannot read response in no-cors)
    toast("Synced (sent)."); log("Synced (sent to Apps Script, no-cors).");
  }catch(e){
    toast("Network error during sync.","err"); log(`Sync failed: ${e.message}`);
  }
}

function clearQueue(){ saveQ([]); toast("Local queue cleared."); log("Queue cleared."); }

function bindUI(){
  $("#btn-save-settings")?.addEventListener("click", saveSettings);
  $("#btn-validate-link")?.addEventListener("click", validateLink);
  $("#btn-queue-start")?.addEventListener("click", ()=>qAdd("start"));
  $("#btn-queue-end")?.addEventListener("click", ()=>qAdd("end"));
  $("#btn-sync")?.addEventListener("click", syncNow);
  $("#btn-clear-queue")?.addEventListener("click", clearQueue);
  $("#btn-now-start")?.addEventListener("click", nowStart);
  $("#btn-now-end")?.addEventListener("click", nowEnd);
  $("#btn-gps")?.addEventListener("click", useGPS);

  // lightweight "signed in" label so queue shows something in userEmail
  const label = $("#signed-in-as"); if(label){ label.textContent = `Signed in as ${label.textContent || ""}`; label.dataset.email = (label.textContent||"").split(" ")[3]||""; }
}

(function init(){
  bindUI(); loadSettings(); updQ();
  log("Drone LogBook v1.1.2 ready.");
})();
