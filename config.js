// config.js
// Configuration for Drone LogBook (PWA)
// Handles login providers, timezone defaults, and redirect URLs for Google/Microsoft sign-in.

export const APP_CONFIG = {
  appName: "Drone LogBook",
  version: "1.0.0",
  defaultTimezone: "America/Vancouver",
  // URL of your hosted web app (GitHub Pages)
  redirectUri: "https://thygamerr.github.io/Drone-Logbook/",
  storageKeyPrefix: "drone_logbook_"
};

// OAuth client configurations for supported login providers
export const AUTH_CONFIG = {
  google: {
    clientId: "314985765441-64a7gf2b9vvvesv6tc8ocngn24pej827.apps.googleusercontent.com",
    redirectUri: "https://thygamerr.github.io/Drone-Logbook/",
    scopes: "openid email profile",
    authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token"
  },
  microsoft: {
    // Microsoft sign-in can be added later once your Azure app is registered
    clientId: "YOUR_MICROSOFT_CLIENT_ID_HERE",
    redirectUri: "https://thygamerr.github.io/Drone-Logbook/",
    scopes: "openid email profile User.Read",
    authEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token"
  }
};

// Utility to choose the correct provider dynamically
export function getAuthProvider(providerName) {
  switch (providerName.toLowerCase()) {
    case "google":
      return AUTH_CONFIG.google;
    case "microsoft":
      return AUTH_CONFIG.microsoft;
    default:
      throw new Error("Unknown provider: " + providerName);
  }
}
