// app.js — Drone LogBook (queue + sync + toasts + auth already wired)
(() => {
  const CFG = window.APP_CONFIG;
  const AUTH = window.AUTH_CONFIG;

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
    btnSaveSettings: $("btn-save-settings"),
    logConsole: $("log-console"),
    queueCount: $("queue-count"),

    // flight log
    flightName: $("flight-name"),
    project: $("project"),
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
    get(name, fallback = null) {
      try {
        const raw = localStorage.getItem(k(name));
        return raw ? JSON.parse(raw) : fallback;
      } catch { return fallback; }
    },
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
    clearTimeout(toastTimer); toastTimer = setTimeout(()=> t.classList.remove("show"), 2000);
    log(msg);
  }

  // ---------- Utils ----------
  function setHidden(node, hidden) { node.classList.toggle("hidden", hidden); }
  function updateSignedInUI(text) { el.signedInAs.textContent = text || "Not signed in"; }
  function nowLocalForInput() {
    const d = new Date(); const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ---------- Settings ----------
  function loadSettings() {
    const provider = S.get("provider", "google");
    el.provider.value = provider || "google";
    el.googleEndpoint.value = S.get("google_endpoint", "") || "";
    setHidden(el.providerGoogle, provider !== "google");
    setHidden(el.providerMicrosoft, provider !== "microsoft");
  }

  function saveSettings() {
    const provider = el.provider.value || "google";
    S.set("provider", provider);
    S.set("google_endpoint", el.googleEndpoint.value.trim());
    setHidden(el.providerGoogle, provider !== "google");
    setHidden(el.providerMicrosoft, provider !== "microsoft");
    toast("Settings saved.", "ok");
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
            el.provider.value = "google";
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
          el.provider.value = "microsoft";
          setHidden(el.providerGoogle, true);
          setHidden(el.providerMicrosoft, false);
          toast("Microsoft sign-in OK.", "ok");
        })
        .catch(err => { console.error(err); alert("Microsoft sign-in failed."); });
    } catch (e) { console.error(e); alert("Microsoft sign-in error."); }
  }

  // ---------- Flight helpers ----------
  function collectCommonFields() {
    const browserTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return {
      userEmail: S.get("user_email", ""),
      timezone: browserTZ,
      flightName: el.flightName.value.trim(),
      project: el.project.value.trim(),
      startLocal: el.startLocal.value || "",
      endLocal: el.endLocal.value || "",
      takeoffLat: el.takeoffLat.value.trim(),
      takeoffLon: el.takeoffLon.value.trim(),
      notes: el.notes.value.trim(),
      driveType: el.driveType.value || "personal"
    };
  }

  function queueRecord(type) {
    const base = collectCommonFields();
    const rec = { ...base, type, timestamp: new Date().toISOString() };
    if (type === "start" && !rec.startLocal) rec.startLocal = nowLocalForInput();
    if (type === "end" && !rec.endLocal) rec.endLocal = nowLocalForInput();
    pushQueue(rec);
    toast(`Queued ${type} → ${rec.flightName || "(unnamed flight)"}`, "ok");
  }

  function useGPS() {
    if (!navigator.geolocation) { toast("GPS not available.", "warn"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        el.takeoffLat.value = pos.coords.latitude.toFixed(6);
        el.takeoffLon.value = pos.coords.longitude.toFixed(6);
        toast("GPS captured.", "ok");
      },
      () => toast("GPS error.", "warn"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  // ---------- Sync ----------
  async function syncNow() {
    const endpoint = (el.googleEndpoint.value || "").trim();
    if (!endpoint) { toast("Set Google endpoint in Settings.", "warn"); return; }
    const queue = getQueue();
    if (!queue.length) { toast("Nothing to sync.", "warn"); return; }

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queue)   // batch array
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

    el.provider?.addEventListener("change", (e) => {
      const v = e.target.value;
      setHidden(el.providerGoogle, v !== "google");
      setHidden(el.providerMicrosoft, v !== "microsoft");
    });

    el.btnNowStart?.addEventListener("click", () => { el.startLocal.value = nowLocalForInput(); });
    el.btnNowEnd?.addEventListener("click", () => { el.endLocal.value = nowLocalForInput(); });
    el.btnGPS?.addEventListener("click", useGPS);
    el.btnQueueStart?.addEventListener("click", () => queueRecord("start"));
    el.btnQueueEnd?.addEventListener("click", () => queueRecord("end"));
    el.btnSync?.addEventListener("click", syncNow);
    el.btnClearQueue?.addEventListener("click", () => { setQueue([]); toast("Local queue cleared.", "ok"); });
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
