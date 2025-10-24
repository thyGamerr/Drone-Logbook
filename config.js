// config.js — Configuration for Drone LogBook

export const APP_CONFIG = {
  appName: "Drone LogBook",
  version: "1.0.0",
  defaultTimezone: "America/Vancouver",
  redirectUri: "https://thygamerr.github.io/Drone-Logbook/",
  storageKeyPrefix: "drone_logbook_"
};

export const AUTH_CONFIG = {
  google: {
    clientId: "314985765441-64a7gf2b9vvvesv6tc8ocgn24pej827.apps.googleusercontent.com", // your actual Google Client ID
    scopes: "openid email profile"
  },
  microsoft: {
    clientId: "",
    scopes: "openid email profile User.Read"
  }
};
