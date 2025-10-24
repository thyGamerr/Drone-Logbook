// config.js
// Configuration for Drone LogBook authentication and settings

window.APP_CONFIG = {
  appName: "Drone LogBook",
  version: "1.0.0",
  defaultTimezone: "America/Vancouver",
  storageKeyPrefix: "drone_logbook_",
  redirectUri: "https://thygamerr.github.io/Drone-Logbook/",
};

window.AUTH_CONFIG = {
  google: {
    clientId: "314985765441-64a7gf2b9vvvesv6tc8ocngn24pej827.apps.googleusercontent.com",
    scopes: "openid email profile https://www.googleapis.com/auth/userinfo.email",
  },
  microsoft: {
    clientId: "",
    scopes: "openid email profile User.Read",
  },
};
