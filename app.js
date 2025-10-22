/* Drone LogBook PWA core */

const $ = s => document.querySelector(s);
const logEl = $('#log');
const SETTINGS_KEY = 'dlb_settings_v1';
const QUEUE_KEY = 'dlb_queue_v1';

function log(line){ logEl.textContent = `${new Date().toLocaleTimeString()}  ${line}\n` + logEl.textContent; }
function load(){ try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'); } catch { return {}; } }
function save(v){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(v)); }
function getQueue(){ try { return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]'); } catch { return []; } }
function setQueue(arr){ localStorage.setItem(QUEUE_KEY, JSON.stringify(arr)); updateQueueCount(); }
function pushQueue(item){ const q=getQueue(); q.push(item); setQueue(q); }

function updateQueueCount(){ $('#queueCount').textContent = `${getQueue().length} queued`; }

function fillTimezones(){
  const tzSel = $('#timezone');
  TIMEZONES.forEach(tz=>{
    const opt = document.createElement('option'); opt.value=tz; opt.textContent=tz; tzSel.appendChild(opt);
  });
}

function uiFromSettings(){
  const s = load();
  $('#provider').value = s.provider || '';
  $('#googleEndpoint').value = s.googleEndpoint || '';
  $('#msDriveItemId').value = s.msDriveItemId || '';
  $('#msTableName').value = s.msTableName || 'FlightLogTable';
  $('#timezone').value = s.timezone || (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  toggleProviderSections();
  updateQueueCount();
  $('#whoami').textContent = s.userEmail ? `Signed in as ${s.userEmail}` : 'Not signed in';
}

function toggleProviderSections(){
  const provider = $('#provider').value;
  document.querySelectorAll('.provider').forEach(el=>el.style.display='none');
  if(provider==='google') document.querySelectorAll('.google-only').forEach(el=>el.style.display='flex');
  if(provider==='microsoft') document.querySelectorAll('.ms-only').forEach(el=>el.style.display='flex');
}

function saveSettings(){
  const s = load();
  s.provider = $('#provider').value || s.provider || '';
  s.googleEndpoint = $('#googleEndpoint').value.trim();
  s.msDriveItemId = $('#msDriveItemId').value.trim();
  s.msTableName = $('#msTableName').value.trim() || 'FlightLogTable';
  s.timezone = $('#timezone').value;
  save(s); log('Settings saved'); uiFromSettings();
}

function nowLocalInput(){
  const dt = new Date();
  const pad = n=>String(n).padStart(2,'0');
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

// --- GPS ---
$('#btnGPS').addEventListener('click', ()=>{
  if (!navigator.geolocation) return alert('Geolocation not available');
  navigator.geolocation.getCurrentPosition(
    pos => { $('#lat').value = pos.coords.latitude.toFixed(6); $('#lon').value = pos.coords.longitude.toFixed(6); },
    err => alert('GPS error: ' + err.message), { enableHighAccuracy:true, timeout:10000 }
  );
});

// --- Time helpers ---
$('#btnNow').addEventListener('click', ()=> $('#startLocal').value = nowLocalInput());
$('#btnEndNow').addEventListener('click', ()=> $('#endLocal').value = nowLocalInput());

// --- Queue start/end ---
$('#queueStart').addEventListener('click', ()=>{
  const s = load();
  const item = {
    kind: 'start',
    provider: s.provider,
    Timezone: s.timezone,
    'Flight Name': $('#flightName').value.trim(),
    'Project / Job': $('#project').value.trim(),
    'Start Time (Local)': $('#startLocal').value ? new Date($('#startLocal').value).toISOString() : new Date().toISOString(),
    'Takeoff Lat': parseFloat($('#lat').value) || '',
    'Takeoff Lon': parseFloat($('#lon').value) || ''
  };
  if(!item['Flight Name']) return alert('Enter Flight Name');
  pushQueue(item); log('Queued START');
});

$('#queueEnd').addEventListener('click', ()=>{
  const s = load();
  const item = {
    kind: 'end',
    provider: s.provider,
    Timezone: s.timezone,
    'Flight Name': $('#flightNameEnd').value.trim(),
    'End Time (Local)': $('#endLocal').value ? new Date($('#endLocal').value).toISOString() : new Date().toISOString()
  };
  if(!item['Flight Name']) return alert('Enter Flight Name');
  pushQueue(item); log('Queued END');
});

// --- Sync ---
$('#sync').addEventListener('click', syncQueue);

async function syncQueue(){
  const q = getQueue();
  if(!q.length) { log('Nothing to sync'); return; }
  const s = load();
  let sent=0, failed=0;
  for (const item of q){
    try{
      if (item.provider === 'microsoft'){
        await sendMicrosoft(item, s);
      } else {
        await sendGoogle(item, s);
      }
      sent++;
    }catch(e){
      log('Sync error: ' + e); failed++; break;
    }
  }
  if (failed===0){ setQueue([]); }
  log(`Sync complete. Sent=${sent}, failed=${failed}`);
}

// --- Google path (Apps Script) ---
async function sendGoogle(item, s){
  if(!s.googleEndpoint) throw 'Missing Google endpoint';
  const payload = { ...item };
  // Attach email if known (from auth)
  if (s.userEmail) payload['User Email'] = s.userEmail;
  const r = await fetch(s.googleEndpoint, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  if(!r.ok) throw `Apps Script HTTP ${r.status}`;
}

// --- Microsoft path (Graph) ---
async function sendMicrosoft(item, s){
  if(!s.msDriveItemId) throw 'Missing OneDrive driveItemId';
  if(!s.msTableName) throw 'Missing table name';
  if(!s.msAccessToken) throw 'Not signed in to Microsoft';

  // Map to row array following your sheet header order (minimal)
  const headers = [
    'Timestamp','Date','User Email','Flight Name','Pilot Name','Observer / VO','Project / Job',
    'Takeoff Lat','Takeoff Lon','Start Time (Local)','Start Wind (m/s)','Start Wind Dir (°)',
    'End Time (Local)','RTK Mode','Base Method','Drone Model','Aircraft ID / S/N','Payload',
    'Mission Type','Altitude AGL (m)','Speed (m/s)','Photos (#)','Max Height (m)',
    'Incidents / Anomalies','Notes','Storage Path'
  ];
  const nowISO = new Date().toISOString();
  const row = headers.map(h => item[h] ?? (h==='Timestamp'? nowISO : h==='User Email'? (load().userEmail||''): ''));

  const url = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(s.msDriveItemId)}/workbook/tables('${encodeURIComponent(s.msTableName)}')/rows/add`;
  const res = await fetch(url, {
    method:'POST',
    headers:{ 'Authorization':`Bearer ${s.msAccessToken}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ values:[row] })
  });
  if(!res.ok) throw `Graph add row failed ${res.status}`;
}

// --- Auth: Google ---
$('#btnGoogle').addEventListener('click', ()=>{
  google.accounts.id.initialize({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    callback: ({credential})=>{
      // decode minimal payload to show email (optional)
      try{
        const payload = JSON.parse(atob(credential.split('.')[1]));
        const s = load(); s.provider='google'; s.userEmail = payload.email || s.userEmail; save(s);
        $('#whoami').textContent = `Signed in as ${s.userEmail || 'Google user'}`;
        $('#provider').value='google'; toggleProviderSections();
        log('Google sign-in OK');
      }catch(e){ log('Google sign-in error: ' + e); }
    }
  });
  google.accounts.id.prompt(); // popup
});

// --- Auth: Microsoft ---
$('#btnMicrosoft').addEventListener('click', async ()=>{
  const msalConfig = { auth: { clientId: CONFIG.MS_CLIENT_ID, redirectUri: location.origin } };
  const msalInstance = new msal.PublicClientApplication(msalConfig);
  const scopes = ['Files.ReadWrite','User.Read','offline_access'];
  const resp = await msalInstance.loginPopup({ scopes });
  const tokenResp = await msalInstance.acquireTokenSilent({ scopes, account: resp.account });
  const s = load(); s.provider='microsoft'; s.msAccessToken = tokenResp.accessToken; s.userEmail = resp.account.username; save(s);
  $('#whoami').textContent = `Signed in as ${s.userEmail}`;
  $('#provider').value='microsoft'; toggleProviderSections();
  log('Microsoft sign-in OK');
});

// --- Settings UI wiring ---
$('#provider').addEventListener('change', toggleProviderSections);
$('#saveSettings').addEventListener('click', saveSettings);

// init
fillTimezones();
uiFromSettings();
