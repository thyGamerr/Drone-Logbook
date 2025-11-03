// app.js — Drone LogBook v1.1.1 (endpoint hidden + validate + shared/personal + Open-Meteo)
(() => {
  const CFG = window.APP_CONFIG || { appName:"Drone LogBook", version:"1.1.1", storageKeyPrefix:"drone_logbook_" };
  const AUTH = window.AUTH_CONFIG || {};

  // 🔒 Fixed backend endpoint (hidden from users)
  const FIXED_GOOGLE_ENDPOINT = "https://script.google.com/macros/s/AKfycbyk_fdk16qFnp62TRWovuoEhp8aj-iLvmeiXCVDx4vNmuJp-LUU1gO-RtTzIXQy2mTk/exec";

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    // auth + settings
    btnGoogle: $("btn-google"),
    btnMicrosoft: $("btn-microsoft"),
    signedInAs: $("signed-in-as"),
    provider: $("provider"),
    providerGoogle: $("provider-google"),
    providerMicrosoft: $("provider-microsoft"),
    googleEndpoint: $("google-endpoint"),
    targetSheetId: $("target-sheet-id"),
    btnValidateLink: $("btn-validate-link"),
    validateStatus: $("validate-status"),
    btnSaveSettings: $("btn-save-settings"),
    logConsole: $("log-console"),
    queueCount: $("queue-count"),

    // flight log
    flightName: $("flight-name"),
    project: $("project"),
    pilotName: $("pilot-name"),
    observer: $("observer"),
    droneModel: $("drone-model"),
    aircraftId: $("aircraft-id"),
    payload: $("payload"),
    missionType: $("mission-type"),
    rtkMode: $("rtk-mode"),
    airspaceMethod: $("airspace-method"),
    startWind: $("start-wind"),
    startWindDir: $("start-wind-dir"),
    baseM: $("base-m"),
    startLocal: $("start-local"),
    endLocal: $("end-local"),
    takeoffLat: $("takeoff-lat"),
    takeoffLon: $("takeoff-lon"),
    notes: $("notes"),
    driveType: $("drive-type"),

    // controls
    btnNowStart: $("btn-now-start"),
    btnNowEnd: $("btn-now-end"),
    btnGPS: $("btn-gps"),
    btnQueueStart: $("btn-queue-start"),
    btnQueueEnd: $("btn-queue-end"),
    btnSync: $("btn-sync"),
    btnClearQueue: $("btn-clear-queue"),

    toast: $("toast"),
    driveHelp: $("drive-help")
  };

  // ---------- Storage ----------
  const k = (name) => `${CFG.storageKeyPrefix}${name}`;
  const S = {
    get(name, fallback = null) { try { const raw = localStorage.getItem(k(name)); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } },
    set(name, value) { localStorage.setItem(k(name), JSON.stringify(value)); },
    remove(name) { localStorage.removeItem(k(name)); }
  };

  // Queue
  const QKEY = "queue";
  const getQueue = () => S.get(QKEY, []);
  const setQueue = (arr) => { S.set(QKEY, arr); updateQueueCount(); };
  const pushQueue = (item) => { const q = getQueue(); q.push(item); setQueue(q); };
  function updateQueueCount() { if (el.queueCount) el.queueCount.textContent = String(getQueue().length); }

  // ---------- Logging / Toast ----------
  function log(line = "") {
    const ts = new Date().toLocaleTimeString();
    el.logConsole.textContent += `[${ts}] ${line}\n`;
    el.logConsole.scrollTop = el.logConsole.scrollHeight;
  }
  let toastTimer = null;
  function toast(msg, type = "ok") {
    const t = el.toast; if (!t) return;
    t.className = ""; t.textContent = msg; t.classList.add("show"); if (type) t.classList.add(type);
    clearTimeout(toastTimer); toastTimer = setTimeout(()=> t.classList.remove("show"), 2200);
    log(msg);
  }

  // ---------- Utils ----------
  function setHidden(node, hidden) { node?.classList?.toggle("hidden", hidden); }
  function updateSignedInUI(text) { if (el.signedInAs) el.signedInAs.textContent = text || "Not signed in"; }
  function nowLocalForInput() {
    const d = new Date(); const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function parseSheetOrFolder(input) {
    const s = (input || "").trim(); if (!s) return {};
    const mSheet = s.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (mSheet) return { sheetId: mSheet[1] };
    const mFolder = s.match(/drive\/folders\/([a-zA-Z0-9-_]+)/);
    if (mFolder) return { folderId: mFolder[1] };
    if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return { sheetId: s }; // raw id
    return {};
  }

  // ---------- Settings ----------
  function loadSettings() {
    const provider = S.get("provider", "google");
    if (el.provider) el.provider.value = provider || "google";
    if (el.googleEndpoint) el.googleEndpoint.value = FIXED_GOOGLE_ENDPOINT; // keep in sync
    S.set("google_endpoint", FIXED_GOOGLE_ENDPOINT);
    const savedTarget = S.get("target_link", "") || "";
    if (el.targetSheetId) el.targetSheetId.value = savedTarget;
    setHidden(el.providerGoogle, provider !== "google");
    setHidden(el.providerMicrosoft, provider !== "microsoft");
    resetValidateStatus();
    updateDriveHelp();
  }

  function saveSettings() {
    const provider = el.provider?.value || "google";
    S.set("provider", provider);
    S.set("google_endpoint", FIXED_GOOGLE_ENDPOINT);
    if (el.targetSheetId) S.set("target_link", el.targetSheetId.value.trim());
    setHidden(el.providerGoogle, provider !== "google");
    setHidden(el.providerMicrosoft, provider !== "microsoft");
    toast("Settings saved.", "ok");
  }

  function updateDriveHelp() {
    const v = el.driveType?.value || "personal";
    if (!el.driveHelp) return;
    el.driveHelp.innerHTML = (v === "personal")
      ? `Personal → saves to <b>your</b> My Drive (no link needed).`
      : `Shared → paste a Shared-Drive <b>folder</b> or <b>Sheet</b> link in Settings.`;
  }

  function resetValidateStatus() {
    if (el.validateStatus) {
      el.validateStatus.textContent = "Not validated";
      el.validateStatus.className = "pill muted";
      el.validateStatus.style.color = ""; el.validateStatus.style.borderColor = "";
    }
  }
  function setValidateOK(text) {
    if (el.validateStatus) {
      el.validateStatus.textContent = text || "Valid ✓";
      el.validateStatus.className = "pill";
      el.validateStatus.style.color = "var(--ok)";
      el.validateStatus.style.borderColor = "rgba(34,197,94,.4)";
    }
  }
  function setValidateErr(text) {
    if (el.validateStatus) {
      el.validateStatus.textContent = text || "Invalid";
      el.validateStatus.className = "pill";
      el.validateStatus.style.color = "var(--err)";
      el.validateStatus.style.borderColor = "rgba(239,68,68,.4)";
    }
  }

  // ---------- Sign-in (Google) ----------
  function signInWithGoogle() {
    try {
      if (!window.google?.accounts?.oauth2) { alert("Google Identity Services SDK didn't load."); return; }
      const clientId = AUTH.google?.clientId; if (!clientId) { alert("Missing Google Client ID in config."); return; }
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: AUTH.google.scopes || "openid email profile",
        callback: (response) => {
          if (!response?.access_token) { alert("Google sign-in failed (no token)."); return; }
          fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${response.access_token}` }
          })
          .then(r => r.json())
          .then(profile => {
            const email = profile.email || "";
            S.set("provider", "google");
            S.set("user_email", email);
            S.set("google_access_token", response.access_token);
            updateSignedInUI(`Signed in as ${email}`);
            if (el.provider) el.provider.value = "google";
            setHidden(el.providerGoogle, false);
            setHidden(el.providerMicrosoft, true);
            toast("Google sign-in OK.", "ok");
          })
          .catch(()=> alert("Signed in, but failed to fetch Google profile."));
        }
      });
      tokenClient.requestAccessToken({ prompt: "consent" });
    } catch (e) { console.error(e); alert("Google sign-in error."); }
  }

  // ---------- Microsoft placeholder ----------
  function signInWithMicrosoft() { alert("Microsoft sign-in is coming soon."); }

  // ---------- Open-Meteo ----------
  async function fetchWind(lat, lon) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m`;
      const res = await fetch(url);
      const data = await res.json();
      const ws = data?.current?.wind_speed_10m;
      const wd = data?.current?.wind_direction_10m;
      if (typeof ws === "number" && typeof wd === "number") {
        if (el.startWind) el.startWind.value = ws.toFixed(1);
        if (el.startWindDir) el.startWindDir.value = Math.round(wd);
        toast(`Wind ${ws.toFixed(1)} m/s @ ${Math.round(wd)}°`, "ok");
      } else {
        toast("No wind data received.", "warn");
      }
    } catch { toast("Wind fetch failed.", "warn"); }
  }

  // ---------- Flight helpers ----------
  function collectCommonFields() {
    const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return {
      userEmail: S.get("user_email", ""),
      timezone: browserTZ,
      flightName: el.flightName?.value.trim() || "",
      project: el.project?.value.trim() || "",
      pilotName: el.pilotName?.value.trim() || "",
      observer: el.observer?.value.trim() || "",
      droneModel: el.droneModel?.value.trim() || "",
      aircraftId: el.aircraftId?.value.trim() || "",
      payload: el.payload?.value.trim() || "",
      missionType: el.missionType?.value.trim() || "",
      rtkMode: el.rtkMode?.value.trim() || "",
      airspaceMethod: el.airspaceMethod?.value.trim() || "",
      startWind: el.startWind?.value.trim() || "",
      startWindDir: el.startWindDir?.value.trim() || "",
      baseM: el.baseM?.value.trim() || "",
      startLocal: el.startLocal?.value || "",
      endLocal: el.endLocal?.value || "",
      takeoffLat: el.takeoffLat?.value.trim() || "",
      takeoffLon: el.takeoffLon?.value.trim() || "",
      notes: el.notes?.value.trim() || "",
      driveType: el.driveType?.value || "personal"
    };
  }

  function queueRecord(type) {
    const base = collectCommonFields();
    const rec = { ...base, type, timestamp: new Date().toISOString() };
    if (type === "start" && !rec.startLocal) rec.startLocal = nowLocalForInput();
    if (type === "end"   && !rec.endLocal)   rec.endLocal   = nowLocalForInput();
    if (type === "start" && rec.takeoffLat && rec.takeoffLon && !rec.startWind) {
      fetchWind(rec.takeoffLat, rec.takeoffLon).catch(()=>{});
    }
    pushQueue(rec);
    toast(`Queued ${type} → ${rec.flightName || "(unnamed flight)"}`, "ok");
  }

  function useGPS() {
    if (!navigator.geolocation) { toast("GPS not available.", "warn"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (el.takeoffLat) el.takeoffLat.value = pos.coords.latitude.toFixed(6);
        if (el.takeoffLon) el.takeoffLon.value = pos.coords.longitude.toFixed(6);
        toast("GPS captured.", "ok");
      },
      () => toast("GPS error.", "warn"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  // ---------- Validate Link ----------
  async function validateLink() {
    resetValidateStatus();
    const endpoint = FIXED_GOOGLE_ENDPOINT;

    const linkInfo = parseSheetOrFolder(el.targetSheetId?.value);
    if (!linkInfo.sheetId && !linkInfo.folderId) {
      toast("Paste a Sheet URL/ID or a Shared Drive folder URL.", "warn");
      setValidateErr("Invalid link");
      return;
    }

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ _probe: true, ...linkInfo }])
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        setValidateOK(linkInfo.sheetId ? "Sheet OK ✓" : "Folder OK ✓");
        toast("Link validated.", "ok");
      } else {
        setValidateErr(data?.error || "Probe failed");
        toast(`Validation failed: ${data?.error || res.status}`, "err");
      }
    } catch {
      setValidateErr("Network error");
      toast("Network error during validation.", "err");
    }
  }

  // ---------- Sync ----------
  async function syncNow() {
    const endpoint = FIXED_GOOGLE_ENDPOINT;

    const queue = getQueue();
    if (!queue.length) { toast("Nothing to sync.", "warn"); return; }

    const linkInfo = parseSheetOrFolder(el.targetSheetId?.value);
    const isShared = (el.driveType?.value === "shared");
    if (isShared && !linkInfo.sheetId && !linkInfo.folderId) {
      toast("Shared selected → paste a Sheet or Shared-Drive folder link in Settings.", "warn");
      return;
    }

    const payload = queue.map(item => ({
      ...item,
      ...(isShared && linkInfo.sheetId ? { targetSheetId: linkInfo.sheetId } : {}),
      ...(isShared && linkInfo.folderId ? { targetFolderId: linkInfo.folderId } : {})
    }));

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok !== false) {
        setQueue([]);
        toast("Synced successfully ✅", "ok");
      } else {
        toast(`Failed to sync: ${data?.error || res.status}`, "err");
      }
    } catch {
      toast("Network error during sync.", "err");
    }
  }

  // ---------- Events ----------
  function bindEvents() {
    el.btnGoogle?.addEventListener("click", signInWithGoogle);
    el.btnMicrosoft?.addEventListener("click", signInWithMicrosoft);
    el.btnSaveSettings?.addEventListener("click", saveSettings);
    el.btnValidateLink?.addEventListener("click", validateLink);

    el.provider?.addEventListener("change", (e) => {
      const v = e.target.value;
      setHidden(el.providerGoogle, v !== "google");
      setHidden(el.providerMicrosoft, v !== "microsoft");
    });

    el.driveType?.addEventListener("change", updateDriveHelp);

    el.btnNowStart?.addEventListener("click", async () => {
      if (el.startLocal) el.startLocal.value = nowLocalForInput();
      const lat = el.takeoffLat?.value?.trim();
      const lon = el.takeoffLon?.value?.trim();
      if (lat && lon && !(el.startWind?.value)) await fetchWind(lat, lon);
    });
    el.btnNowEnd?.addEventListener("click", () => { if (el.endLocal) el.endLocal.value = nowLocalForInput(); });
    el.btnGPS?.addEventListener("click", useGPS);
    el.btnQueueStart?.addEventListener("click", () => queueRecord("start"));
    el.btnQueueEnd?.addEventListener("click", () => queueRecord("end"));
    el.btnSync?.addEventListener("click", syncNow);
    el.btnClearQueue?.addEventListener("click", () => { setQueue([]); toast("Local queue cleared.", "ok"); });

    el.targetSheetId?.addEventListener("input", resetValidateStatus);
  }

  function init() {
    loadSettings();
    const email = S.get("user_email", "");
    updateSignedInUI(email ? `Signed in as ${email}` : "Not signed in");
    updateQueueCount();
    bindEvents();
    log(`${CFG.appName} v${CFG.version} ready.`);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
