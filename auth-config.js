window.APP_CONFIG = {
  appName: "Drone LogBook",
  version: "1.0.0",
  storageKeyPrefix: "drone_logbook_"
};

window.AUTH_CONFIG = {
  // --- GOOGLE LOGIN ---
  google: {
    clientId: "314985765441-64a7gf2b9vvvesv6tc8ocngn24pej827.apps.googleusercontent.com",
    scopes: "openid email profile"
  },

  // --- MICROSOFT LOGIN ---
  microsoft: {
    clientId: "54598063-7dcf-4a6e-9340-5537c1974dc4", // Application (client) ID
    tenantId: "553965ce-fc07-4db9-b229-9040c2431e77", // Directory (tenant) ID
    authority: "https://login.microsoftonline.com/553965ce-fc07-4db9-b229-9040c2431e77",
    redirectUri: "https://thygamerr.github.io/Drone-Logbook/",
    scopes: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "User.Read",
      "Files.ReadWrite.All"
    ]
  }
};
