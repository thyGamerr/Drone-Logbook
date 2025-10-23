const CACHE = 'dlb-v1';
const ASSETS = [
  '/', '/index.html', '/styles.css', '/app.js', '/config.js', '/timezones.js', '/manifest.json'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e=>{
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const fetchPromise = fetch(e.request).then(res=>{
        caches.open(CACHE).then(c=>c.put(e.request, res.clone()));
        return res;
      }).catch(()=>cached || Response.error());
      return cached || fetchPromise;
    })
  );
});
