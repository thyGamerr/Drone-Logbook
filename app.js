// app.js
(() => {
  const CFG = window.APP_CONFIG;
  const AUTH = window.AUTH_CONFIG;

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    btnGoogle: $("btn-google"),
    btnMicrosoft: $("btn-microsoft"),
    signedInAs: $("signed-in-as"),

    provider: $("provider"),
    providerGoogle: $("provider-google"),
    providerMicrosoft: $("provider-microsoft"),
    googleEndpoint: $("google-endpoint"),
    btnSaveSettings: $("btn-save-settings"),

    logConsole: $("log-console")
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
    set(name, value) {
      localStorage.setItem(k(name), JSON.stringify(value));
    },
    remove(name) {
      localStorage.removeItem(k(name));
    }
  };

  // ---------- Logging ----------
  function log(line = "") {
    const ts = new Date().toLocaleTimeString();
    el.logConsole.textContent += `[${ts}] ${line}\n`;
    el.logConsole.scrollTop = el.logConsole.scrollHeight;
  }

  function toast(line) { log(line); }

  function setHidden(node, hidden) {
    node.classList.toggle("hidden", hidden);
  }

  function updateSignedInUI(text) {
    el.signedInAs.textContent = text || "Not signed in";
  }

  // ---------- Settings ----------
  function loadSettings() {
    const provider = S.get("provider", "");
    el.provider.value = provider || "";

    el.googleEndpoint.value = S.get("google_endpoint", "") || "";

    setHidden(el.providerGoogle, provider !== "google");
    setHidden(el.providerMicrosoft, provider !== "microsoft");
  }

  function saveSettings() {
    const provider = el.provider.value || "";
    S.set("provider", provider);
    S.set("google_endpoint", el.googleEndpoint.value.trim());

    setHidden(el.providerGoogle, provider !== "google");
    setHidden(el.providerMicrosoft, provider !== "microsoft");

    toast("Settings saved.");
  }

  // ---------- GOOGLE SIGN-IN (GIS) ----------
  function signInWithGoogle() {
    try {
      if (!window.google || !google.accounts || !google.accounts.oauth2) {
        alert("Google Identity Services SDK didn't load.");
        return;
      }
      const clientId = AUTH.google?.clientId;
      if (!clientId || clientId === "YOUR_GOOGLE_CLIENT_ID") {
        alert("Missing Google Client ID in config.js");
        return;
      }

      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: AUTH.google.scopes || "openid email profile",
        callback: (response) => {
          if (!response || !response.access_token) {
            console.error("Google sign-in: no access token", response);
            alert("Google sign-in failed (no token).");
            return;
          }
          // fetch profile
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
              toast("Google sign-in OK.");
            })
            .catch(e => {
              console.error("Fetch Google profile failed", e);
              alert("Signed in, but failed to fetch Google profile.");
            });
        }
      });

      tokenClient.requestAccessToken({ prompt: "consent" });
    } catch (e) {
      console.error(e);
      alert("Google sign-in error (see console).");
    }
  }

  // ---------- MICROSOFT SIGN-IN (MSAL) ----------
  function signInWithMicrosoft() {
    try {
      const ms = AUTH.microsoft;
      if (!ms || !ms.clientId || !ms.tenantId) {
        alert("Microsoft config missing in config.js");
        return;
      }
      if (!window.msal || !window.msal.PublicClientApplication) {
        alert("MSAL Browser SDK didn't load.");
        return;
      }

      const msalInstance = new msal.PublicClientApplication({
        auth: {
          clientId: ms.clientId,
          authority: ms.authority,
          redirectUri: ms.redirectUri
        },
        cache: {
          cacheLocation: "sessionStorage",
          storeAuthStateInCookie: false
        }
      });

      const loginRequest = {
        scopes: ms.scopes,
        prompt: "select_account"
      };

      msalInstance.loginPopup(loginRequest)
        .then(loginResponse => {
          return msalInstance.acquireTokenSilent({
            account: loginResponse.account,
            scopes: ms.scopes
          }).catch(() => msalInstance.acquireTokenPopup({ scopes: ms.scopes }));
        })
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
          toast("Microsoft sign-in OK.");
        })
        .catch(err => {
          console.error("MS login/token error", err);
          alert("Microsoft sign-in failed. See console.");
        });
    } catch (e) {
      console.error(e);
      alert("Microsoft sign-in error (see console).");
    }
  }

  // Optional quick test: fetch /me from Graph
  async function msGraphMe() {
    const token = S.get("ms_access_token", "");
    if (!token) return alert("No Microsoft token yet.");
    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    console.log("Graph /me:", data);
    toast("Fetched /me from Microsoft Graph (check console).");
  }
  // Expose to console if you want to test
  window.msGraphMe = msGraphMe;

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
  }

  // ---------- Init ----------
  function init() {
    loadSettings();

    const email = S.get("user_email", "");
    updateSignedInUI(email ? `Signed in as ${email}` : "Not signed in");

    bindEvents();
    log(`${CFG.appName} v${CFG.version} ready.`);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
