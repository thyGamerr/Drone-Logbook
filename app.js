// app.js — Drone LogBook v1.1.0 (Validate Link + Shared folder/Sheet + Open-Meteo wind)
(() => {
  const CFG = window.APP_CONFIG || { appName:"Drone LogBook", version:"1.1.0", storageKeyPrefix:"drone_logbook_" };
  const AUTH = window.AUTH_CONFIG || {};

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

    // flight controls
    btnNowStart: $("btn-now-start"),
    btnNowEnd: $("btn-now-end"),
    btnGPS: $("btn-gps"),
    btnQueueStart: $("btn-queue-start"),
    btnQueueEnd: $("btn-queue-end"),
    btnSync: $("btn-sync"),
    btnClearQueue: $("btn-clear-queue"),

    // toast
    toast: $("toast")
  };

  // ---------- Storage ----------
  const k = (name) => `${CFG.storageKeyPrefix}${name}`;
  const S = {
    get(name, fallback = null) { try { const raw = localStorage.getItem(k(name)); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } },
    set(name, value) { localStorage.setItem(k(name), JSON.stringify(value)); },
    remove(name) { localStorage.removeItem(k(name)); }
  };

  // Queue helpers
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

  // Parse either a Google Sheet URL/ID or a Drive folder URL -> { sheetId?, folderId? }
  function parseSheetOrFolder(input) {
    const s = (input || "").trim();
    if (!s) return {};
    const mSheet = s.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (mSheet) return { sheetId: mSheet[1] };
    const mFolder = s.match(/drive\/folders\/([a-zA-Z0-9-_]+)/);
    if (mFolder) return { folderId: mFolder[1] };
    if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return { sheetId: s };
    return {};
  }

  // ---------- Settings ----------
  function loadSettings() {
    const provider = S.get("provider", "google");
    if (el.provider) el.provider.value = provider || "google";
    if (el.googleEndpoint) el.googleEndpoint.value = S.get("google_endpoint", "") || "";
    const savedTarget = S.get("target_link", "") || "";
    if (el.targetSheetId) el.targetSheetId.value = savedTarget;
    setHidden(el.providerGoogle, provider !== "google");
    setHidden(el.providerMicrosoft, provider !== "microsoft");
    resetValidateStatus();
  }

  function saveSettings() {
    const provider = el.provider?.value || "google";
    S.set("provider", provider);
    S.set("google_endpoint", (el.googleEndpoint?.value || "").trim());
    if (el.targetSheetId) S.set("target_link", el.targetSheetId.value.trim());
    setHidden(el.providerGoogle, provider !== "google");
    setHidden(el.providerMicrosoft, provider !== "microsoft");
    toast("Settings saved.", "ok");
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

  // ---------- GOOGLE SIGN-IN ----------
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

  // ---------- MICROSOFT SIGN-IN (placeholder kept) ----------
  function signInWithMicrosoft() {
    try {
      const ms = AUTH.microsoft;
      if (!ms?.clientId || !ms?.tenantId) { alert("Microsoft config missing."); return; }
      if (!window.msal?.PublicClientApplication) { alert("MSAL Browser SDK didn't load."); return; }
      const msalInstance = new msal.PublicClientApplication({
        auth: { clientId: ms.clientId, authority: ms.authority, redirectUri: ms.redirectUri },
        cache: { cacheLocation: "sessionStorage", storeAuthStateInCookie: false }
      });
      const loginRequest = { scopes: ms.scopes, prompt: "select_account" };
      msalInstance.loginPopup(loginRequest)
        .then(loginResponse =>
          msalInstance.acquireTokenSilent({ account: loginResponse.account, scopes: ms.scopes })
            .catch(() => msalInstance.acquireTokenPopup({ scopes: ms.scopes }))
        )
        .then(tokenResponse => {
          const token = tokenResponse.accessToken;
          const account = tokenResponse.account;
          const email = account?.username || account?.idTokenClaims?.preferred_username || "";
          S.set("provider", "microsoft");
          S.set("user_email", email);
          S.set("ms_access_token", token);
          S.set("ms_account", { homeAccountId: account.homeAccountId });
          updateSignedInUI(`Signed in as ${email}`);
          if (el.provider) el.provider.value = "microsoft";
          setHidden(el.providerGoogle, true);
          setHidden(el.providerMicrosoft, false);
          toast("Microsoft sign-in OK.", "ok");
        })
        .catch(err => { console.error(err); alert("Microsoft sign-in failed."); });
    } catch (e) { console.error(e); alert("Microsoft sign-in error."); }
  }

  // ---------- Wind (Open-Meteo) ----------
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
    } catch (e) {
      console.error(e);
      toast("Wind fetch failed.", "warn");
    }
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

    // If starting and we have coordinates but no wind, auto-fetch
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
    const endpoint = (el.googleEndpoint?.value || "").trim();
    if (!endpoint) { toast("Set Google endpoint first.", "warn"); setValidateErr("No endpoint"); return; }

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
    } catch (e) {
      console.error(e);
      setValidateErr("Network error");
      toast("Network error during validation.", "err");
    }
  }

  // ---------- Sync ----------
  async function syncNow() {
    const endpoint = (el.googleEndpoint?.value || "").trim();
    if (!endpoint) { toast("Set Google endpoint in Settings.", "warn"); return; }

    const queue = getQueue();
    if (!queue.length) { toast("Nothing to sync.", "warn"); return; }

    const linkInfo = parseSheetOrFolder(el.targetSheetId?.value);
    const isShared = (el.driveType?.value === "shared");
    if (isShared && !linkInfo.sheetId && !linkInfo.folderId) {
      toast("Shared selected → paste a Sheet URL/ID or a Shared Drive folder URL in Settings.", "warn");
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
    } catch (e) {
      console.error(e);
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

    el.btnNowStart?.addEventListener("click", async () => {
      if (el.startLocal) el.startLocal.value = nowLocalForInput();
      // auto-wind if coords present
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

  // ---------- Init ----------
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
