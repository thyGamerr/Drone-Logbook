// app.js
// Drone LogBook — main app logic
// - Google sign-in via GIS (no CORS issues)
// - Settings stored in localStorage
// - Offline queue for start/end records
// - Sync to Google Apps Script Web App endpoint (POST JSON)
// - Microsoft hooks (placeholder)

(() => {
  const CONFIG = window.APP_CONFIG || {
    appName: "Drone LogBook",
    version: "1.0.0",
    defaultTimezone: "UTC",
    redirectUri: location.origin + location.pathname,
    storageKeyPrefix: "drone_logbook_",
  };

  const AUTH = window.AUTH_CONFIG || {
    google: { clientId: "", scopes: "openid email profile" },
    microsoft: { clientId: "", scopes: "openid email profile User.Read" },
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  const el = {
    // auth
    btnGoogle: $("btn-google"),
    btnMicrosoft: $("btn-microsoft"),
    signedInAs: $("signed-in-as"),

    // settings
    provider: $("provider"),
    timezone: $("timezone"),
    googleEndpoint: $("google-endpoint"),
    msDriveItem: $("ms-driveitem"),
    msTable: $("ms-table"),
    providerGoogle: $("provider-google"),
    providerMicrosoft: $("provider-microsoft"),
    btnSaveSettings: $("btn-save-settings"),

    // start
    startFlightName: $("start-flight-name"),
    startProject: $("start-project"),
    startTime: $("start-time"),
    btnNowStart: $("btn-now-start"),
    startLat: $("start-lat"),
    startLon: $("start-lon"),
    btnGPSStart: $("btn-gps-start"),
    btnQueueStart: $("btn-queue-start"),

    // end
    endFlightName: $("end-flight-name"),
    endTime: $("end-time"),
    btnNowEnd: $("btn-now-end"),
    btnQueueEnd: $("btn-queue-end"),

    // queue/sync
    btnShowQueue: $("btn-show-queue"),
    btnClearQueue: $("btn-clear-queue"),
    btnSync: $("btn-sync"),
    logConsole: $("log-console"),
  };

  // ---------- Storage helpers ----------
  const k = (name) => `${CONFIG.storageKeyPrefix}${name}`;

  const S = {
    get(name, fallback = null) {
      try {
        const raw = localStorage.getItem(k(name));
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    set(name, value) {
      localStorage.setItem(k(name), JSON.stringify(value));
    },
    remove(name) {
      localStorage.removeItem(k(name));
    },
  };

  // ---------- Logging ----------
  function log(line = "") {
    const ts = new Date().toLocaleTimeString();
    el.logConsole.textContent += `[${ts}] ${line}\n`;
    el.logConsole.scrollTop = el.logConsole.scrollHeight;
  }
  function toast(line) { log(line); }

  // ---------- UI helpers ----------
  function setHidden(elm, hidden) { elm.classList.toggle("hidden", hidden); }
  function updateSignedInUI(text) { el.signedInAs.textContent = text || "Not signed in"; }

  // ---------- Timezone ----------
  function populateTimezones() {
    const zones =
      (window.TIMEZONES && Array.isArray(window.TIMEZONES) && window.TIMEZONES) ||
      ["UTC","America/Vancouver","America/Los_Angeles","America/New_York","Europe/London","Europe/Paris","Asia/Tokyo","Australia/Sydney"];
    el.timezone.innerHTML = "";
    zones.forEach((z) => {
      const opt = document.createElement("option");
      opt.value = z; opt.textContent = z; el.timezone.appendChild(opt);
    });
    const saved = S.get("timezone");
    el.timezone.value = saved || CONFIG.defaultTimezone || "UTC";
  }

  function localNowForInput() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  // ---------- Settings ----------
  function loadSettings() {
    const provider = S.get("provider", "");
    el.provider.value = provider || "";

    const tz = S.get("timezone", CONFIG.defaultTimezone);
    el.timezone.value = tz;

    el.googleEndpoint.value = S.get("google_endpoint", "") || "";
    el.msDriveItem.value = S.get("ms_driveitem", "") || "";
    el.msTable.value = S.get("ms_table", "FlightLogTable") || "FlightLogTable";

    setHidden(el.providerGoogle, provider !== "google");
    setHidden(el.providerMicrosoft, provider !== "microsoft");
  }

  function saveSettings() {
    const provider = el.provider.value.trim();
    const tz = el.timezone.value.trim();

    S.set("provider", provider || "");
    S.set("timezone", tz || CONFIG.defaultTimezone);

    if (provider === "google") {
      S.set("google_endpoint", el.googleEndpoint.value.trim());
    } else if (provider === "microsoft") {
      S.set("ms_driveitem", el.msDriveItem.value.trim());
      S.set("ms_table", el.msTable.value.trim() || "FlightLogTable");
    }
    toast("Settings saved.");
    setHidden(el.providerGoogle, provider !== "google");
    setHidden(el.providerMicrosoft, provider !== "microsoft");
  }

  // ---------- Queue ----------
  function getQueue() { return S.get("queue", []); }
  function setQueue(arr) { S.set("queue", arr); }
  function addToQueue(item) {
    const q = getQueue(); q.push(item); setQueue(q);
    toast(`Queued: ${item.type} — ${item.flightName}`);
  }
  function clearQueue() { setQueue([]); toast("Queue cleared."); }
  function showQueue() {
    const q = getQueue(); if (!q.length) return toast("Queue is empty.");
    toast(`Queue (${q.length} item(s)):\n` + JSON.stringify(q, null, 2));
  }

  // ---------- GPS ----------
  function getGPSForStart() {
    if (!navigator.geolocation) return alert("Geolocation not supported in this browser.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        el.startLat.value = latitude.toFixed(6);
        el.startLon.value = longitude.toFixed(6);
        toast(`GPS acquired: ${el.startLat.value}, ${el.startLon.value}`);
      },
      (err) => alert("Failed to get GPS: " + err.message),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  // ---------- Google Sign-in (GIS) ----------
  function signInWithGoogle() {
    try {
      if (!window.google || !google.accounts || !google.accounts.oauth2) {
        alert("Google Identity Services SDK didn't load (check network or ad-blockers)."); return;
      }
      if (!AUTH.google.clientId) { alert("Missing Google Client ID in config.js"); return; }

      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: AUTH.google.clientId,
        scope: AUTH.google.scopes || "openid email profile",
        callback: (response) => {
          if (!response || !response.access_token) {
            console.error("Google sign-in: no access token", response);
            alert("Google sign-in failed (no token)."); return;
          }
          fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${response.access_token}` },
          })
            .then((r) => r.json())
            .then((profile) => {
              const email = profile.email || "";
              S.set("provider", "google");
              S.set("user_email", email);
              S.set("google_access_token", response.access_token);
              updateSignedInUI(`Signed in as ${email}`);
              el.provider.value = "google";
              setHidden(el.providerGoogle, false);
              setHidden(el.providerMicrosoft, true);
              toast("Google sign-in OK.");
            })
            .catch((e) => {
              console.error("Fetch profile failed", e);
              alert("Signed in, but failed to fetch Google profile.");
            });
        },
      });

      tokenClient.requestAccessToken({ prompt: "consent" });
    } catch (e) {
      console.error(e); alert("Google sign-in error (see console).");
    }
  }

  // ---------- Microsoft Sign-in (placeholder) ----------
  function signInWithMicrosoft() {
    S.set("provider", "microsoft");
    updateSignedInUI("Microsoft: sign-in pending setup");
    el.provider.value = "microsoft";
    setHidden(el.providerGoogle, true);
    setHidden(el.providerMicrosoft, false);
    toast("Microsoft sign-in not yet configured.");
  }

  // ---------- Create queue items ----------
  function queueStart() {
    const rec = {
      type: "start",
      timestamp: new Date().toISOString(),
      userEmail: S.get("user_email", ""),
      timezone: el.timezone.value || S.get("timezone") || CONFIG.defaultTimezone,
      flightName: el.startFlightName.value.trim(),
      project: el.startProject.value.trim(),
      startLocal: el.startTime.value,
      takeoffLat: el.startLat.value.trim(),
      takeoffLon: el.startLon.value.trim(),
    };
    if (!rec.flightName) return alert("Please enter a Flight Name.");
    if (!rec.startLocal) return alert("Please set Start Time.");
    addToQueue(rec);
  }

  function queueEnd() {
    const rec = {
      type: "end",
      timestamp: new Date().toISOString(),
      userEmail: S.get("user_email", ""),
      timezone: el.timezone.value || S.get("timezone") || CONFIG.defaultTimezone,
      flightName: el.endFlightName.value.trim(),
      endLocal: el.endTime.value,
    };
    if (!rec.flightName) return alert("Please enter the Flight Name to end.");
    if (!rec.endLocal) return alert("Please set End Time.");
    addToQueue(rec);
  }

  // ---------- Sync ----------
  async function syncQueue() {
    const provider = S.get("provider", el.provider.value || "");
    const queue = getQueue();
    if (!queue.length) return toast("Nothing to sync — queue is empty.");

    if (provider === "google") {
      const endpoint = el.googleEndpoint.value.trim() || S.get("google_endpoint", "");
      if (!endpoint) return alert("Enter Google Endpoint (Apps Script Web App URL) in Settings.");
      let success = 0;
      for (const item of queue) {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          success++;
          toast(`Synced → Google: ${item.type} / ${item.flightName}`);
        } catch (e) {
          console.error("Google sync failed", e);
          toast(`Failed → Google: ${item.type} / ${item.flightName} — ${e.message}`);
        }
      }
      if (success === queue.length) { clearQueue(); toast("All items synced to Google."); }
      else { toast("Some items failed. They remain in the queue."); }
      return;
    }

    if (provider === "microsoft") {
      alert("Microsoft sync not yet implemented.");
      return;
    }

    alert("Choose a provider in Settings (Google or Microsoft).");
  }

  // ---------- Event bindings (safe) ----------
  function bindEvents() {
    const on = (elem, evt, fn) => { if (elem) elem.addEventListener(evt, fn); };

    // sign-in
    on(el.btnGoogle, "click", signInWithGoogle);
    on(el.btnMicrosoft, "click", signInWithMicrosoft);

    // settings
    on(el.btnSaveSettings, "click", saveSettings);
    on(el.provider, "change", (e) => {
      const v = e.target.value;
      setHidden(el.providerGoogle, v !== "google");
      setHidden(el.providerMicrosoft, v !== "microsoft");
    });

    // start
    on(el.btnNowStart, "click", () => (el.startTime.value = localNowForInput()));
    on(el.btnGPSStart, "click", getGPSForStart);
    on(el.btnQueueStart, "click", queueStart);

    // end
    on(el.btnNowEnd, "click", () => (el.endTime.value = localNowForInput()));
    on(el.btnQueueEnd, "click", queueEnd);

    // queue/sync
    on(el.btnShowQueue, "click", showQueue);
    on(el.btnClearQueue, "click", clearQueue);
    on(el.btnSync, "click", syncQueue);
  }

  // ---------- Init ----------
  function init() {
    populateTimezones();
    loadSettings();

    const email = S.get("user_email", "");
    updateSignedInUI(email ? `Signed in as ${email}` : "Not signed in");

    el.startTime.value = localNowForInput();
    el.endTime.value = "";

    bindEvents();
    log(`${CONFIG.appName} v${CONFIG.version} ready.`);
    if (!navigator.onLine) log("You are offline. Queue entries and sync when back online.");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
