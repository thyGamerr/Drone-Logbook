// config.js — Configuration for Drone LogBook (Easy Mode: direct Google Sheets)

window.APP_CONFIG = {
  appName: "Drone LogBook",
  version: "1.0.0",
  defaultTimezone: "America/Vancouver",
  storageKeyPrefix: "drone_logbook_",
  redirectUri: "https://thygamerr.github.io/Drone-Logbook/",
};

window.AUTH_CONFIG = {
  google: {
    // your real Client ID:
    clientId: "314985765441-64a7gf2b9vvvesv6tc8ocgn24pej827.apps.googleusercontent.com",
    // add Sheets + Drive scopes so the app can create/append to your sheet
    scopes: [
      "openid", "email", "profile",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file"
    ].join(" ")
  },
  microsoft: {
    clientId: "",
    scopes: "openid email profile User.Read"
  },
};
