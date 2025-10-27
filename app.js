// app.js (updated parts + safe full file)
// NOTE: Assumes window.APP_CONFIG and window.AUTH_CONFIG are loaded from config.js.

(() => {
  const CONFIG = window.APP_CONFIG || {
    appName: "Drone LogBook",
    version: "1.1.0",
    defaultTimezone: "UTC",
    storageKeyPrefix: "drone_logbook_",
  };

  const AUTH = window.AUTH_CONFIG || { google: { clientId: "", scopes: "openid email profile" } };

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
    pilotName: $("pilot-name"),
    observer: $("observer"),
    startWind: $("start-wind"),
    startWindDir: $("start-wind-dir"),
    rtkMode: $("rtk-mode"),
    droneModel: $("drone-model"),
    aircraftId: $("aircraft-id"),
    payload: $("payload"),
    missionType: $("mission-type"),
    airspaceMethod: $("airspace-method"),
    baseM: $("base-m"),
    notes: $("notes"),
    btnQueueStart: $("btn-queue-start"),

    // end
    endFlightName: $("end-flight-name"),
    endTime: $("end-time"),
    btnNowEnd: $("btn-now-end"),
    btnQueueEnd: $("btn-queue-end"),

    // queue + sync
    btnShowQueue: $("btn-show-queue"),
    btnClearQueue: $("btn-clear-queue"),
    btnSync: $("btn-sync"),
    logConsole: $("log-console"),
  };

  const k = (name) => `${CONFIG.storageKeyPrefix}${name}`;
  const S = {
    get(name, fallback = null) { try { const raw = localStorage.getItem(k(name)); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } },
    set(name, value) { localStorage.setItem(k(name), JSON.stringify(value)); },
    remove(name) { localStorage.removeItem(k(name)); },
  };

  function log(line = "") {
    const ts = new Date().toLocaleTimeString();
    if (el.logConsole) {
      el.logConsole.textContent += `[${ts}] ${line}\n`;
      el.logConsole.scrollTop = el.logConsole.scrollHeight;
    }
  }
  function toast(m) { log(m); }

  function setHidden(node, hidden) { node?.classList?.toggle("hidden", hidden); }
  function updateSignedInUI(text) { if (el.signedInAs) el.signedInAs.textContent = text || "Not signed in"; }

  function populateTimezones() {
    const zones = (window.TIMEZONES && Array.isArray(window.TIMEZONES) && window.TIMEZONES) ||
      ["UTC","America/Vancouver","America/Los_Angeles","America/New_York","Europe/London","Europe/Paris","Asia/Tokyo","Australia/Sydney"];
    el.timezone.innerHTML = "";
    zones.forEach((z) => {
      const opt = document.createElement("option");
      opt.value = z; opt.textContent = z;
      el.timezone.appendChild(opt);
    });
    const saved = S.get("timezone");
    el.timezone.value = saved || CONFIG.defaultTimezone || "UTC";
  }

  function localNowForInput() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function loadSettings() {
    const provider = S.get("provider", "");
    el.provider.value = provider || "";
    el.timezone.value = S.get("timezone", CONFIG.defaultTimezone);
    el.googleEndpoint.value = S.get("google_endpoint", "") || "";
    setHidden(el.providerGoogle, provider !== "google");
    setHidden(el.providerMicrosoft, provider !== "microsoft");
  }
  function saveSettings() {
    const provider = el.provider.value.trim();
    const tz = el.timezone.value.trim();
    S.set("provider", provider || "");
    S.set("timezone", tz || CONFIG.defaultTimezone);
    if (provider === "google") S.set("google_endpoint", el.googleEndpoint.value.trim());
    toast("Settings saved.");
    setHidden(el.providerGoogle, provider !== "google");
    setHidden(el.providerMicrosoft, provider !== "microsoft");
  }

  function getQueue() { return S.get("queue", []); }
  function setQueue(arr) { S.set("queue", arr); }
  function addToQueue(item) { const q = getQueue(); q.push(item); setQueue(q); toast(`Queued: ${item.type} — ${item.flightName}`); }
  function clearQueue() { setQueue([]); toast("Queue cleared."); }
  function showQueue() { const q = getQueue(); toast(q.length ? `Queue (${q.length})\n${JSON.stringify(q,null,2)}` : "Queue is empty."); }

  function getGPSForStart() {
    if (!navigator.geolocation) return alert("Geolocation not supported.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        el.startLat.value = pos.coords.latitude.toFixed(6);
        el.startLon.value = pos.coords.longitude.toFixed(6);
        toast(`GPS: ${el.startLat.value}, ${el.startLon.value}`);
      },
      (err) => alert("Failed to get GPS: " + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Google Sign-in (OAuth token client via popup)
  function signInWithGoogle() {
    try {
      if (!window.google?.accounts?.oauth2) {
        alert("Google Identity Services SDK didn't load.");
        return;
      }
      if (!AUTH.google.clientId) {
        alert("Missing Google Client ID in config.js");
        return;
      }
      const client = google.accounts.oauth2.initTokenClient({
        client_id: AUTH.google.clientId,
        scope: AUTH.google.scopes || "openid email profile",
        callback: async (tokenResp) => {
          if (!tokenResp?.access_token) { alert("Google sign-in failed (no token)."); return; }
          try {
            const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${tokenResp.access_token}` }
            });
            const profile = await r.json();
            const email = profile.email || "";
            S.set("provider","google");
            S.set("user_email", email);
            S.set("google_access_token", tokenResp.access_token);
            updateSignedInUI(`Signed in as ${email}`);
            el.provider.value = "google";
            setHidden(el.providerGoogle, false);
            setHidden(el.providerMicrosoft, true);
            toast("Google sign-in OK.");
          } catch (e) {
            console.error(e);
            alert("Signed in but failed to fetch user info.");
          }
        }
      });
      client.requestAccessToken({ prompt: "consent" });
    } catch (e) {
      console.error(e);
      alert("Google sign-in error (see console).");
    }
  }

  function signInWithMicrosoft() {
    S.set("provider","microsoft");
    updateSignedInUI("Microsoft sign-in not configured yet");
    el.provider.value = "microsoft";
    setHidden(el.providerGoogle, true);
    setHidden(el.providerMicrosoft, false);
    toast("Microsoft sign-in not yet configured.");
  }

  // Build a base record with common fields
  function baseRecord() {
    return {
      timestamp: new Date().toISOString(),
      timezone: el.timezone.value || S.get("timezone") || CONFIG.defaultTimezone,
      userEmail: S.get("user_email", ""),
      pilotName: el.pilotName?.value?.trim() || "",
      observer: el.observer?.value?.trim() || "",
      project: el.startProject?.value?.trim() || "",
      takeoffLat: el.startLat?.value?.trim() || "",
      takeoffLon: el.startLon?.value?.trim() || "",
      startWind: el.startWind?.value?.trim() || "",
      startWindDir: el.startWindDir?.value?.trim() || "",
      rtkMode: el.rtkMode?.value?.trim() || "",
      droneModel: el.droneModel?.value?.trim() || "",
      aircraftId: el.aircraftId?.value?.trim() || "",
      payload: el.payload?.value?.trim() || "",
      missionType: el.missionType?.value?.trim() || "",
      airspaceMethod: el.airspaceMethod?.value?.trim() || "",
      baseM: el.baseM?.value?.trim() || "",
      notes: el.notes?.value?.trim() || "",
    };
  }

  function queueStart() {
    const rec = {
      ...baseRecord(),
      type: "start",
      flightName: el.startFlightName.value.trim(),
      startLocal: el.startTime.value,
      endLocal: "", // not set yet
      date: (el.startTime.value || "").split("T")[0] || ""
    };
    if (!rec.flightName) return alert("Enter a Flight Name.");
    if (!rec.startLocal) return alert("Set Start Time.");
    addToQueue(rec);
  }

  function queueEnd() {
    const rec = {
      ...baseRecord(),
      type: "end",
      flightName: el.endFlightName.value.trim(),
      startLocal: "", // unchanged here
      endLocal: el.endTime.value,
      date: (el.endTime.value || "").split("T")[0] || ""
    };
    if (!rec.flightName) return alert("Enter the Flight Name to end.");
    if (!rec.endLocal) return alert("Set End Time.");
    addToQueue(rec);
  }

  async function syncQueue() {
    const provider = S.get("provider", el.provider.value || "");
    const queue = getQueue();
    if (!queue.length) return toast("Nothing to sync.");
    if (provider !== "google") {
      alert("Choose Google in Settings, and set your Apps Script URL.");
      return;
    }
    const endpoint = el.googleEndpoint.value.trim() || S.get("google_endpoint", "");
    if (!endpoint) return alert("Enter Apps Script Web App URL in Settings.");
    let success = 0;
    for (const item of queue) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        success++;
        toast(`Synced → Google: ${item.type} / ${item.flightName}`);
      } catch (e) {
        console.error("Sync failed", e);
        toast(`Failed → Google: ${item.type} / ${item.flightName} — ${e.message}`);
      }
    }
    if (success === queue.length) { clearQueue(); toast("All items synced."); }
    else toast("Some items failed; remaining in queue.");
  }

  function bindEvents() {
    el.btnGoogle?.addEventListener("click", signInWithGoogle);
    el.btnMicrosoft?.addEventListener("click", signInWithMicrosoft);

    el.btnSaveSettings?.addEventListener("click", saveSettings);
    el.provider?.addEventListener("change", (e) => {
      const v = e.target.value;
      setHidden(el.providerGoogle, v !== "google");
      setHidden(el.providerMicrosoft, v !== "microsoft");
    });

    el.btnNowStart?.addEventListener("click", () => el.startTime.value = localNowForInput());
    el.btnGPSStart?.addEventListener("click", getGPSForStart);
    el.btnQueueStart?.addEventListener("click", queueStart);

    el.btnNowEnd?.addEventListener("click", () => el.endTime.value = localNowForInput());
    el.btnQueueEnd?.addEventListener("click", queueEnd);

    el.btnShowQueue?.addEventListener("click", showQueue);
    el.btnClearQueue?.addEventListener("click", clearQueue);
    el.btnSync?.addEventListener("click", syncQueue);
  }

  function init() {
    populateTimezones();
    loadSettings();
    el.startTime.value = localNowForInput();
    el.endTime.value = "";
    const email = S.get("user_email","");
    updateSignedInUI(email ? `Signed in as ${email}` : "Not signed in");
    bindEvents();
    log(`${CONFIG.appName} v${CONFIG.version} ready.`);
    if (!navigator.onLine) log("Offline: queue entries and sync later.");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
