/***** CONFIG *****/
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzpsBfXvuAoB2BDoRjMI2tYPpfiowiMGvFqh4iHorFbp_hN004efk6d2gFON_bCiTg/exec';
const LS_KEY = 'flightQueue_v3';

/***** DOM + UX HELPERS *****/
const $ = (s) => document.querySelector(s);
const nowIso = () => new Date().toISOString();
const safeNum = (v) => (v === '' || v == null ? '' : Number(v));
function setValue(id, v){ const el = $(`#${id}`); if (el) el.value = v; }
function getValue(id){ const el = $(`#${id}`); return el ? el.value : ''; }
function setText(id, v){ const el = $(`#${id}`); if (el) el.textContent = v; }
function on(id, ev, fn){ const el = $(`#${id}`); if (el) el.addEventListener(ev, fn); }
function toast(msg){ const t=$('#toast'); if(!t) return alert(msg); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); }

/***** QUEUE *****/
function readQueue(){ try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function writeQueue(a){ localStorage.setItem(LS_KEY, JSON.stringify(a || [])); setText('queueCount', String((a || []).length)); }

/***** GOOGLE SIGN-IN *****/
window.currentUserEmail = '';
window.handleCredentialResponse = (response) => {
  try {
    const base64Url = response.credential.split('.')[1];
    const base64 = base64Url.replace(/-/g,'+').replace(/_/g,'/');
    const payload = JSON.parse(atob(base64));
    window.currentUserEmail = payload.email || '';
    setValue('clientEmail', window.currentUserEmail);
    setText('signedInAs', window.currentUserEmail ? `Signed in as: ${window.currentUserEmail}` : 'Not signed in');
    $('#signOutBtn').style.display = window.currentUserEmail ? 'inline-block' : 'none';
    toast(window.currentUserEmail ? `Signed in: ${window.currentUserEmail}` : 'Sign-in failed');
  } catch { toast('Sign-in parse error'); }
};
function signOut(){
  window.currentUserEmail = '';
  setValue('clientEmail','');
  setText('signedInAs','Not signed in');
  $('#signOutBtn').style.display = 'none';
  toast('Signed out locally');
}

/***** SHARED DRIVE URL → ID *****/
function extractIdFromUrlOrId(input) {
  if (!input) return '';
  const trimmed = input.trim();
  // If they pasted a raw ID, return it
  if (/^[A-Za-z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  // Common Drive URL patterns
  const m = trimmed.match(/\/folders\/([A-Za-z0-9_-]{20,})/);
  if (m) return m[1];
  // Also accept ?id=... style
  const m2 = trimmed.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  if (m2) return m2[1];
  return '';
}

/***** FORM *****/
function collectForm(){
  return {
    flightName: getValue('flightName').trim(),
    project: getValue('project').trim(),
    startTime: getValue('startTime').trim(),
    endTime: getValue('endTime').trim(),
    lat: getValue('lat') ? safeNum(getValue('lat')) : '',
    lon: getValue('lon') ? safeNum(getValue('lon')) : '',
    notes: getValue('notes').trim(),
    driveType: (getValue('driveType') || 'shared').toLowerCase(),
    clientEmail: (getValue('clientEmail') || window.currentUserEmail || '').trim(),
    targetDriveId: extractIdFromUrlOrId(getValue('sharedDriveUrl'))
  };
}

/***** NETWORK *****/
async function postFlightLog(log){
  const payload = {
    flightName: log.flightName || '',
    project: log.project || '',
    startTime: log.startTime || '',
    endTime: log.endTime || '',
    lat: typeof log.lat === 'number' ? log.lat : '',
    lon: typeof log.lon === 'number' ? log.lon : '',
    notes: log.notes || '',
    driveType: (log.driveType || 'shared').toLowerCase(),
    clientEmail: log.clientEmail || '',
    targetDriveId: (log.driveType || 'shared').toLowerCase() === 'shared' ? (log.targetDriveId || '') : ''
  };

  const resp = await fetch(WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });

  try {
    const data = await resp.json();
    if (data && data.ok) return { ok:true, data };
    return { ok:false, error:data?.error || `HTTP ${resp.status}` };
  } catch {
    return resp.ok ? { ok:true, data:null } : { ok:false, error:`HTTP ${resp.status}` };
  }
}

/***** ACTIONS *****/
function setStartNow(){ setValue('startTime', nowIso()); toast('Start set'); }
function setEndNow(){ setValue('endTime', nowIso()); toast('End set'); }
function queueCurrentForm(){
  const entry = collectForm();
  if (!entry.flightName) return toast('Flight Name required');
  if (entry.driveType === 'shared' && !entry.targetDriveId) return toast('Paste a Shared Drive/Folder URL or ID');
  const q = readQueue(); q.push(entry); writeQueue(q); toast('Added to queue');
}
async function syncQueue(){
  const btn = $('#btnSync'); if (btn) btn.disabled = true;
  const q = readQueue(); if (!q.length){ toast('Queue empty'); if (btn) btn.disabled=false; return; }
  for (let i=0;i<q.length;i++){
    const r = await postFlightLog(q[i]);
    if (!r.ok){ console.error('Sync error at item', i, r); toast('Sync failed — check Apps Script Executions'); if (btn) btn.disabled=false; return; }
  }
  writeQueue([]); toast('Synced successfully'); if (btn) btn.disabled=false;
}
function clearQueue(){ if (confirm('Clear local queue?')){ writeQueue([]); toast('Queue cleared'); } }
async function sendTest(){
  const driveType = (getValue('driveType') || 'shared').toLowerCase();
  const test = {
    flightName:'Test Flight 001',
    project:'Demo',
    startTime: nowIso(),
    endTime: new Date(Date.now()+600000).toISOString(),
    lat: 48.3701, lon: -123.7356,
    notes:'Hello from client',
    driveType,
    clientEmail: (window.currentUserEmail || ''),
    targetDriveId: driveType === 'shared' ? extractIdFromUrlOrId(getValue('sharedDriveUrl')) : ''
  };
  if (driveType === 'shared' && !test.targetDriveId) return toast('Paste a Shared Drive/Folder URL or ID first');
  const r = await postFlightLog(test);
  toast(r.ok ? '✅ Test row appended' : '❌ Test failed');
}

/***** INIT *****/
function init(){
  setValue('urlEcho', WEB_APP_URL);
  writeQueue(readQueue());

  on('btnStart','click', setStartNow);
  on('btnEnd','click', setEndNow);
  on('btnQueue','click', queueCurrentForm);
  on('btnSync','click', syncQueue);
  on('btnClearQueue','click', clearQueue);
  on('sendTest','click', sendTest);
  on('signOutBtn','click', signOut);

  $('#driveType').addEventListener('change', ()=>{
    const shared = $('#driveType').value === 'shared';
    $('#sharedDriveUrl').disabled = !shared;
  });
}

if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }
