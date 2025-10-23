// config.js — public config (safe for GitHub Pages)
export const APP_CONFIG = {
  appName: "Drone LogBook",
  version: "1.0.0",
  defaultTimezone: "America/Vancouver",
  redirectUri: "https://thygamerr.github.io/Drone-Logbook/",
  storageKeyPrefix: "drone_logbook_"
};

export const AUTH_CONFIG = {
  google: {
    // Replace with your real Google Client ID
    clientId: "314985765441-64a7gf2b9vvvesv6tc8ocngn24pej827.apps.googleusercontent.com",
    scopes: "openid email profile"
  },
  microsoft: {
    // Fill later when Azure app is created
    clientId: "YOUR_MICROSOFT_CLIENT_ID_HERE",
    scopes: "openid email profile User.Read"
  }
};
