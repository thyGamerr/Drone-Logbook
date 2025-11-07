/***** CONFIG *****/
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbypQst3AW88aybQfMSMXvax2RPR4E_-t_N6GmdJVfEMg5R8FdBeujsihxw8VSmEnRo3/exec';
const LS_KEY = 'flightQueue_v3'; // local queue key

/***** UTILITIES *****/
const $ = (sel) => document.querySelector(sel);
const nowIso = () => new Date().toISOString();
const safeNum = (v) => (v === '' || v === null || v === undefined) ? '' : Number(v);

/** safe DOM helpers (won't throw if element missing) **/
function setValue(id, val) { const el = $(`#${id}`); if (el) el.value = val; }
function getValue(id) { const el = $(`#${id}`); return el ? el.value : ''; }
function setText(id, val) { const el = $(`#${id}`); if (el) el.textContent = val; }
function on(id, evt, fn) { const el = $(`#${id}`); if (el) el.addEventListener(evt, fn); }

function toast(msg) {
  // You can style a #toast element if you have one; fallback to alert.
  const t = $('#toast');
  if (t) {
    t.textContent = msg;
    t.classList.remove('hide');
    t.classList.add('show');
    setTimeout(() => t.classList.add('hide'), 2000);
  } else {
    console.log('[Toast]', msg);
  }
}

/***** QUEUE *****/
function readQueue() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}
function writeQueue(arr) {
  localStorage.setItem(LS_KEY, JSON.stringify(arr || []));
  setText('queueCount', String((arr || []).length));
}

/***** FORM COLLECTOR *****/
function collectForm() {
  return {
    flightName: getValue('flightName').trim(),
    project: getValue('project').trim(),
    startTime: getValue('startTime').trim(),
    endTime: getValue('endTime').trim(),
    lat: getValue('lat') ? safeNum(getValue('lat')) : '',
    lon: getValue('lon') ? safeNum(getValue('lon')) : '',
    notes: getValue('notes').trim(),
    // Accepts 'shared' or 'personal'. If control missing, default to 'shared'.
    driveType: (getValue('driveType') || 'shared').toLowerCase(),
    // If you set window.currentUserEmail elsewhere, we pass it through.
    clientEmail: (getValue('clientEmail') || window.currentUserEmail || '').trim()
  };
}

/***** NETWORK POST *****/
async function postFlightLog(log) {
  const payload = {
    flightName: log.flightName || '',
    project: log.project || '',
    startTime: log.startTime || '',
    endTime: log.endTime || '',
    lat: typeof log.lat === 'number' ? log.lat : '',
    lon: typeof log.lon === 'number' ? log.lon : '',
    notes: log.notes || '',
    driveType: (log.driveType || 'shared').toLowerCase(),
    clientEmail: log.clientEmail || ''
  };

  try {
    const resp = await fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Even if CORS blocks reading JSON, the row may have appended.
    try {
      const data = await resp.json();
      if (data && data.ok) return { ok: true, data };
      return { ok: false, error: data?.error || `HTTP ${resp.status}` };
    } catch {
      return resp.ok ? { ok: true, data: null } : { ok: false, error: `HTTP ${resp.status}` };
    }
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/***** HIGH-LEVEL ACTIONS *****/
async function setStartNow() {
  setValue('startTime', nowIso());
  toast('Start time set');
}
async function setEndNow() {
  setValue('endTime', nowIso());
  toast('End time set');
}
function queueCurrentForm() {
  const entry = collectForm();
  if (!entry.flightName) {
    toast('Flight Name required');
    return;
  }
  const q = readQueue();
  q.push(entry);
  writeQueue(q);
  toast('Added to queue');
}
async function syncQueue() {
  const btn = $('#btnSync') || $('#syncBtn');
  if (btn) btn.disabled = true;

  const q = readQueue();
  if (!q.length) {
    toast('Queue is empty');
    if (btn) btn.disabled = false;
    return;
  }

  for (let i = 0; i < q.length; i++) {
    const r = await postFlightLog(q[i]);
    if (!r.ok) {
      console.error('Sync error at item', i, r);
      toast('Sync failed — check Apps Script Executions for doPost error');
      if (btn) btn.disabled = false;
      return;
    }
  }
  writeQueue([]); // clear only if all succeeded
  toast('Synced successfully');
  if (btn) btn.disabled = false;
}
function clearQueue() {
  if (confirm('Clear local queue?')) {
    writeQueue([]);
    toast('Queue cleared');
  }
}

/***** OPTIONAL: TEST BUTTON (kept isolated) *****/
async function sendTest() {
  const test = {
    flightName: 'Test Flight 001',
    project: 'Demo',
    startTime: nowIso(),
    endTime: new Date(Date.now() + 600000).toISOString(),
    lat: 48.3701,
    lon: -123.7356,
    notes: 'Hello from client',
    driveType: (getValue('driveType') || 'shared').toLowerCase(),
    clientEmail: (window.currentUserEmail || '')
  };
  const r = await postFlightLog(test);
  if (r.ok) toast('✅ Test row appended'); else toast('❌ Test failed');
}

/***** INIT: bind to whatever controls exist on your page *****/
function initApp() {
  // Update queue count on load
  writeQueue(readQueue());

  // Bind any found buttons (works even if some are missing)
  on('btnStart', 'click', setStartNow);
  on('btnEnd', 'click', setEndNow);
  on('btnQueue', 'click', queueCurrentForm);
  on('btnSync', 'click', syncQueue);
  on('syncBtn', 'click', syncQueue);        // alt ID if your site uses this
  on('btnClearQueue', 'click', clearQueue);
  on('btnClear', 'click', clearQueue);      // alt ID
  on('sendTest', 'click', sendTest);        // optional test button

  // If you have inputs with these IDs, nothing else needed:
  // flightName, project, startTime, endTime, lat, lon, notes, driveType, clientEmail
}

// Run after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
