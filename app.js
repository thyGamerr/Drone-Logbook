// app.js — Drone LogBook (Easy Mode: direct Google Sheets sync)

(() => {
  const CONFIG = window.APP_CONFIG;
  const AUTH = window.AUTH_CONFIG;

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    // auth
    btnGoogle: $("btn-google"),
    btnMicrosoft: $("btn-microsoft"),
    signedInAs: $("signed-in-as"),

    // settings
    provider: $("provider"),
    timezone: $("timezone"),
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

  // ---------- Storage ----------
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
  const toast = log;

  // ---------- UI helpers ----------
  function setHidden(node, hidden) {
    node.classList.toggle("hidden", hidden);
  }
  function updateSignedInUI(text) {
    el.signedInAs.textContent = text || "Not signed in";
  }

  // ---------- Timezones ----------
  function populateTimezones() {
    const zones =
      (window.TIMEZONES && Array.isArray(window.TIMEZONES) && window.TIMEZONES) ||
      ["UTC", "America/Vancouver", "America/Los_Angeles", "America/New_York", "Europe/London"];
    el.timezone.innerHTML = "";
    for (const z of zones) {
      const opt = document.createElement("option");
      opt.value = z;
      opt.textContent = z;
      el.timezone.appendChild(opt);
    }
    el.timezone.value = S.get("timezone", CONFIG.defaultTimezone);
  }
  function localNowForInput() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}`;
  }

  // ---------- Settings ----------
  function loadSettings() {
    const provider = S.get("provider", "");
    el.provider.value = provider || "";
    el.timezone.value = S.get("timezone", CONFIG.defaultTimezone);
    setHidden(el.providerGoogle, true);       // hidden in Easy Mode
    setHidden(el.providerMicrosoft, provider !== "microsoft"); // keep MS placeholder hidden by default
  }
  function saveSettings() {
    const provider = el.provider.value.trim();
    const tz = el.timezone.value.trim();
    S.set("provider", provider || "");
    S.set("timezone", tz || CONFIG.defaultTimezone);
    setHidden(el.providerGoogle, true);
    setHidden(el.providerMicrosoft, provider !== "microsoft");
    toast("Settings saved.");
  }

  // ---------- Queue ----------
  const getQueue = () => S.get("queue", []);
  const setQueue = (arr) => S.set("queue", arr);
  function addToQueue(item) {
    const q = getQueue();
    q.push(item);
    setQueue(q);
    toast(`Queued: ${item.type} — ${item.flightName}`);
  }
  function clearQueue() {
    setQueue([]);
    toast("Queue cleared.");
  }
  function showQueue() {
    const q = getQueue();
    if (!q.length) return toast("Queue is empty.");
    toast(`Queue (${q.length}):\n` + JSON.stringify(q, null, 2));
  }

  // ---------- GPS ----------
  function getGPSForStart() {
    if (!navigator.geolocation) return alert("Geolocation not supported.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        el.startLat.value = pos.coords.latitude.toFixed(6);
        el.startLon.value = pos.coords.longitude.toFixed(6);
        toast(`GPS: ${el.startLat.value}, ${el.startLon.value}`);
      },
      (err) => alert("GPS failed: " + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ---------- Google Sign-in (GIS) ----------
  function signInWithGoogle() {
    if (!window.google?.accounts?.oauth2) {
      return alert("Google Identity Services SDK didn't load.");
    }
    if (!AUTH.google.clientId) return alert("Missing Google Client ID in config.js");

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: AUTH.google.clientId,
      scope: AUTH.google.scopes,
      callback: (resp) => {
        if (!resp?.access_token) {
          console.error("No token", resp);
          return alert("Google sign-in failed.");
        }
        S.set("google_access_token", resp.access_token);
        // fetch profile
        fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${resp.access_token}` },
        })
          .then((r) => r.json())
          .then((profile) => {
            const email = profile.email || "";
            S.set("provider", "google");
            S.set("user_email", email);
            updateSignedInUI(`Signed in as ${email}`);
            el.provider.value = "google";
            setHidden(el.providerMicrosoft, true);
            toast("Google sign-in OK.");
          })
          .catch((e) => {
            console.error(e);
            alert("Signed in, but failed to fetch profile.");
          });
      },
    });

    tokenClient.requestAccessToken({ prompt: "consent" });
  }

  // ---------- Google Sheets helpers ----------
  const SHEET_NAME = "Flight Log";
  const HEADER = [
    "Timestamp (UTC)",
    "Timezone",
    "Flight Name",
    "Project / Job",
    "Start Time (Local)",
    "Takeoff Lat",
    "Takeoff Lon",
    "End Time (Local)"
  ];

  function gFetch(url, options = {}) {
    const token = S.get("google_access_token", "");
    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  async function ensureGoogleSheet() {
    let sheetId = S.get("google_sheet_id", "");
    if (sheetId) return sheetId;

    const email = S.get("user_email", "Me");
    // 1) Create spreadsheet with our tab name
    const createRes = await gFetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      body: JSON.stringify({
        properties: { title: `Drone LogBook (${email})` },
        sheets: [{ properties: { title: SHEET_NAME } }],
      }),
    });
    if (!createRes.ok) throw new Error(`Create spreadsheet failed: ${createRes.status}`);
    const created = await createRes.json();
    sheetId = created.spreadsheetId;

    // 2) Write header row
    const appendHeader = await gFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
        SHEET_NAME
      )}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        body: JSON.stringify({ values: [HEADER] }),
      }
    );
    if (!appendHeader.ok) throw new Error(`Write header failed: ${appendHeader.status}`);

    S.set("google_sheet_id", sheetId);
    toast("Created Google Sheet and added header.");
    return sheetId;
  }

  function recordToRow(rec) {
    // Map our queued JSON into a row that matches HEADER order
    return [
      new Date(rec.timestamp).toISOString(),
      rec.timezone || "",
      rec.flightName || "",
      rec.project || "",
      rec.startLocal || "",
      rec.takeoffLat || "",
      rec.takeoffLon || "",
      rec.endLocal || ""
    ];
  }

  async function syncQueueGoogle() {
    const queue = getQueue();
    if (!queue.length) return toast("Nothing to sync.");

    // Make sure signed in
    if (!S.get("google_access_token")) {
      alert("Please sign in with Google first.");
      return;
    }

    const sheetId = await ensureGoogleSheet();

    // Convert items to rows
    const rows = queue.map(recordToRow);

    const res = await gFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
        SHEET_NAME
      )}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        body: JSON.stringify({ values: rows }),
      }
    );

    if (!res.ok) {
      const msg = await res.text();
      console.error(msg);
      toast("Sync failed: " + msg);
      return;
    }

    toast(`Synced ${rows.length} row(s) to Google Sheets.`);
    clearQueue();
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
      endLocal: "", // filled on end
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

  // ---------- Sync (router) ----------
  async function syncQueue() {
    const provider = S.get("provider", el.provider.value || "google") || "google";
    if (provider !== "google") {
      alert("Microsoft sync not implemented yet. Choose Google.");
      return;
    }
    try {
      await syncQueueGoogle();
    } catch (e) {
      console.error(e);
      toast("Sync error: " + e.message);
    }
  }

  // ---------- Bind events ----------
  function bindEvents() {
    el.btnGoogle?.addEventListener("click", signInWithGoogle);
    el.btnMicrosoft?.addEventListener("click", () => alert("Microsoft sign-in not yet implemented."));
    el.btnSaveSettings?.addEventListener("click", saveSettings);

    el.provider?.addEventListener("change", (e) => {
      const v = e.target.value;
      setHidden(el.providerMicrosoft, v !== "microsoft");
    });

    el.btnNowStart?.addEventListener("click", () => (el.startTime.value = localNowForInput()));
    el.btnGPSStart?.addEventListener("click", getGPSForStart);
    el.btnQueueStart?.addEventListener("click", queueStart);

    el.btnNowEnd?.addEventListener("click", () => (el.endTime.value = localNowForInput()));
    el.btnQueueEnd?.addEventListener("click", queueEnd);

    el.btnShowQueue?.addEventListener("click", showQueue);
    el.btnClearQueue?.addEventListener("click", clearQueue);
    el.btnSync?.addEventListener("click", syncQueue);
  }

  // ---------- Init ----------
  function init() {
    populateTimezones();
    loadSettings();
    el.startTime.value = localNowForInput();
    el.endTime.value = "";

    const email = S.get("user_email", "");
    updateSignedInUI(email ? `Signed in as ${email}` : "Not signed in");

    // Hide Google endpoint settings in Easy Mode
    setHidden(el.providerGoogle, true);

    bindEvents();
    log(`${CONFIG.appName} v${CONFIG.version} ready.`);
    if (!navigator.onLine) log("You are offline. Queue items; sync when back online.");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
