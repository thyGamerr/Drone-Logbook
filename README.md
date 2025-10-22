# Drone LogBook (PWA)

Offline-first drone logbook with Google **or** Microsoft sign-in and per-user storage.

## Quick start
1. Fill values in `config.js`:
   - `GOOGLE_CLIENT_ID` (Google Identity Services)
   - `MS_CLIENT_ID` (Azure App Registration)
2. For Google users, paste your Apps Script endpoint in Settings (in the app UI).
3. For Microsoft users, paste the OneDrive `driveItemId` and table name.

## Deploy
- Netlify/Vercel/GitHub Pages: static site (no build step needed).

## Use
- Sign in with Google or Microsoft.
- Choose provider + timezone in Settings.
- Queue “Start” and “End” flights offline.
- Press **Sync** when online.
